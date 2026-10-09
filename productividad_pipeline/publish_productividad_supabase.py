"""Publica el histórico diario de productividad en Supabase."""
from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path

import requests


ROOT = Path(__file__).resolve().parent


def require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Falta la variable de entorno {name}.")
    return value


def supabase_request(method: str, url: str, headers: dict[str, str], **kwargs):
    response = requests.request(method, url, headers=headers, timeout=60, **kwargs)
    if not response.ok:
        raise RuntimeError(f"Supabase {method} {url} fallo {response.status_code}: {response.text[:500]}")
    return response


def publish(payload: dict) -> None:
    base_url = require_env("SUPABASE_URL").rstrip("/")
    service_key = require_env("SUPABASE_SERVICE_ROLE_KEY")
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }
    rows = []
    for cell in payload.get("celdas", []):
        day = str(cell.get("dia") or "")
        if len(day) != 10:
            continue
        rows.append({
            "anio": int(day[:4]),
            "dia": day,
            "usuario": str(cell.get("usuario") or "(SIN USUARIO)"),
            "cargo": cell.get("cargo"),
            "turno": cell.get("turno"),
            "horas": cell.get("horas", 0),
            "tareas": cell.get("tareas", 0),
            "cajas": cell.get("cajas", 0),
            "cajas_sueltas": cell.get("cajas_sueltas", 0),
            "pallets": cell.get("pallets", 0),
            "unidades_productivas": cell.get("unidades_productivas", 0),
            "volumen_m3": cell.get("volumen_m3", 0),
            "peso_tn": cell.get("peso_tn", 0),
            "ubicaciones": cell.get("ubicaciones", 0),
            "detalle": cell.get("detalle", 0),
            "t_std_min": cell.get("t_std_min", 0),
            "t_real_min": cell.get("t_real_min", 0),
            "efic": cell.get("efic", 0),
            "actualizado_en": datetime.now(timezone.utc).isoformat(),
        })
    if rows:
        supabase_request(
            "POST",
            f"{base_url}/rest/v1/productividad_persona_dia?on_conflict=anio,dia,usuario",
            {**headers, "Prefer": "resolution=merge-duplicates,return=minimal"},
            json=rows,
        )

    meta = payload.get("meta") or {}
    rango = meta.get("rango_fechas") or [None, None]
    start, end = rango[0], rango[1]
    year = int(str(start or end or datetime.now().year)[:4])
    snapshot_key = f"{start or 'sin-fecha'}:{end or 'sin-fecha'}"
    snapshot = {
        "snapshot_key": snapshot_key,
        "anio": year,
        "rango_inicio": start,
        "rango_fin": end,
        "tareas_total": meta.get("tareas_total"),
        "tareas_elegibles": meta.get("tareas_elegibles"),
        "tareas_excepcion": meta.get("tareas_excepcion"),
        "personas": meta.get("personas"),
        "dias": meta.get("dias"),
        "horas_totales": meta.get("horas_totales"),
        "meta": meta,
        "actualizado_en": datetime.now(timezone.utc).isoformat(),
    }
    supabase_request(
        "POST",
        f"{base_url}/rest/v1/productividad_snapshots?on_conflict=snapshot_key",
        {**headers, "Prefer": "resolution=merge-duplicates,return=minimal"},
        json=[snapshot],
    )
    print(f"[OK] Supabase: {len(rows)} filas persona-dia, snapshot {snapshot_key}")


def delete_year(year: int) -> None:
    base_url = require_env("SUPABASE_URL").rstrip("/")
    service_key = require_env("SUPABASE_SERVICE_ROLE_KEY")
    headers = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}
    supabase_request(
        "DELETE",
        f"{base_url}/rest/v1/productividad_persona_dia?anio=eq.{year}",
        headers,
    )
    supabase_request(
        "DELETE",
        f"{base_url}/rest/v1/productividad_snapshots?anio=eq.{year}",
        headers,
    )
    print(f"[OK] Supabase: eliminado el histórico del año {year}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", default=str(ROOT / "dash_data.json"))
    parser.add_argument("--delete-year", type=int)
    args = parser.parse_args()
    if args.delete_year:
        delete_year(args.delete_year)
        return 0
    publish(json.loads(Path(args.json).read_text(encoding="utf-8")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
