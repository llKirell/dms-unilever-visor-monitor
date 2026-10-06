# -*- coding: utf-8 -*-
"""
build_waretrack.py — Genera WareTrack, el dashboard SaaS de productividad.
=========================================================================

Lee el grano atomico `por_persona_dia` de productividad.json (una fila por
persona x dia, con sus SUMAS crudas) y lo embebe en un HTML autocontenido. El
front recalcula la razon de totales (Σnum/Σhoras, o Σt_std/Σt_real para la
eficiencia) para cualquier combinacion de filtros, sin perder exactitud.

Uso:
    py build_waretrack.py                      # usa productividad.json
    py build_waretrack.py --recompute          # corre el motor antes
    py build_waretrack.py --json otra.json --out waretrack.html
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent


def recompute() -> None:
    cmd = [sys.executable, str(BASE_DIR / "motor_productividad.py"),
           "--tareas", str(BASE_DIR / "ReportTareas.xlsx"),
           "--maestro-usuario", str(BASE_DIR / "maestro_usuario.xlsx"),
           "--out-json", str(BASE_DIR / "productividad.json"),
           "--out-xlsx", str(BASE_DIR / "productividad.xlsx")]
    flujo = BASE_DIR / "ReportFlujoSalidas.xlsx"
    maestro_articulo = BASE_DIR / "maestro_articulo.xlsx"
    if flujo.exists():
        cmd.extend(["--flujo", str(flujo)])
        if maestro_articulo.exists():
            cmd.extend(["--maestro-articulo", str(maestro_articulo)])
    import os
    subprocess.check_call(cmd, env=dict(os.environ, PYTHONUTF8="1"))


def build_dash_data(prod: dict) -> dict:
    """Subset embebible: meta + comparativo + grano atomico persona x dia."""
    keep_cell = ("usuario", "dia", "cargo", "turno", "horas", "tareas",
                 "cajas", "cajas_sueltas", "pallets", "volumen_m3", "peso_tn",
                 "ubicaciones", "detalle", "t_std_min", "t_real_min", "efic")
    celdas = [{k: r.get(k) for k in keep_cell if k in r}
              for r in prod.get("por_persona_dia", [])]
    meta = prod.get("meta", {})
    return {
        "meta": {
            "rango_fechas": meta.get("rango_fechas"),
            "personas": meta.get("personas"),
            "dias": meta.get("dias"),
            "tareas_total": meta.get("tareas_total"),
            "tareas_elegibles": meta.get("tareas_elegibles"),
            "tareas_excepcion": meta.get("tareas_excepcion"),
            "horas_totales": meta.get("horas_totales"),
            "umbral_pallet_cajas_por_ubic": meta.get("umbral_pallet_cajas_por_ubic"),
            "modelo_estandar": meta.get("modelo_estandar"),
            "cobertura": meta.get("cobertura"),
            "flujo": meta.get("flujo"),
        },
        "comparativo": prod.get("comparativo"),
        "mix": prod.get("mix"),
        "por_familia": prod.get("por_familia", []),
        "celdas": celdas,
    }


HTML = r"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WareTrack — Productividad Picking Unilever/KCC</title>
<style>
:root{
  --accent:#1f6feb; --accent-2:#2da44e; --warn:#d4a72c; --bad:#cf222e;
  --bg:#f6f8fa; --panel:#ffffff; --panel-2:#f0f3f6; --ink:#1f2328;
  --muted:#656d76; --line:#d0d7de; --shadow:0 1px 3px rgba(31,35,40,.08),0 8px 24px rgba(31,35,40,.06);
  --chart-grid:#e6ebf1;
}
:root:not([data-theme="light"]){}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --bg:#0d1117; --panel:#161b22; --panel-2:#1c2330; --ink:#e6edf3;
  --muted:#8b949e; --line:#30363d; --shadow:0 1px 3px rgba(1,4,9,.4),0 8px 24px rgba(1,4,9,.5);
  --accent:#4493f8; --accent-2:#3fb950; --warn:#d29922; --bad:#f85149; --chart-grid:#21262d;
}}
:root[data-theme="dark"]{
  --bg:#0d1117; --panel:#161b22; --panel-2:#1c2330; --ink:#e6edf3;
  --muted:#8b949e; --line:#30363d; --shadow:0 1px 3px rgba(1,4,9,.4),0 8px 24px rgba(1,4,9,.5);
  --accent:#4493f8; --accent-2:#3fb950; --warn:#d29922; --bad:#f85149; --chart-grid:#21262d;
}
*{box-sizing:border-box}
html,body{height:100%;margin:0;overflow:hidden}
body{background:var(--bg);color:var(--ink);
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}
/* tablero de pantalla completa (TV): llena el viewport, sin scroll global */
.wrap{width:100vw;height:100vh;padding:clamp(10px,1.4vh,20px) clamp(14px,1.6vw,34px);
  display:grid;grid-template-rows:auto 1fr;gap:clamp(8px,1.1vh,14px);overflow:hidden}
header.app{display:flex;align-items:center;gap:clamp(10px,1.4vw,22px);flex-wrap:nowrap;min-height:0}
.logo{display:flex;align-items:center;gap:10px}
.logo .mk{width:clamp(34px,2.6vw,52px);height:clamp(34px,2.6vw,52px);border-radius:9px;background:linear-gradient(135deg,var(--accent),var(--accent-2));
  display:grid;place-items:center;color:#fff;font-weight:800;font-size:clamp(17px,1.5vw,26px)}
.logo h1{font-size:clamp(17px,1.35vw,24px);margin:0;letter-spacing:.3px}
.logo .sub{font-size:11.5px;color:var(--muted);font-weight:600;letter-spacing:.4px;text-transform:uppercase}
.spacer{flex:1}
.rango{font-size:12.5px;color:var(--muted);text-align:right;line-height:1.5}
.theme-btn{border:1px solid var(--line);background:var(--panel);color:var(--muted);border-radius:8px;
  padding:7px 10px;cursor:pointer;font-size:13px}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 18px}
.chip{background:var(--panel);border:1px solid var(--line);border-radius:999px;padding:5px 11px;
  font-size:12px;color:var(--muted);box-shadow:var(--shadow)}
.chip b{color:var(--ink)}
.controls{display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end;background:var(--panel);
  border:1px solid var(--line);border-radius:12px;padding:14px 16px;box-shadow:var(--shadow);margin-bottom:18px}
.field{display:flex;flex-direction:column;gap:5px}
.field label{font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.6px}
select{background:var(--panel-2);border:1px solid var(--line);color:var(--ink);border-radius:8px;
  padding:8px 10px;font-size:13.5px;min-width:150px;font-weight:600}
.seg{display:flex;background:var(--panel-2);border:1px solid var(--line);border-radius:8px;overflow:hidden;flex-wrap:wrap}
.seg button{border:0;background:transparent;color:var(--muted);padding:clamp(6px,.9vh,10px) clamp(10px,1vw,18px);font-size:clamp(12px,.95vw,16px);cursor:pointer;font-weight:600}
.seg button.on{background:var(--accent);color:#fff}
.grid-kpi{display:grid;grid-template-columns:1fr;gap:12px;min-height:0}
.kpi{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:clamp(10px,1.4vh,18px) clamp(14px,1.2vw,20px);box-shadow:var(--shadow)}
.kpi .k{font-size:clamp(10px,.72vw,13px);font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.6px}
.kpi .v{font-size:30px;font-weight:800;line-height:1.05;margin-top:4px}
.kpi .u{font-size:clamp(9px,.68vw,12px);color:var(--muted);font-weight:600}
.kpi.hero{border-left:5px solid var(--accent);display:flex;flex-direction:column;justify-content:center;padding:clamp(8px,1.3vh,16px) clamp(12px,1.1vw,18px);height:100%}
.kpi.hero .k{font-size:clamp(9px,.65vw,12px)}
.kpi.hero .v{font-size:clamp(24px,2.6vw,42px)}
/* === LAYOUT: izquierda (banda + tendencia) | derecha (ranking a toda altura) === */
.layout{display:grid;grid-template-columns:1fr clamp(340px,34vw,640px);gap:clamp(8px,1vw,16px);min-height:0}
.left{display:grid;grid-template-rows:auto 1fr;gap:clamp(8px,1.1vh,14px);min-height:0}
.topband{display:flex;gap:clamp(7px,.8vw,13px);align-items:stretch;min-height:0}
.grid-kpi{flex:0 0 auto;display:flex}
.turno-mini{display:flex;flex-direction:column;gap:clamp(5px,.6vh,9px);flex:0 0 auto}
.mixcard{flex:0 1 auto;min-width:clamp(170px,14vw,250px)}
.famcard{flex:1 1 auto;min-width:clamp(210px,18vw,340px)}
.mini{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:clamp(5px,.8vh,11px) clamp(9px,.8vw,15px);box-shadow:var(--shadow);display:flex;flex-direction:column;justify-content:center;border-left:4px solid var(--accent);flex:1}
.mini.on{outline:2px solid var(--accent);outline-offset:-1px}
.mini:nth-child(2){border-left-color:var(--accent-2)}
.mini:nth-child(3){border-left-color:var(--warn)}
.mini .mk2{font-size:clamp(8px,.6vw,11px);font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.3px}
.mini .mv{font-size:clamp(14px,1.4vw,22px);font-weight:800;line-height:1.05;margin-top:1px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow);overflow:hidden;min-height:0;display:flex;flex-direction:column}
.card.ranking{height:100%}
.card.trend .body,.card.compact .body{flex:1;min-height:0}
.card.trend .body{padding:4px 12px 8px}
.card.trend svg{width:100%;height:100%}
.card.compact .body{padding:6px 12px 10px;overflow-y:auto}
.card h2{font-size:clamp(10px,.78vw,13px);margin:0;padding:clamp(6px,.9vh,12px) 14px 0;letter-spacing:.2px}
.card .hint{font-size:clamp(9px,.7vw,12px);color:var(--muted);padding:1px 14px 0}
.card .body{padding:12px 14px}
/* columna de ranking (turno activo / manual / top 15) */
.card.ranking{display:flex;flex-direction:column;min-height:0}
.rank-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:clamp(10px,1.3vh,16px) clamp(14px,1.2vw,20px) clamp(6px,.8vh,10px)}
.rank-ttl{display:flex;flex-direction:column;min-width:0}
.rank-ttl #rank-turno{font-size:clamp(14px,1.25vw,22px);font-weight:800;line-height:1.05}
.rank-ttl .rank-sub{font-size:clamp(10px,.75vw,13px);color:var(--muted);font-weight:600;margin-top:2px}
.rank-tn{text-align:right;line-height:1.05;white-space:nowrap}
.rank-tn b{display:block;font-size:clamp(15px,1.4vw,24px);font-weight:800;color:var(--accent-2)}
.rank-tn span{font-size:clamp(9px,.68vw,12px);color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.5px}
.rank-ctrl{margin:0 clamp(14px,1.2vw,20px) clamp(6px,.8vh,10px);align-self:flex-start}
.rank-ctrl button{padding:clamp(4px,.6vh,8px) clamp(8px,.8vw,14px);font-size:clamp(10px,.78vw,13px)}
.rank-list{flex:1;min-height:0;overflow-y:auto;padding:4px clamp(10px,1vw,16px) clamp(8px,1vh,12px)}
.rank-list::-webkit-scrollbar{width:9px}
.rank-list::-webkit-scrollbar-thumb{background:var(--line);border-radius:8px}
/* filas del ranking (columna derecha): mas grandes, legibles de lejos */
.rank-list .ranklist{gap:clamp(5px,.75vh,11px)}
.rank-list .rankrow{grid-template-columns:clamp(18px,1.3vw,26px) 1fr clamp(48px,3.6vw,74px);gap:9px;font-size:clamp(10px,.8vw,14px)}
.rank-list .rankrow .mid .nm2{font-size:clamp(10px,.8vw,14px)}
.rank-list .rankrow .mid .track{height:clamp(6px,.8vh,11px)}
.rank-list .rankrow .vv{font-size:clamp(11px,.9vw,15px)}
.rank-list .rankrow .rk{font-size:clamp(10px,.75vw,13px)}
.empty{padding:22px 14px;color:var(--muted);text-align:center;font-size:clamp(12px,.9vw,15px)}
/* barras de participacion (mix y familia) */
.pbar{margin-bottom:clamp(5px,.8vh,10px)}
.pbar .lab{display:flex;justify-content:space-between;font-size:clamp(9px,.7vw,12px);font-weight:700;margin-bottom:3px}
.pbar .lab .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pbar .lab .pc{color:var(--muted)}
.pbar .trk{height:clamp(8px,1vh,14px);background:var(--panel-2);border-radius:999px;overflow:hidden}
.pbar .fl{height:100%;border-radius:999px;background:var(--accent)}
.pbar.c .fl{background:var(--accent)} .pbar.p .fl{background:var(--warn)}
.fam0 .fl{background:#1f6feb}.fam1 .fl{background:#2da44e}.fam2 .fl{background:#8250df}
.fam3 .fl{background:#d4a72c}.fam4 .fl{background:#1aa3c2}.fam5 .fl{background:#bc4c00}
.mixtot{font-size:clamp(9px,.72vw,12px);color:var(--muted);font-weight:700;margin-top:4px}
.mixtot b{color:var(--ink)}
/* variacion vs mes anterior (en KPI y mini-tarjetas) */
.vs{display:flex;align-items:center;gap:5px;margin-top:5px}
.mini .vs{margin-top:3px}
.delta{font-size:clamp(9px,.72vw,13px);font-weight:800;border-radius:999px;padding:1px 7px;white-space:nowrap}
.delta.up{color:var(--accent-2);background:color-mix(in srgb,var(--accent-2) 16%,transparent)}
.delta.down{color:var(--bad);background:color-mix(in srgb,var(--bad) 14%,transparent)}
.delta.flat{color:var(--muted);background:var(--panel-2)}
.vslab{font-size:clamp(8px,.6vw,11px);color:var(--muted);font-weight:600}
/* Perfil de Pedidos (tarjeta caja/pallet estilo nota) */
.card-hd{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding:clamp(6px,.9vh,12px) 14px 0}
.card-hd h2{padding:0}
.per{font-size:clamp(10px,.8vw,14px);font-weight:800;color:var(--muted);background:var(--panel-2);border:1px solid var(--line);border-radius:999px;padding:2px 9px;white-space:nowrap}
.perfil{display:flex;flex-direction:column;gap:clamp(4px,.7vh,9px);height:100%;justify-content:center}
.prow{display:flex;align-items:baseline;justify-content:space-between}
.prow .pl{font-size:clamp(13px,1.1vw,19px);font-weight:800;color:var(--ink)}
.prow .pv{font-size:clamp(16px,1.6vw,28px);font-weight:800;color:var(--accent)}
.ptrk{height:clamp(7px,.9vh,13px);background:var(--panel-2);border-radius:999px;overflow:hidden}
.pfl{height:100%;border-radius:999px}
.pfl.c{background:var(--accent)} .pfl.p{background:var(--warn)}
.three{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.method{border:1px solid var(--line);border-radius:10px;padding:13px;background:var(--panel-2)}
.method .tag{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:var(--muted)}
.method .big{font-size:26px;font-weight:800;margin-top:4px}
.method .ds{font-size:11.5px;color:var(--muted);margin-top:4px;line-height:1.4}
.method.j{border-top:3px solid var(--warn)} .method.d{border-top:3px solid var(--accent)}
.method.e{border-top:3px solid var(--accent-2)}
svg{display:block;width:100%;height:auto}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{padding:8px 10px;text-align:left;border-bottom:1px solid var(--line)}
th{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);cursor:pointer;user-select:none;white-space:nowrap}
th.num,td.num{text-align:right}
tbody tr:hover{background:var(--panel-2)}
.bar{position:relative}
.bar::before{content:"";position:absolute;left:0;top:3px;bottom:3px;width:var(--w,0);
  background:color-mix(in srgb,var(--accent) 22%,transparent);border-radius:4px;z-index:0}
.bar span{position:relative;z-index:1;font-weight:700}
.badge{display:inline-block;padding:1px 7px;border-radius:999px;font-size:11px;font-weight:700}
.badge.ok{background:color-mix(in srgb,var(--accent-2) 18%,transparent);color:var(--accent-2)}
.badge.warn{background:color-mix(in srgb,var(--warn) 20%,transparent);color:var(--warn)}
.badge.bad{background:color-mix(in srgb,var(--bad) 16%,transparent);color:var(--bad)}
.section-h{font-size:15px;margin:0 0 2px;letter-spacing:.3px}
.turno-panels{display:grid;grid-template-columns:repeat(3,1fr);gap:clamp(8px,1vw,14px);min-height:0}
.turno-card{background:var(--panel);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow);overflow:hidden;display:flex;flex-direction:column;min-height:0}
.turno-card .thead{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:clamp(8px,1.1vh,14px) clamp(12px,1vw,18px);border-bottom:1px solid var(--line)}
.turno-card .thead .tt{font-size:clamp(12px,.9vw,16px);font-weight:800;letter-spacing:.3px}
.turno-card .thead .hh{font-size:clamp(10px,.75vw,13px);color:var(--muted);font-weight:600}
.turno-card .thead .tn{text-align:right;line-height:1.05}
.turno-card .thead .tn b{font-size:clamp(15px,1.25vw,22px);font-weight:800;color:var(--accent-2);display:block}
.turno-card .thead .tn span{font-size:clamp(9px,.65vw,12px);color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.5px}
.turno-card .tbody{padding:6px 8px 8px;overflow-y:auto;min-height:0;flex:1}
.turno-card .tbody::-webkit-scrollbar{width:8px}
.turno-card .tbody::-webkit-scrollbar-thumb{background:var(--line);border-radius:8px}
.turno-card .empty{padding:18px 12px;color:var(--muted);font-size:12.5px;text-align:center}
.ranklist{display:grid;gap:clamp(5px,.7vh,10px)}
.rankrow{display:grid;grid-template-columns:clamp(16px,1.2vw,22px) 1fr clamp(44px,3.4vw,66px);align-items:center;gap:7px;font-size:clamp(10px,.72vw,13px)}
.rankrow .rk{color:var(--muted);font-weight:700;text-align:center}
.rankrow .mid{min-width:0}
.rankrow .mid .nm2{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:clamp(10px,.72vw,13px)}
.rankrow .mid .track{height:clamp(5px,.6vh,9px);margin-top:3px}
.rankrow .vv{font-size:clamp(11px,.8vw,14px)}
.rankrow .nm{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.track{height:9px;background:var(--panel-2);border-radius:999px;overflow:hidden}
.fill{height:100%;background:linear-gradient(90deg,var(--accent),var(--accent-2));border-radius:999px}
.rankrow .vv{text-align:right;font-weight:700}
.foot{margin-top:22px;font-size:11.5px;color:var(--muted);line-height:1.6}
@media(min-width:820px){.cols.two{grid-template-columns:1fr 1fr}}
@media(max-width:560px){.three{grid-template-columns:1fr}.rankrow{grid-template-columns:20px 90px 1fr 54px}}
</style>
</head>
<body>
<div class="wrap">
  <header class="app">
    <div class="logo">
      <div class="mk">P</div>
      <div><h1>Productividad</h1></div>
    </div>
    <div class="spacer"></div>
    <div class="seg" id="f-metric"></div>
    <button class="theme-btn" id="theme" title="Tema">◑</button>
  </header>

  <div class="layout">
    <!-- COLUMNA IZQUIERDA: banda superior + tendencia -->
    <div class="left">
      <div class="topband">
        <div class="grid-kpi" id="kpis"></div>
        <div class="turno-mini" id="turno-mini"></div>
        <div class="card compact mixcard">
          <div class="card-hd"><h2>Perfil de Pedidos</h2><span class="per" id="mix-per"></span></div>
          <div class="body" id="mix"></div>
        </div>
        <div class="card compact famcard">
          <h2>Participación por familia</h2>
          <div class="body" id="familia"></div>
        </div>
      </div>
      <div class="card trend">
        <h2 id="trend-title">Tendencia diaria</h2>
        <div class="body"><svg id="trend" viewBox="0 0 1000 600" preserveAspectRatio="none"></svg></div>
      </div>
    </div>

    <!-- COLUMNA DERECHA: ranking del turno activo (toda la altura) -->
    <div class="card ranking">
      <div class="rank-head">
        <div class="rank-ttl"><span id="rank-turno">Turno</span><span class="rank-sub" id="rank-sub"></span></div>
        <div class="rank-tn"><b id="rank-tn">0</b><span>Tn turno</span></div>
      </div>
      <div class="seg rank-ctrl" id="rank-ctrl"></div>
      <div class="rank-list" id="rank-list"></div>
    </div>
  </div>

</div>

<script>
let DATA = window.__EMBED__ || __DATA__;
let CELLS = [];
let MONTHS = [];
let CUR_M = "";
let PREV_M = null;
let CUR = [];
let PREV = [];
let PERIODO_LABEL = "";

function normalizeCells(data){
  return (data?.celdas||[]).map(c=>({
  usuario:c.usuario, dia:c.dia, turno:c.turno||"SIN TURNO", cargo:c.cargo||"",
  horas:+c.horas||0, tareas:+c.tareas||0, cajas:+c.cajas||0,
  cajas_sueltas:+c.cajas_sueltas||0, pallets:+c.pallets||0,
  volumen_m3:+c.volumen_m3||0, peso_tn:+c.peso_tn||0,
  ubicaciones:+c.ubicaciones||0, detalle:+c.detalle||0,
  t_std_min:+c.t_std_min||0, t_real_min:+c.t_real_min||0
}));
}
// Selector de métrica (como el tablero anterior): caja suelta y pallet separados.
const METRICS = [
  {key:"cajas", label:"Cajas/h", unit:"cajas/h", num:"cajas_sueltas", dec:1},
  {key:"pallets", label:"Pallets/h", unit:"pallets/h", num:"pallets", dec:2},
  {key:"volumen_m3", label:"m³/h", unit:"m³/h", num:"volumen_m3", dec:2},
  {key:"peso_tn", label:"Tn/h", unit:"Tn/h", num:"peso_tn", dec:2},
  {key:"ubicaciones", label:"Ubic/h", unit:"ubic/h", num:"ubicaciones", dec:1},
  {key:"tareas", label:"Tareas/h", unit:"tareas/h", num:"tareas", dec:2},
];
const EFIC = {key:"efic"};  // métrica siempre visible como KPI (no en el selector)
// rankMode: "auto" (turno por hora) | "1° TURNO" | "2° TURNO" | "3° TURNO" | "top15"
let state = {dia:"__ALL__", turno:"__ALL__", metric:"cajas", rankMode:"auto"};

// hora de LIMA (America/Lima, UTC-5) sin depender del reloj/zona del equipo
function limaHour(){
  try{
    const s=new Intl.DateTimeFormat("en-US",{timeZone:"America/Lima",hour:"numeric",hour12:false}).format(new Date());
    let h=parseInt(s,10); return (h===24?0:h);
  }catch(e){ return new Date().getHours(); }
}
function turnoActual(){
  const h=limaHour();
  if(h>=7&&h<15) return "1° TURNO";
  if(h>=15&&h<23) return "2° TURNO";
  return "3° TURNO";
}
const TURNO_HORARIO={"1° TURNO":"07:00 – 15:00","2° TURNO":"15:00 – 23:00","3° TURNO":"23:00 – 07:00"};

const fmt=(v,d=1)=>Number(v||0).toLocaleString("es-PE",{minimumFractionDigits:d,maximumFractionDigits:d});
const metricDef=()=>METRICS.find(m=>m.key===state.metric);
function rateOf(rows, m){
  if(m.key==="efic"){const ts=rows.reduce((a,r)=>a+r.t_std_min,0),tr=rows.reduce((a,r)=>a+r.t_real_min,0);return tr>0?ts/tr*100:0;}
  const num=rows.reduce((a,r)=>a+r[m.num],0),h=rows.reduce((a,r)=>a+r.horas,0);return h>0?num/h:0;
}
function filtered(){
  return CELLS.filter(r=>(state.dia==="__ALL__"||r.dia===state.dia)
    && (state.turno==="__ALL__"||r.turno===state.turno));
}
function groupBy(rows, key){const m=new Map();for(const r of rows){if(!m.has(r[key]))m.set(r[key],[]);m.get(r[key]).push(r);}return m;}

function renderControls(){
  const el=document.getElementById("f-metric");
  el.innerHTML=METRICS.map(m=>`<button data-k="${m.key}" class="${m.key===state.metric?'on':''}">${m.label}</button>`).join("");
  el.onclick=e=>{const b=e.target.closest("button");if(!b)return;
    state.metric=b.dataset.k;
    el.querySelectorAll("button").forEach(x=>x.classList.toggle("on", x.dataset.k===state.metric));
    renderAll();};
}
function renderKpis(){
  const m=metricDef();
  const main=rateOf(CUR,m);
  const badge=deltaBadge(main, rateOf(PREV,m));
  document.getElementById("kpis").innerHTML=
    `<div class="kpi hero"><div class="k">${m.label}</div><div class="v">${fmt(main,m.dec)}</div>`+
    (badge?`<div class="vs">${badge}<span class="vslab">vs mes ant.</span></div>`:``)+`</div>`;
}
// mini tarjetas por turno — resalta el turno activo (o el seleccionado) + delta vs mes anterior
function renderTurnoMini(){
  const m=metricDef();
  const turnos=["1° TURNO","2° TURNO","3° TURNO"];
  const foco=state.rankMode==="auto"?turnoActual():(state.rankMode==="top15"?turnoActual():state.rankMode);
  const html=turnos.map(t=>{
    const v=rateOf(CUR.filter(r=>r.turno===t),m);
    const badge=deltaBadge(v, rateOf(PREV.filter(r=>r.turno===t),m));
    return `<div class="mini ${t===foco?'on':''}"><div class="mk2">${t}</div><div class="mv">${fmt(v,m.dec)}</div>`+
           (badge?`<div class="vs">${badge}</div>`:``)+`</div>`;
  }).join("");
  document.getElementById("turno-mini").innerHTML=html;
}
// Perfil de Pedidos: participacion caja vs pallet (como la nota) — fijo
function renderMix(){
  const mx=DATA.mix||{};
  const pc=+mx.pct_cajas||0, pp=+mx.pct_pallets||0;
  const per=document.getElementById("mix-per"); if(per) per.textContent=PERIODO_LABEL;
  document.getElementById("mix").innerHTML=`
    <div class="perfil">
      <div class="prow"><span class="pl">Caja</span><span class="pv">${fmt(pc,1)}%</span></div>
      <div class="ptrk"><div class="pfl c" style="width:${pc}%"></div></div>
      <div class="prow"><span class="pl">Pallet</span><span class="pv">${fmt(pp,1)}%</span></div>
      <div class="ptrk"><div class="pfl p" style="width:${pp}%"></div></div>
    </div>`;
}
// participacion por familia (% de cajas sueltas) — fijo
function renderFamilia(){
  const fam=DATA.por_familia||[];
  if(!fam.length){document.getElementById("familia").innerHTML=`<div class="hint" style="padding:8px 0">Sin datos de familia</div>`;return;}
  const max=Math.max(...fam.map(f=>f.pct),1);
  document.getElementById("familia").innerHTML=fam.map((f,i)=>`
    <div class="pbar fam${i%6}"><div class="lab"><span class="nm" title="${f.familia}">${f.familia}</span><span class="pc">${fmt(f.pct,1)}%</span></div>
      <div class="trk"><div class="fl" style="width:${(f.pct/max)*100}%"></div></div></div>`).join("");
}
const MESES_ABBR=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Set","Oct","Nov","Dic"];
// --- mes actual vs mes anterior (comparacion) ---
const monthOf = c => (c.dia||"").slice(0,7);
function mesLabel(ym){ if(!ym) return ""; const [y,mo]=ym.split("-"); return `${MESES_ABBR[(+mo)-1]}-${y.slice(2)}`; }
function rebuildFromData(){
  CELLS = normalizeCells(DATA);
  MONTHS = [...new Set(CELLS.map(monthOf).filter(Boolean))].sort();
  CUR_M = MONTHS[MONTHS.length-1] || "";
  PREV_M = MONTHS.length>1 ? MONTHS[MONTHS.length-2] : null;
  CUR = CELLS.filter(c=>monthOf(c)===CUR_M);           // mes en curso
  PREV = PREV_M ? CELLS.filter(c=>monthOf(c)===PREV_M) : [];  // mes anterior (si existe)
  PERIODO_LABEL = mesLabel(CUR_M);
}
// badge de variacion vs mes anterior (↑ verde / ↓ rojo); vacio si no hay mes anterior
function deltaBadge(cur, prev){
  if(!PREV.length || !prev) return "";
  const d=(cur-prev)/prev*100, up=d>=0, cls=Math.abs(d)<0.1?"flat":(up?"up":"down");
  return `<span class="delta ${cls}">${up?"▲":"▼"} ${fmt(Math.abs(d),1)}%</span>`;
}
// Catmull-Rom -> Bezier: convierte una lista de puntos en una curva suave (sin esquinas)
function smoothPath(pts, t=0.18){
  if(pts.length<2) return "";
  if(pts.length===2) return `M${pts[0][0]},${pts[0][1]} L${pts[1][0]},${pts[1][1]}`;
  let d=`M${pts[0][0]},${pts[0][1]}`;
  for(let i=0;i<pts.length-1;i++){
    const p0=pts[i-1]||pts[i], p1=pts[i], p2=pts[i+1], p3=pts[i+2]||p2;
    const c1x=p1[0]+(p2[0]-p0[0])*t, c1y=p1[1]+(p2[1]-p0[1])*t;
    const c2x=p2[0]-(p3[0]-p1[0])*t, c2y=p2[1]-(p3[1]-p1[1])*t;
    d+=` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0]},${p2[1]}`;
  }
  return d;
}
function kfmt(v){v=+v||0; return v>=1000?(v/1000).toLocaleString("es-PE",{maximumFractionDigits:0})+"k":v.toLocaleString("es-PE",{maximumFractionDigits:0});}
// Combo: BARRAS = total del dia (volumen) · LINEA = productividad (tasa/h). Colores de marca.
function comboChart(svg, days, m){
  const W=1000,H=600,L=64,R=72,T=46,B=98,pw=W-L-R,ph=H-T-B;
  const n=days.length||1;
  const maxBar=Math.max(...days.map(d=>d.total),1);
  const maxRate=Math.max(...days.map(d=>d.rate||0),1);
  const slot=pw/n, bw=Math.min(slot*0.66,50);
  const xC=i=>L+slot*i+slot/2;
  const uni=m.unit.replace("/h","");
  let o=`<rect width="${W}" height="${H}" fill="transparent"/>`;
  // grilla + eje izq (tasa, tinta) + eje der (total, azul)
  for(let i=0;i<=4;i++){const y=T+ph*i/4;
    o+=`<line x1="${L}" y1="${y}" x2="${W-R}" y2="${y}" stroke="var(--chart-grid)"/>`;
    o+=`<text x="${L-10}" y="${y+5}" text-anchor="end" font-size="16" fill="var(--ink)" font-weight="800">${fmt(maxRate*(1-i/4),m.dec)}</text>`;
    o+=`<text x="${W-R+10}" y="${y+5}" text-anchor="start" font-size="16" fill="var(--accent)" font-weight="800">${kfmt(maxBar*(1-i/4))}</text>`;}
  if(!days.some(d=>d.total||d.rate!=null)){o+=`<text x="${W/2}" y="${H/2}" text-anchor="middle" fill="var(--muted)" font-size="18">Sin datos</text>`;svg.innerHTML=o;return;}
  // barras = total del dia; total escrito VERTICAL en la base (blanco con halo oscuro -> legible siempre)
  days.forEach((d,i)=>{const h=ph*(d.total/maxBar), x=xC(i)-bw/2, yTop=T+ph-h, yBase=T+ph;
    o+=`<rect x="${x}" y="${yTop}" width="${bw}" height="${Math.max(0,h)}" rx="2" fill="var(--accent)" opacity=".92"><title>${d.label}: ${fmt(d.total,0)} ${uni}</title></rect>`;
    if(d.total>0){const ty=yBase-8;
      o+=`<text x="${xC(i)}" y="${ty}" text-anchor="start" dominant-baseline="central" font-size="15" font-weight="800" fill="#fff" stroke="rgba(10,16,28,.6)" stroke-width="2.8" paint-order="stroke" stroke-linejoin="round" transform="rotate(-90 ${xC(i)} ${ty})">${fmt(d.total,0)}</text>`;}
    o+=`<text x="${xC(i)}" y="${yBase+10}" text-anchor="end" font-size="14.5" font-weight="800" fill="var(--ink)" transform="rotate(-90 ${xC(i)} ${yBase+10})">${d.label}</text>`;});
  // linea = productividad (tasa) con valores (halo del color del panel para que no los tape la linea)
  const yR=v=>T+ph-(v/maxRate)*ph;
  const pts=days.map((d,i)=>d.rate==null?null:[xC(i),yR(d.rate),d]).filter(Boolean);
  if(pts.length>1)o+=`<path d="${smoothPath(pts)}" fill="none" stroke="var(--ink)" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  pts.forEach((p,i)=>{o+=`<circle cx="${p[0]}" cy="${p[1]}" r="5" fill="var(--accent-2)" stroke="var(--panel)" stroke-width="2"><title>${p[2].label}: ${fmt(p[2].rate,m.dec)} ${m.unit}</title></circle>`;});
  pts.forEach((p,i)=>{if(n<=18||i%2===0)o+=`<text x="${p[0]}" y="${p[1]-13}" text-anchor="middle" font-size="14.5" fill="var(--ink)" font-weight="800" stroke="var(--panel)" stroke-width="3.6" paint-order="stroke" stroke-linejoin="round">${fmt(p[2].rate,m.dec)}</text>`;});
  // leyenda arriba-derecha
  const lx=W-R-240, ly=2;
  o+=`<rect x="${lx}" y="${ly}" width="18" height="18" rx="3" fill="var(--accent)"/><text x="${lx+25}" y="${ly+15}" font-size="16" fill="var(--ink)" font-weight="800">Total ${uni}</text>`;
  o+=`<line x1="${lx+160}" y1="${ly+9}" x2="${lx+196}" y2="${ly+9}" stroke="var(--ink)" stroke-width="3.5"/><circle cx="${lx+178}" cy="${ly+9}" r="5" fill="var(--accent-2)"/><text x="${lx+204}" y="${ly+15}" font-size="16" fill="var(--ink)" font-weight="800">${m.label}</text>`;
  svg.innerHTML=o;
}
function renderTrend(){
  const m=metricDef();
  const base=CUR.filter(r=>state.turno==="__ALL__"||r.turno===state.turno);
  const g=groupBy(base,"dia");
  const keys=[...g.keys()].sort();
  document.getElementById("trend-title").textContent=`Tendencia diaria · ${m.label}`;
  if(!keys.length){comboChart(document.getElementById("trend"),[],m);return;}
  const mm=keys[keys.length-1].split("-")[1], mesAb=MESES_ABBR[(+mm)-1];
  const maxDay=Math.max(...keys.map(k=>+k.split("-")[2]));
  const byDay={}; keys.forEach(k=>byDay[+k.split("-")[2]]=g.get(k));
  const days=[];
  for(let d=1;d<=maxDay;d++){
    const rows=byDay[d];
    days.push(rows
      ? {label:`${d}-${mesAb}`, total:rows.reduce((a,r)=>a+r[m.num],0), rate:rateOf(rows,m)}
      : {label:`${d}-${mesAb}`, total:0, rate:null});
  }
  comboChart(document.getElementById("trend"),days,m);
}
// Usuarios de un conjunto de celdas (una tarjeta de turno), con su tasa por metrica.
function usersFrom(rows){
  const g=groupBy(rows,"usuario"), out=[];
  for(const[u,rs]of g){
    const o={usuario:u, turno:rs[0].turno, horas:rs.reduce((a,r)=>a+r.horas,0),
             peso_tn:rs.reduce((a,r)=>a+r.peso_tn,0)};
    for(const m of METRICS)o[m.key]=rateOf(rs,m);
    o.efic=rateOf(rs,EFIC);
    out.push(o);
  }
  return out;
}
// datos del ranking segun el modo (auto=turno por hora / manual / top 15)
function rankData(){
  const m=metricDef();
  if(state.rankMode==="top15"){
    const users=usersFrom(CUR).sort((a,b)=>b[m.key]-a[m.key]).slice(0,15);
    return {titulo:"Top 15 general", sub:`Los 15 más productivos · ${m.label}`,
            tn:CUR.reduce((a,r)=>a+r.peso_tn,0), users, m};
  }
  const t=state.rankMode==="auto"?turnoActual():state.rankMode;
  const rows=CUR.filter(r=>r.turno===t);
  const users=usersFrom(rows).sort((a,b)=>b[m.key]-a[m.key]);
  const sub=`${state.rankMode==="auto"?"Turno activo · ":""}${TURNO_HORARIO[t]||""} · ${users.length} oper.`;
  return {titulo:t, sub, tn:rows.reduce((a,r)=>a+r.peso_tn,0), users, m};
}
function renderRanking(){
  const {titulo,sub,tn,users,m}=rankData();
  document.getElementById("rank-turno").textContent=titulo;
  document.getElementById("rank-sub").textContent=sub;
  document.getElementById("rank-tn").textContent=fmt(tn,1);
  const list=document.getElementById("rank-list");
  if(!users.length){list.innerHTML=`<div class="empty">Iniciando turno · aún sin tareas registradas</div>`;return;}
  const max=Math.max(...users.map(u=>u[m.key]),1);
  list.innerHTML=`<div class="ranklist">`+users.map((u,i)=>`
    <div class="rankrow"><div class="rk">${i+1}</div>
      <div class="mid"><div class="nm2" title="${u.usuario}">${u.usuario}</div>
        <div class="track"><div class="fill" style="width:${Math.max(2,(u[m.key]/max)*100)}%"></div></div></div>
      <div class="vv" title="Eficiencia ${fmt(u.efic,0)}% · ${fmt(u.horas,0)} h">${fmt(u[m.key],m.dec)}</div></div>`).join("")+`</div>`;
}
function renderRankCtrl(){
  const opts=[["auto","Auto"],["1° TURNO","1°"],["2° TURNO","2°"],["3° TURNO","3°"],["top15","Top 15"]];
  const el=document.getElementById("rank-ctrl");
  el.innerHTML=opts.map(([k,l])=>`<button data-k="${k}" class="${state.rankMode===k?'on':''}">${l}</button>`).join("");
  el.onclick=e=>{const b=e.target.closest("button");if(!b)return;state.rankMode=b.dataset.k;renderTurnoMini();renderRanking();renderRankCtrl();};
}
function renderAll(){renderKpis();renderTurnoMini();renderTrend();renderMix();renderFamilia();renderRankCtrl();renderRanking();}
// tema
const tb=document.getElementById("theme");
tb.onclick=()=>{const r=document.documentElement;const cur=r.getAttribute("data-theme");
  const next=cur==="dark"?"light":(cur==="light"?"dark":(matchMedia("(prefers-color-scheme:dark)").matches?"light":"dark"));
  r.setAttribute("data-theme",next);try{localStorage.setItem("wt-theme",next);}catch(e){}};
try{const s=localStorage.getItem("wt-theme");if(s)document.documentElement.setAttribute("data-theme",s);}catch(e){}
async function loadData(){
  try{
    const res = await fetch("./dash_data.json?ts="+Date.now(), {cache:"no-store"});
    if(!res.ok) return;
    const next = await res.json();
    if(!next || !Array.isArray(next.celdas)) return;
    DATA = next;
    rebuildFromData();
    renderAll();
  }catch(e){
    // Mantiene el ultimo DATA valido, incluido el snapshot embebido.
  }
}
rebuildFromData();
renderControls();renderAll();
loadData();
setInterval(loadData, 5*60*1000);
// en modo Auto, revisa cada minuto si cambio el turno por la hora (Lima) y re-renderiza
let _turnoPrev=turnoActual();
setInterval(()=>{
  if(state.rankMode!=="auto") return;
  const t=turnoActual();
  if(t!==_turnoPrev){ _turnoPrev=t; renderTurnoMini(); renderRanking(); }
}, 60000);
</script>
</body>
</html>
"""


def main() -> int:
    ap = argparse.ArgumentParser(description="Construye WareTrack (dashboard SaaS de productividad).")
    ap.add_argument("--json", default=str(BASE_DIR / "productividad.json"))
    ap.add_argument("--out", default=str(BASE_DIR / "waretrack.html"))
    ap.add_argument("--recompute", action="store_true", help="Corre el motor antes de construir.")
    args = ap.parse_args()

    if args.recompute:
        recompute()

    prod = json.loads(Path(args.json).read_text(encoding="utf-8"))
    dash = build_dash_data(prod)
    data_str = json.dumps(dash, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    html = HTML.replace("__DATA__", data_str)
    out = Path(args.out)
    out.write_text(html, encoding="utf-8")

    # tambien dejar el subset como archivo (para despliegue/depuracion)
    Path(BASE_DIR / "dash_data.json").write_text(
        json.dumps(dash, ensure_ascii=False, indent=2), encoding="utf-8")

    me = dash["meta"]
    print(f"[OK] WareTrack -> {out}")
    print(f"[OK] dash_data.json -> {BASE_DIR / 'dash_data.json'}")
    print(f"Rango {me['rango_fechas']} | {me['personas']} personas | "
          f"{len(dash['celdas'])} celdas persona-dia")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
