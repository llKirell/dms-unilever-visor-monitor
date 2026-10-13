"""Exporta el histórico anual de productividad para el dashboard estático."""
from __future__ import annotations

import argparse
import json
import os
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import requests


ROOT = Path(__file__).resolve().parents[1]
PAGE_SIZE = 1000
TIMEZONE = ZoneInfo("America/Lima")


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


def read_pages(base_url: str, table: str, query: str, headers: dict[str, str]) -> list[dict]:
    rows: list[dict] = []
    offset = 0
    while True:
        page_headers = {
            **headers,
            "Range-Unit": "items",
            "Range": f"{offset}-{offset + PAGE_SIZE - 1}",
        }
        page = supabase_request("GET", f"{base_url}/rest/v1/{table}?{query}", page_headers).json()
        if not page:
            break
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description="Genera el JSON público de filtros históricos.")
    parser.add_argument("--year", type=int, default=datetime.now(TIMEZONE).year)
    parser.add_argument("--out", default=str(ROOT / "productividad" / "historico_data.json"))
    args = parser.parse_args()

    base_url = require_env("SUPABASE_URL").rstrip("/")
    service_key = require_env("SUPABASE_SERVICE_ROLE_KEY")
    headers = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}
    cell_fields = (
        "dia,usuario,cargo,turno,horas,tareas,cajas,cajas_sueltas,pallets,"
        "unidades_productivas,volumen_m3,peso_tn,ubicaciones,detalle,t_std_min,t_real_min,efic"
    )
    cells = read_pages(
        base_url,
        "productividad_persona_dia",
        f"anio=eq.{args.year}&select={cell_fields}&order=dia.asc,usuario.asc",
        headers,
    )
    targets = read_pages(
        base_url,
        "productividad_objetivos",
        f"anio=eq.{args.year}&select=metrica,turno,objetivo,amarillo_min,verde_min,horas_base,jornadas_base,criterio",
        headers,
    )
    familias = read_pages(
        base_url,
        "productividad_familia_dia",
        "anio=eq.{}&select=dia,turno,familia,cajas_sueltas,cajas&order=dia.asc,familia.asc".format(args.year),
        headers,
    )
    payload = {
        "anio": args.year,
        "actualizado_en": datetime.now(TIMEZONE).isoformat(),
        "celdas": cells,
        "familias": familias,
        "objetivos": targets,
    }
    output = Path(args.out)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[OK] Histórico público: {len(cells)} filas, {len(targets)} objetivos -> {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
