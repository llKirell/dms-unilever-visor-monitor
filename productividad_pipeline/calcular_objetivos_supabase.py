"""Calcula metas anuales ponderadas de productividad desde Supabase."""
from __future__ import annotations

import argparse
import os
from datetime import datetime, timezone

import requests


METRICS = {
    "unidades_productivas": "Unidades/h",
    "volumen_m3": "m³/h",
    "peso_tn": "Tn/h",
    "ubicaciones": "Ubic/h",
    "tareas": "Tareas/h",
}
PAGE_SIZE = 1000


def require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Falta la variable de entorno {name}.")
    return value


def supabase_request(method: str, url: str, headers: dict[str, str], **kwargs) -> requests.Response:
    response = requests.request(method, url, headers=headers, timeout=60, **kwargs)
    if not response.ok:
        raise RuntimeError(f"Supabase {method} {url} fallo {response.status_code}: {response.text[:500]}")
    return response


def read_year_rows(base_url: str, headers: dict[str, str], year: int) -> list[dict]:
    fields = "horas,tareas,unidades_productivas,volumen_m3,peso_tn,ubicaciones"
    url = f"{base_url}/rest/v1/productividad_persona_dia?anio=eq.{year}&select={fields}&order=dia.asc"
    rows: list[dict] = []
    offset = 0

    while True:
        page_headers = {
            **headers,
            "Range-Unit": "items",
            "Range": f"{offset}-{offset + PAGE_SIZE - 1}",
        }
        page = supabase_request("GET", url, page_headers).json()
        if not page:
            break
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return rows


def number(value: object) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def calculate_targets(rows: list[dict], year: int, yellow_ratio: float) -> list[dict]:
    valid_rows = [row for row in rows if number(row.get("horas")) > 0]
    total_hours = sum(number(row.get("horas")) for row in valid_rows)
    if not total_hours:
        raise RuntimeError(f"No hay horas válidas para calcular objetivos del año {year}.")

    now = datetime.now(timezone.utc).isoformat()
    criteria = "Promedio anual ponderado: total de métrica dividido entre horas válidas."
    targets = []
    for metric, label in METRICS.items():
        target = sum(number(row.get(metric)) for row in valid_rows) / total_hours
        targets.append({
            "anio": year,
            "metrica": metric,
            "turno": "TODOS",
            "objetivo": round(target, 4),
            "amarillo_min": round(target * yellow_ratio, 4),
            "verde_min": round(target, 4),
            "horas_base": round(total_hours, 3),
            "jornadas_base": len(valid_rows),
            "criterio": criteria,
            "actualizado_en": now,
        })
        print(f"[OK] {label}: meta {target:.4f} | amarillo desde {target * yellow_ratio:.4f}")
    return targets


def main() -> int:
    parser = argparse.ArgumentParser(description="Calcula objetivos anuales desde productividad_persona_dia.")
    parser.add_argument("--year", type=int, required=True)
    parser.add_argument("--yellow-ratio", type=float, default=0.85)
    args = parser.parse_args()
    if not 0 < args.yellow_ratio <= 1:
        raise ValueError("--yellow-ratio debe ser mayor que 0 y menor o igual a 1.")

    base_url = require_env("SUPABASE_URL").rstrip("/")
    service_key = require_env("SUPABASE_SERVICE_ROLE_KEY")
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }
    rows = read_year_rows(base_url, headers, args.year)
    print(f"[INFO] Filas anuales leídas: {len(rows)}")
    targets = calculate_targets(rows, args.year, args.yellow_ratio)
    supabase_request(
        "POST",
        f"{base_url}/rest/v1/productividad_objetivos?on_conflict=anio,metrica,turno",
        {**headers, "Prefer": "resolution=merge-duplicates,return=minimal"},
        json=targets,
    )
    print(f"[OK] Objetivos publicados: {len(targets)} para {args.year}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
