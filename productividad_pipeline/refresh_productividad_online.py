# -*- coding: utf-8 -*-
"""
Pipeline online de productividad Unilever.

Ejecuta el ciclo completo:
  1. Baja ReportTareas desde W4W usando DINET_W4W_COOKIE.
  2. Recalcula productividad.
  3. Genera dash_data.json.
  4. Copia el JSON al folder publico /productividad.

El HTML del visual ya consulta /productividad/dash_data.json cada 5 minutos,
por eso el Action normalmente solo necesita publicar el JSON actualizado.
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from datetime import date
from pathlib import Path
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
PIPELINE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = ROOT / "productividad"
DEFAULT_TZ = "America/Lima"


def run(cmd: list[str], *, cwd: Path = PIPELINE_DIR) -> None:
    printable = " ".join(str(part) for part in cmd)
    print(f"[..] {printable}", flush=True)
    env = dict(os.environ, PYTHONUTF8="1", PYTHONIOENCODING="utf-8")
    subprocess.check_call(cmd, cwd=cwd, env=env)


def month_bounds(month: str, tz_name: str) -> tuple[date, date]:
    today = date.today()
    try:
        today = __import__("datetime").datetime.now(ZoneInfo(tz_name)).date()
    except Exception:
        pass

    if month:
        year, month_num = [int(part) for part in month.split("-", 1)]
        start = date(year, month_num, 1)
        end = today if (today.year, today.month) == (year, month_num) else start.replace(day=28)
        if end.month != month_num:
            end = start
        while True:
            try:
                candidate = end.replace(day=end.day + 1)
            except ValueError:
                break
            if candidate.month != month_num:
                break
            end = candidate
        return start, end

    return today.replace(day=1), today


def main() -> int:
    parser = argparse.ArgumentParser(description="Refresca productividad online desde W4W.")
    parser.add_argument("--month", default="", help="Mes YYYY-MM. Default: mes actual Lima hasta hoy.")
    parser.add_argument("--timezone", default=DEFAULT_TZ)
    parser.add_argument("--chunk-days", type=int, default=7)
    parser.add_argument("--skip-fetch", action="store_true", help="Usa ReportTareas.xlsx existente.")
    parser.add_argument("--set-context", action="store_true", help="Fuerza contexto HUACHIPA/UNILEVER antes de consultar.")
    parser.add_argument("--publish-html", action="store_true", help="Tambien reemplaza waretrack.html publico.")
    args = parser.parse_args()

    start, end = month_bounds(args.month, args.timezone)
    print(f"[INFO] Rango operativo: {start}..{end}", flush=True)

    if not args.skip_fetch:
        if not os.getenv("DINET_W4W_COOKIE", "").strip():
            raise RuntimeError("Falta secret/env DINET_W4W_COOKIE para consultar W4W.")
        run([
            sys.executable,
            "fetch_tareas.py",
            "--desde",
            start.isoformat(),
            "--hasta",
            end.isoformat(),
            "--chunk-days",
            str(args.chunk_days),
            "--out",
            str(PIPELINE_DIR / "ReportTareas.xlsx"),
        ] + (["--set-context"] if args.set_context else []))

    if not (PIPELINE_DIR / "ReportTareas.xlsx").exists():
        raise FileNotFoundError("No existe ReportTareas.xlsx para recalcular productividad.")

    run([sys.executable, "build_waretrack.py", "--recompute"])

    source_json = PIPELINE_DIR / "dash_data.json"
    source_html = PIPELINE_DIR / "waretrack.html"
    if not source_json.exists():
        raise FileNotFoundError("No se genero dash_data.json.")

    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_json, PUBLIC_DIR / "dash_data.json")
    print(f"[OK] Publicado {PUBLIC_DIR / 'dash_data.json'}", flush=True)

    if args.publish_html:
        if not source_html.exists():
            raise FileNotFoundError("No se genero waretrack.html.")
        shutil.copy2(source_html, PUBLIC_DIR / "waretrack.html")
        print(f"[OK] Publicado {PUBLIC_DIR / 'waretrack.html'}", flush=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
