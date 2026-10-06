# -*- coding: utf-8 -*-
"""
fetch_tareas.py — Ingesta directa de ReportTareas desde el w4w por COOKIE.
=========================================================================

Standalone (solo requiere `requests` + `pandas`): NO depende de api_server.py.
Baja las tareas de la cuenta Unilever/KCC (CD Huachipa) por una ventana de
fechas y, con --run, encadena el motor de productividad.

Autenticacion
-------------
Por COOKIE del w4w (rapida para consultas internas). Se toma de:
  1. --cookie-file  (TXT con la cookie en una o varias lineas; se une)
  2. env DINET_W4W_COOKIE
La cookie se saca de Chrome logueado -> F12 -> Network -> llamada 'Consultar'
-> header 'Cookie'. CADUCA: si la respuesta no es JSON (o redirige a login),
refrescarla.

Contexto HUACHIPA / UNILEVER
----------------------------
Si la cookie no trae el contexto de cuenta/CD, pasar --set-context para fijarlo
con los 3 POST (RedirectSystem -> ListarCuentas -> AssignmentCredentials).

Payload de fechas (CONFIRMADO)
------------------------------
El endpoint Tareas/Tarea/Consultar usa `FechaTareaIni` / `FechaTareaFin` en
formato dd/mm/aaaa (igual que la UI del w4w). El motor ya acepta el camelCase y
las fechas .NET /Date(ms)/ que devuelve la API.

Uso
---
    # Baja un rango y corre el motor
    py fetch_tareas.py --desde 2026-09-01 --hasta 2026-09-30 \
        --cookie-file cookie_w4w.txt --set-context --run

    # Rango largo en tramos (menos timeout / menos peso)
    py fetch_tareas.py --desde 2026-01-01 --hasta 2026-10-05 \
        --cookie-file cookie_w4w.txt --set-context --chunk-days 31 --run

    # Solo descargar (sin motor), a un archivo explicito
    py fetch_tareas.py --desde 2026-09-01 --hasta 2026-09-30 --out ReportTareas.xlsx
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

import pandas as pd
import requests


BASE_DIR = Path(__file__).resolve().parent

# --- Endpoints y codigos fijos (del semaforo/context.py y w4w_monthly_store) ---
APP_BASE   = "https://app.dinet.com.pe"
W4W_BASE   = "https://w4w.dinet.com.pe/AppWeb"
URL_REDIRECT = f"{APP_BASE}/Home/RedirectSystem"
URL_LISTAR   = f"{W4W_BASE}/IngresoSistema/ListarCuentas"
URL_ASSIGN   = f"{W4W_BASE}/IngresoSistema/AssignmentCredentials"
URL_TAREAS   = f"{W4W_BASE}/Tareas/Tarea/Consultar"

SYSTEM_CODE  = "W4WWEB"
DC_CODE, DC_NAME       = "HU", "HUACHIPA"
ACCOUNT_CODE, ACCOUNT  = "I1002", "UNILEVER"

# User-Agent realista: desde IPs de datacenter el w4w exige UA de navegador real.
USER_AGENT = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36")


# --------------------------------------------------------------------------- #
# Fechas
# --------------------------------------------------------------------------- #
def parse_iso(value: str) -> date:
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"Fecha esperada YYYY-MM-DD: {value}") from exc


def ddmmyyyy(d: date) -> str:
    return d.strftime("%d/%m/%Y")


def date_chunks(start: date, end: date, chunk_days: int) -> list[tuple[date, date]]:
    if chunk_days <= 0:
        return [(start, end)]
    out, cursor = [], start
    while cursor <= end:
        chunk_end = min(end, cursor + timedelta(days=chunk_days - 1))
        out.append((cursor, chunk_end))
        cursor = chunk_end + timedelta(days=1)
    return out


# --------------------------------------------------------------------------- #
# Cookie / sesion
# --------------------------------------------------------------------------- #
def read_cookie(cookie_file: str) -> str:
    if cookie_file:
        path = Path(cookie_file)
        if not path.exists():
            raise FileNotFoundError(f"No existe cookie file: {path}")
        raw = path.read_text(encoding="utf-8-sig").strip().lstrip("﻿")
        lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]
        if lines and lines[0].lower().strip("*: ") in {"cookie", "cookies"}:
            lines = lines[1:]
        cookie = " ".join(lines).strip()
        if cookie:
            return cookie
    cookie = os.getenv("DINET_W4W_COOKIE", "").strip()
    if cookie:
        return cookie
    raise RuntimeError("Falta la cookie: usa --cookie-file o la env DINET_W4W_COOKIE.")


def parse_cookie_string(cookie: str) -> dict[str, str]:
    jar: dict[str, str] = {}
    for part in cookie.split(";"):
        part = part.strip()
        if not part or "=" not in part:
            continue
        name, value = part.split("=", 1)
        jar[name.strip()] = value.strip()
    return jar


def build_session(cookie: str) -> requests.Session:
    s = requests.Session()
    s.trust_env = False
    s.headers.update({
        "User-Agent": USER_AGENT,
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Content-Type": "application/json; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "Origin": "https://w4w.dinet.com.pe",
    })
    s.cookies.update(parse_cookie_string(cookie))
    return s


def post_json(session: requests.Session, url: str, payload: dict,
              referer: str = W4W_BASE, timeout: int = 120) -> Any:
    resp = session.post(url, data=json.dumps(payload),
                        headers={"Referer": referer}, timeout=timeout)
    resp.raise_for_status()
    ctype = resp.headers.get("Content-Type", "")
    text = resp.text.strip()
    if "application/json" not in ctype and not text.startswith(("{", "[")):
        raise RuntimeError(
            "El w4w devolvio HTML/login en vez de JSON: la cookie o sesion expiro. "
            "Refresca la cookie (F12 -> Network -> Consultar -> header Cookie)."
        )
    return resp.json()


def set_context(session: requests.Session) -> None:
    """Fija el contexto HUACHIPA/UNILEVER (3 POST en orden)."""
    post_json(session, URL_REDIRECT, {"SystemCode": SYSTEM_CODE},
              referer=f"{APP_BASE}/Home/Index/")
    post_json(session, URL_LISTAR, {"CodigoCentroDistribucion": DC_CODE})
    post_json(session, URL_ASSIGN, {
        "distributionCenterCode": DC_CODE, "distributionCenter": DC_NAME,
        "accountCode": ACCOUNT_CODE, "account": ACCOUNT,
    })


# --------------------------------------------------------------------------- #
# Consulta de tareas
# --------------------------------------------------------------------------- #
def payload_tareas(start: date, end: date) -> dict:
    """Payload del endpoint Tareas/Tarea/Consultar (campos de fecha confirmados)."""
    return {
        "NroTarea": "", "EstadoTarea": "", "Prioridad": "", "NroEnvio": "",
        "FechaTareaIni": ddmmyyyy(start), "FechaTareaFin": ddmmyyyy(end),
        "CodigoOperacion": "", "UsuarioAsignado": "", "UsuarioEjecucion": "",
        "NroPicking": "", "FechaGeneracionIni": "", "FechaGeneracionFin": "",
        "NroPedidoCliente": "", "CodigoCliente": "", "CodigoMotivo": "",
        "CodigoTipoCliente": "", "Destino": "", "CodigoUbigeo": "",
        "NroCamion": "", "NroPlaca": "", "CodigoArticulo": "", "CodigoLinea": "",
        "CodigoLPN": "", "Stage": "", "CodigoArea": "", "CodigoUbicacionOrigen": "",
        "ListaRutas": [], "CodigoCaracteristicaArticulo1": "",
        "CodigoCaracteristicaArticulo2": "", "CodigoCaracteristicaArticulo3": "",
        "CodigoCaracteristicaArticulo4": "", "CodigoSeccion": "",
    }


def extract_rows(raw: Any) -> list[dict]:
    """
    Normaliza la respuesta: el w4w suele envolver las filas en una llave
    (Data/Datos/Items/Rows/Result/Lista...). Devuelve la lista de dicts.
    """
    if isinstance(raw, list):
        return raw
    if isinstance(raw, dict):
        for key in ("Data", "Datos", "data", "Items", "Rows", "Result",
                    "Resultado", "Lista", "ListaTareas", "Tareas", "d"):
            val = raw.get(key)
            if isinstance(val, list):
                return val
            if isinstance(val, dict):  # a veces anida otra vez
                inner = extract_rows(val)
                if inner:
                    return inner
        # ultimo recurso: la primera lista de dicts que aparezca
        for val in raw.values():
            if isinstance(val, list) and (not val or isinstance(val[0], dict)):
                return val
    return []


def fetch_tareas(session: requests.Session, start: date, end: date) -> list[dict]:
    raw = post_json(session, URL_TAREAS, payload_tareas(start, end),
                    referer=f"{W4W_BASE}/Tareas/Tarea/")
    rows = extract_rows(raw)
    return rows


def dedupe(rows: list[dict]) -> list[dict]:
    keys = ["NumeroTarea", "NroTarea", "Nro Tarea", "Numero Tarea"]
    seen, out = set(), []
    for i, r in enumerate(rows):
        k = next((str(r[c]).strip() for c in keys if r.get(c) not in (None, "")), f"row-{i}")
        if k in seen:
            continue
        seen.add(k)
        out.append(r)
    return out


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def main() -> int:
    ap = argparse.ArgumentParser(description="Ingesta de ReportTareas del w4w por cookie.")
    ap.add_argument("--desde", required=True, type=parse_iso, help="YYYY-MM-DD")
    ap.add_argument("--hasta", required=True, type=parse_iso, help="YYYY-MM-DD")
    ap.add_argument("--cookie-file", default="", help="TXT con la cookie del w4w.")
    ap.add_argument("--set-context", action="store_true",
                    help="Fija contexto HUACHIPA/UNILEVER (3 POST) antes de consultar.")
    ap.add_argument("--chunk-days", type=int, default=0,
                    help="Baja en tramos de N dias (util para rangos largos).")
    ap.add_argument("--out", default="", help="Salida .xlsx (default ReportTareas_<desde>_<hasta>.xlsx).")
    ap.add_argument("--run", action="store_true", help="Encadena motor_productividad.py al terminar.")
    ap.add_argument("--maestro-usuario", default=str(BASE_DIR / "maestro_usuario.xlsx"))
    ap.add_argument("--horas-max", type=float, default=16.0)
    ap.add_argument("--umbral-pallet", type=float, default=60.0)
    args = ap.parse_args()

    if args.hasta < args.desde:
        print("[ERROR] --hasta es anterior a --desde", file=sys.stderr)
        return 2

    cookie = read_cookie(args.cookie_file)
    session = build_session(cookie)
    if args.set_context:
        print("[..] Fijando contexto HUACHIPA/UNILEVER")
        set_context(session)

    all_rows: list[dict] = []
    for cs, ce in date_chunks(args.desde, args.hasta, args.chunk_days):
        rows = fetch_tareas(session, cs, ce)
        print(f"[OK] {cs}..{ce}: {len(rows)} tareas")
        all_rows.extend(rows)
    all_rows = dedupe(all_rows)

    if not all_rows:
        print("[WARN] 0 tareas devueltas. Revisa la ventana de fechas o el contexto.",
              file=sys.stderr)

    out = Path(args.out) if args.out else (
        BASE_DIR / f"ReportTareas_{args.desde:%Y%m%d}_{args.hasta:%Y%m%d}.xlsx")
    pd.DataFrame(all_rows).to_excel(out, index=False)
    print(f"[OK] ReportTareas -> {out} ({len(all_rows)} filas)")

    if args.run:
        cmd = [sys.executable, str(BASE_DIR / "motor_productividad.py"),
               "--tareas", str(out),
               "--maestro-usuario", args.maestro_usuario,
               "--horas-max", str(args.horas_max),
               "--umbral-pallet", str(args.umbral_pallet),
               "--out-json", str(BASE_DIR / "productividad.json"),
               "--out-xlsx", str(BASE_DIR / "productividad.xlsx")]
        print("[..] Corriendo motor:", " ".join(cmd))
        env = dict(os.environ, PYTHONUTF8="1")
        return subprocess.call(cmd, env=env)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
