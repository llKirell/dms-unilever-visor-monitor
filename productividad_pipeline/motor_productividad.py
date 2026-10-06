# -*- coding: utf-8 -*-
"""
Motor de Productividad de Picking — Unilever / KCC (Dinet)
==========================================================

Calcula productividad a partir de ReportTareas (w4w) con los granos que pediste:

    - global
    - por persona           (Usuario Ejecucion)
    - por dia               (Fecha Tarea)
    - por mes               (Fecha Tarea -> AAAA-MM)
    - por persona x dia
    - por persona x mes

Metricas por grupo (todas con la regla "RAZON DE TOTALES"):
    - horas        = Σ T. Preparacion
    - tareas       = # tareas elegibles
    - cajas        = Σ Und. Picadas
    - volumen_m3   = Σ Volumen Total
    - peso_tn      = Σ Peso Total / 1000
    - ubicaciones  = Σ Ubicacion Atendida      <-- metrica propia (mejora)
    - detalle      = Σ Detalle Atendido
  y las tasas por hora:
    - cajas_hr, m3_hr, tn_hr, ubic_hr, detalle_hr, tareas_hr

Regla de oro (decision de negocio): el KPI de un grupo NO es el promedio de las
tasas por tarea, es  Σ(numerador del grupo) / Σ(horas del grupo).
Ej.: tarea A 100 caj/0.5h + tarea B 100 caj/4.5h  ->  200/5 = 40 caj/h  (no 111).

Poblacion del KPI: solo tareas Estado = COMPLETADA con T. Preparacion > 0.
Las demas (y las "COMPLETADA" sin tiempo valido) van al panel de EXCEPCIONES.

Uso:
    py motor_productividad.py --tareas ReportTareas.xlsx \
        [--maestro-usuario maestros.xlsx]  (hoja/col Usuario, Cargo, Turno) \
        [--out-json salida.json] [--out-xlsx salida.xlsx]

Entrada: .xlsx, .xls o .csv del ReportTareas tal como lo baja el w4w.
Solo depende de pandas + openpyxl (ya instalados en esta PC).
"""
from __future__ import annotations

import argparse
import json
import sys
import unicodedata
from pathlib import Path

import pandas as pd


# ----------------------------------------------------------------------------- #
# Utilidades de columnas (tolerantes a acentos / mayusculas / espacios)
# ----------------------------------------------------------------------------- #
def _norm(s: object) -> str:
    """normaliza un texto de cabecera: sin acentos, minuscula, espacios colapsados."""
    s = str(s)
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    return " ".join(s.lower().replace(".", " ").replace("_", " ").split())


# field canonico -> lista de alias posibles (ya normalizados con _norm).
# Se incluyen tanto los titulos del export Excel ("nro tarea") como los nombres
# internos de la API JSON del w4w ("numerotarea", camelCase sin espacios).
TAREAS_FIELDS = {
    "nro_tarea":        ["nro tarea", "numero tarea", "numerotarea"],
    "fecha_tarea":      ["fecha tarea", "fechatarea"],
    "estado":           ["estado de tarea", "estado tarea",
                         "descripcionestadotarea", "descripcion estado tarea"],
    "nro_picking":      ["nro de picking", "nro picking", "numero de picking", "numeropicking"],
    "cliente":          ["cliente", "descripcioncliente", "descripcion cliente"],
    "cod_cliente":      ["cod cliente", "codigo cliente", "codigocliente"],
    "und_solicitadas":  ["und solicitadas", "unidades solicitadas", "unidadessolicitadas"],
    "cajas":            ["und picadas", "unidades picadas", "unidadespicadas"],   # numerador cajas
    "volumen_m3":       ["volumen total", "volumentotal"],                        # m3
    "peso":             ["peso total", "pesototal"],                              # kg (se divide /1000)
    "usuario":          ["usuario ejecucion", "usuarioejecucion"],               # persona
    "fec_inicio":       ["fec inicio ejecucion", "fecha inicio ejecucion", "fechainicioejecucion"],
    "fec_fin":          ["fec fin ejecucion", "fecha fin ejecucion", "fechafinejecucion"],
    "ubic_total":       ["ubicacion total", "ubicaciontotal"],
    "ubicaciones":      ["ubicacion atendida", "ubicacionatendida"],             # <-- metrica pedida
    "detalle_total":    ["detalle total", "detalletotal"],
    "detalle":          ["detalle atendido", "detalleatendido"],
    "familia":          ["lista familias", "listafamilias", "familia", "familias"],
}

# Metricas sumables -> etiqueta de su tasa por hora
SUM_METRICS = {
    "cajas":       "cajas_hr",
    "volumen_m3":  "m3_hr",
    "peso_tn":     "tn_hr",
    "ubicaciones": "ubic_hr",
    "detalle":     "detalle_hr",
}


def _resolve_columns(df: pd.DataFrame, fields: dict[str, list[str]]) -> dict[str, str]:
    """mapea field canonico -> nombre real de columna del df (si existe)."""
    norm_to_real = {}
    for real in df.columns:
        norm_to_real.setdefault(_norm(real), real)
    out = {}
    for field, aliases in fields.items():
        for alias in aliases:
            if alias in norm_to_real:
                out[field] = norm_to_real[alias]
                break
    return out


# ----------------------------------------------------------------------------- #
# Lectura de archivos (xlsx / xls / csv)
# ----------------------------------------------------------------------------- #
def read_any(path: str | Path) -> pd.DataFrame:
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"No existe el archivo: {path}")
    suf = path.suffix.lower()
    if suf in (".xlsx", ".xlsm", ".xls"):
        return pd.read_excel(path, dtype=str)      # todo texto: preserva ceros a la izq.
    if suf in (".csv", ".txt"):
        for sep in (";", ",", "\t"):
            try:
                df = pd.read_csv(path, dtype=str, sep=sep, encoding="utf-8-sig")
                if df.shape[1] > 1:
                    return df
            except Exception:
                continue
        return pd.read_csv(path, dtype=str, encoding="utf-8-sig")
    raise ValueError(f"Formato no soportado: {suf}")


# ----------------------------------------------------------------------------- #
# Parsers numericos / de fecha robustos
# ----------------------------------------------------------------------------- #
def _to_num(series: pd.Series) -> pd.Series:
    """convierte a float tolerando separador de miles ',' y coma decimal."""
    s = series.astype(str).str.strip()
    s = s.replace({"": None, "nan": None, "None": None, "-": None})
    # si el valor usa coma como decimal (y no tiene punto), cambiarla
    comma_dec = s.str.contains(",", na=False) & ~s.str.contains(r"\.", na=False)
    s = s.where(~comma_dec, s.str.replace(",", ".", regex=False))
    # quitar separador de miles tipo 1,234.56
    s = s.str.replace(r"(?<=\d),(?=\d{3}\b)", "", regex=True)
    return pd.to_numeric(s, errors="coerce")


def _to_datetime(series: pd.Series) -> pd.Series:
    """
    Fechas del w4w pueden venir mezcladas en una misma columna:
      - .NET JSON   '/Date(1790834434000)/'  (epoch UTC en ms  -> se interpreta tal cual)
      - serial Excel  46000.5
      - texto ISO     '2026-10-05 14:30:00'  (ano primero -> dayfirst=False)
      - texto latino  '05/10/2026 14:30'     (dia primero  -> dayfirst=True)
      - datetime real

    BUG HISTORICO (corregido aqui): aplicar dayfirst=True a TODO invertia las
    fechas ISO ('2026-10-05' -> 2026-05-10), inflando las horas a miles. El parser
    detecta el formato POR FILA y nunca invierte dia/mes de una fecha ISO.
    Devuelve una Serie de Timestamp (NaT si no se pudo).
    """
    import warnings
    raw = series.astype(str).str.strip()
    out = pd.Series(pd.NaT, index=series.index).astype("datetime64[ns]")

    vacio = raw.eq("") | raw.str.lower().isin(["nan", "none", "nat", "-"])
    pend = ~vacio

    # 1) .NET JSON: /Date(1790834434000)/  (epoch en milisegundos, UTC)
    dotnet = raw.str.extract(r"/Date\((\d+)\)/", expand=False)
    m = pend & dotnet.notna()
    if m.any():
        out.loc[m] = pd.to_datetime(pd.to_numeric(dotnet[m], errors="coerce"),
                                    unit="ms", errors="coerce")
        pend = pend & ~m

    # 2) serial Excel (numero puro en rango de fechas razonable)
    num = pd.to_numeric(raw.where(pend), errors="coerce")
    is_serial = pend & num.notna() & (num > 20000) & (num < 90000)
    if is_serial.any():
        out.loc[is_serial] = pd.to_datetime(num[is_serial], origin="1899-12-30",
                                            unit="D", errors="coerce")
        pend = pend & ~is_serial

    # 3) texto ISO (ano primero) -> dayfirst=False, nunca invierte
    iso = pend & raw.str.match(r"^\d{4}[-/]\d{1,2}[-/]\d{1,2}")
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        if iso.any():
            out.loc[iso] = pd.to_datetime(raw[iso], errors="coerce",
                                          dayfirst=False, format="mixed")
        # 4) resto (texto latino dd/mm/aaaa) -> dayfirst=True
        otros = pend & ~iso
        if otros.any():
            out.loc[otros] = pd.to_datetime(raw[otros], errors="coerce",
                                            dayfirst=True, format="mixed")
    return out


# ----------------------------------------------------------------------------- #
# Nucleo: preparar tareas
# ----------------------------------------------------------------------------- #
def preparar_tareas(df_raw: pd.DataFrame, maestro_usuario: pd.DataFrame | None = None,
                    umbral_pallet: float = 60.0, horas_max: float = 16.0) -> pd.DataFrame:
    cols = _resolve_columns(df_raw, TAREAS_FIELDS)
    faltan = [f for f in ("estado", "usuario", "fec_inicio", "fec_fin") if f not in cols]
    if faltan:
        raise ValueError(
            "Faltan columnas clave en ReportTareas: "
            + ", ".join(faltan)
            + f"\nColumnas detectadas: {list(df_raw.columns)}"
        )

    d = pd.DataFrame(index=df_raw.index)
    d["nro_tarea"]   = df_raw[cols["nro_tarea"]].astype(str).str.strip() if "nro_tarea" in cols else ""
    d["nro_picking"] = df_raw[cols["nro_picking"]].astype(str).str.strip() if "nro_picking" in cols else ""
    d["usuario"]     = df_raw[cols["usuario"]].astype(str).str.strip().replace({"": "(SIN USUARIO)", "nan": "(SIN USUARIO)"})
    d["familia"]     = (df_raw[cols["familia"]].astype(str).str.strip().str.upper()
                        .replace({"": "(SIN FAMILIA)", "NAN": "(SIN FAMILIA)", "NONE": "(SIN FAMILIA)"})
                        if "familia" in cols else "(SIN FAMILIA)")
    d["estado"]      = df_raw[cols["estado"]].astype(str).str.strip().str.upper()
    d["estado_norm"] = d["estado"].map(_norm)

    # numericos (ejecutado real)
    d["cajas"]       = _to_num(df_raw[cols["cajas"]]) if "cajas" in cols else 0.0
    d["volumen_m3"]  = _to_num(df_raw[cols["volumen_m3"]]) if "volumen_m3" in cols else 0.0
    d["peso"]        = _to_num(df_raw[cols["peso"]]) if "peso" in cols else 0.0
    d["ubicaciones"] = _to_num(df_raw[cols["ubicaciones"]]) if "ubicaciones" in cols else 0.0
    d["detalle"]     = _to_num(df_raw[cols["detalle"]]) if "detalle" in cols else 0.0
    d["peso_tn"]     = d["peso"].fillna(0) / 1000.0

    # tiempo de preparacion
    ini = _to_datetime(df_raw[cols["fec_inicio"]])
    fin = _to_datetime(df_raw[cols["fec_fin"]])
    d["horas"] = (fin - ini).dt.total_seconds() / 3600.0
    d["t_real_min"] = d["horas"] * 60.0   # tiempo real en minutos (para eficiencia)

    # turno por HORA DE INICIO (mejora V7): T1 07-15, T2 15-23, T3 23-07.
    # Se usa como respaldo cuando el roster no trae el turno del usuario.
    def _turno_por_hora(h):
        if pd.isna(h):
            return "SIN TURNO"
        h = int(h)
        if 7 <= h < 15:
            return "1° TURNO"
        if 15 <= h < 23:
            return "2° TURNO"
        return "3° TURNO"
    d["turno_hora"] = ini.dt.hour.map(_turno_por_hora)

    # fecha operativa (dia / mes) desde Fecha Tarea; fallback: fecha fin ejecucion
    if "fecha_tarea" in cols:
        fecha = _to_datetime(df_raw[cols["fecha_tarea"]])
    else:
        fecha = fin
    fecha = fecha.fillna(fin)
    d["fecha"] = fecha.dt.normalize()
    d["dia"]   = fecha.dt.strftime("%Y-%m-%d")
    d["mes"]   = fecha.dt.strftime("%Y-%m")

    # ------------------------------------------------------------------ #
    # CLASIFICACION UOM (NUEVA) -- pallet-move vs picking de detalle.
    # No altera ninguna metrica anterior; solo agrega columnas.
    # Senal: cajas movidas por ubicacion visitada. Un pallet completo
    # descarga decenas de cajas en UNA sola ubicacion (1 pallet = 1 ubic),
    # mientras el picking de detalle toma pocas cajas por ubicacion.
    # Umbral anclado al maestro de articulos (pallet mas chico ~ 60-85 caj).
    # ------------------------------------------------------------------ #
    ubic_safe = d["ubicaciones"].where(d["ubicaciones"] > 0)
    det_safe  = d["detalle"].where(d["detalle"] > 0)
    cpu = d["cajas"] / ubic_safe
    cpu = cpu.fillna(d["cajas"] / det_safe)   # fallback si no hubo ubicaciones
    d["cajas_por_ubic"] = cpu.round(2)
    d["tipo_uom"] = "DETALLE"
    d.loc[cpu >= umbral_pallet, "tipo_uom"] = "PALLET"

    # Separacion PALLET vs CAJA SUELTA por PROXY (mejora V7, sin FlujoSalidas):
    # las cajas de una tarea-detalle cuentan como cajas sueltas; una tarea-pallet
    # aporta pallets (1 pallet = 1 ubicacion) y cero cajas sueltas. Si llega el
    # FlujoSalidas, 'calcular' reemplaza estas columnas por el conteo EXACTO.
    es_pal = d["tipo_uom"].eq("PALLET")
    d["pallets"]       = 0.0
    d["cajas_sueltas"] = d["cajas"].fillna(0.0)
    d.loc[es_pal, "pallets"]       = d.loc[es_pal, "ubicaciones"].fillna(0.0)
    d.loc[es_pal, "cajas_sueltas"] = 0.0

    # elegibilidad para KPI
    completada = d["estado_norm"].eq("completada")
    tiempo_ok  = d["horas"].notna() & (d["horas"] > 0)
    # horas imposibles: COMPLETADA con tiempo > limite (dato sucio, no metodo).
    horas_posibles = (d["horas"] <= horas_max) if horas_max and horas_max > 0 else True
    d["elegible"] = completada & tiempo_ok & horas_posibles

    # motivo de exclusion (para el panel de excepciones)
    hmax = horas_max
    def _motivo(r):
        if r["elegible"]:
            return ""
        if not completada.loc[r.name]:
            return f"Estado {r['estado'] or '(vacio)'}"
        if pd.isna(r["horas"]):
            return "COMPLETADA sin fecha inicio/fin"
        if r["horas"] <= 0:
            return "COMPLETADA con fin <= inicio"
        if hmax and hmax > 0 and r["horas"] > hmax:
            return f"COMPLETADA con horas imposibles (>{hmax:g}h)"
        return "Sin tiempo valido"
    d["motivo_exclusion"] = d.apply(_motivo, axis=1)

    # enriquecer con maestro Usuario -> Cargo / Turno
    d["cargo"] = "(SIN CARGO)"
    d["turno"] = "SIN TURNO"
    if maestro_usuario is not None and not maestro_usuario.empty:
        mcols = _resolve_columns(maestro_usuario, {
            "usuario": ["usuario ejecucion", "usuario"],
            "cargo":   ["cargo", "perfil", "cargo perfil"],
            "turno":   ["turno", "turno asignado"],
        })
        if "usuario" in mcols:
            m = maestro_usuario.copy()
            m["_k"] = m[mcols["usuario"]].astype(str).str.strip()
            mp = m.drop_duplicates("_k").set_index("_k")
            if "cargo" in mcols:
                d["cargo"] = d["usuario"].map(mp[mcols["cargo"]]).fillna("(SIN CARGO)")
            if "turno" in mcols:
                d["turno"] = d["usuario"].map(mp[mcols["turno"]]).fillna("SIN TURNO")

    # Fallback V7: si el roster no trae turno, usar el turno por hora de inicio.
    # El roster (turno contratado) manda; solo se rellenan los huecos.
    sin_turno = d["turno"].astype(str).str.strip().str.upper().isin(
        ["SIN TURNO", "", "NAN", "NONE", "(SIN TURNO)"])
    d.loc[sin_turno, "turno"] = d.loc[sin_turno, "turno_hora"]
    return d


# ----------------------------------------------------------------------------- #
# Agregacion por razon de totales
# ----------------------------------------------------------------------------- #
def _agg(df_elig: pd.DataFrame, by: list[str] | None) -> list[dict]:
    """
    Agrega sumando numeradores y horas; la tasa de grupo es Σnum/Σhoras
    (razon de totales, nunca el promedio de tasas por tarea).

    Columnas opcionales (se agregan solo si existen en df_elig):
      - t_std_min + t_real_min -> 'efic' = Σt_std / Σt_real * 100  (vista 3)
      - cajas_eq               -> 'cajas_eq' y 'cajas_eq_hr'       (con FlujoSalidas)
    """
    sum_cols = ["horas", "cajas", "volumen_m3", "peso_tn", "ubicaciones", "detalle"]
    opt = [c for c in ("t_std_min", "t_real_min", "cajas_eq",
                       "pallets", "cajas_sueltas") if c in df_elig.columns]
    all_cols = sum_cols + opt

    if by:
        g = df_elig.groupby(by, dropna=False)
        base = g[all_cols].sum()
        base["tareas"] = g.size()
        base = base.reset_index()
    else:
        base = pd.DataFrame([{**{c: df_elig[c].sum() for c in all_cols},
                              "tareas": len(df_elig)}])

    def rate(num, hrs):
        return float(num / hrs) if hrs and hrs > 0 else 0.0

    rows = []
    for _, r in base.iterrows():
        h = float(r["horas"])
        row = {}
        for k in (by or []):
            row[k] = None if pd.isna(r[k]) else str(r[k])
        row["horas"]      = round(h, 3)
        row["tareas"]     = int(r["tareas"])
        row["cajas"]      = round(float(r["cajas"]), 2)
        row["volumen_m3"] = round(float(r["volumen_m3"]), 3)
        row["peso_tn"]    = round(float(r["peso_tn"]), 3)
        row["ubicaciones"] = round(float(r["ubicaciones"]), 2)
        row["detalle"]    = round(float(r["detalle"]), 2)
        # tasas por hora (razon de totales)
        row["cajas_hr"]   = round(rate(r["cajas"], h), 2)
        row["m3_hr"]      = round(rate(r["volumen_m3"], h), 3)
        row["tn_hr"]      = round(rate(r["peso_tn"], h), 3)
        row["ubic_hr"]    = round(rate(r["ubicaciones"], h), 2)
        row["detalle_hr"] = round(rate(r["detalle"], h), 2)
        row["tareas_hr"]  = round(rate(r["tareas"], h), 2)
        # eficiencia vs tiempo estandar (razon de totales de minutos).
        # Se emiten tambien las sumas crudas para que el front re-agregue
        # la eficiencia correctamente al filtrar (razon de totales de minutos).
        if "t_std_min" in opt and "t_real_min" in opt:
            tr = float(r["t_real_min"])
            row["t_std_min"]  = round(float(r["t_std_min"]), 2)
            row["t_real_min"] = round(tr, 2)
            row["efic"] = round(float(r["t_std_min"]) / tr * 100, 1) if tr > 0 else 0.0
        # separacion pallet vs caja suelta (mejora V7)
        if "pallets" in opt:
            row["pallets"]    = round(float(r["pallets"]), 2)
            row["pallets_hr"] = round(rate(r["pallets"], h), 2)
        if "cajas_sueltas" in opt:
            row["cajas_sueltas"]    = round(float(r["cajas_sueltas"]), 2)
            row["cajas_sueltas_hr"] = round(rate(r["cajas_sueltas"], h), 2)
        # cajas-equivalentes exactas (con FlujoSalidas)
        if "cajas_eq" in opt:
            row["cajas_eq"]    = round(float(r["cajas_eq"]), 2)
            row["cajas_eq_hr"] = round(rate(r["cajas_eq"], h), 2)
        rows.append(row)
    # ordenar por horas desc para lecturas rapidas
    rows.sort(key=lambda x: x["horas"], reverse=True)
    return rows


# ----------------------------------------------------------------------------- #
# Modelo de tiempo estandar (vista 3) y cruce con FlujoSalidas (cajas-eq exactas)
# ----------------------------------------------------------------------------- #
# Coeficientes de referencia de jefatura (sept 2026, R2=0.31):
#   t_estandar(min) = a + b*unidades + c*visitas
EFIC_DEFAULT = {"a": 8.16, "b": 0.0705, "c": 2.16, "r2": 0.308}


def fit_estandar(elig: pd.DataFrame,
                 override: dict | None = None) -> dict:
    """
    Ajusta t_real(min) ~ a + b*cajas + c*ubicaciones por minimos cuadrados sobre
    las tareas elegibles. Devuelve {a,b,c,r2,...}. Si 'override' trae a/b/c se
    respetan esos (coeficientes fijos de jefatura) y solo se reporta el R2.
    """
    X = elig[["cajas", "ubicaciones"]].astype(float).to_numpy()
    y = elig["t_real_min"].astype(float).to_numpy()
    n = len(y)
    info = {"operarios_eval": int(elig["usuario"].nunique()) if "usuario" in elig else 0,
            "tareas_eval": int(n)}

    coef = None
    if override and all(override.get(k) is not None for k in ("a", "b", "c")):
        coef = {"a": float(override["a"]), "b": float(override["b"]), "c": float(override["c"])}

    if coef is None and n >= 10:
        import numpy as np
        A = np.column_stack([np.ones(n), X])
        beta, *_ = np.linalg.lstsq(A, y, rcond=None)
        coef = {"a": float(beta[0]), "b": float(beta[1]), "c": float(beta[2])}

    if coef is None:   # muy pocos datos -> usar coeficientes de referencia
        coef = {k: EFIC_DEFAULT[k] for k in ("a", "b", "c")}

    # R2 del modelo con los coeficientes finales
    import numpy as np
    pred = coef["a"] + coef["b"] * X[:, 0] + coef["c"] * X[:, 1]
    if n and np.var(y) > 0:
        r2 = 1.0 - float(np.sum((y - pred) ** 2) / np.sum((y - y.mean()) ** 2))
    else:
        r2 = 0.0
    out = {"a": round(coef["a"], 4), "b": round(coef["b"], 5),
           "c": round(coef["c"], 4), "r2": round(r2, 3), **info}
    return out


def _normaliza_tarea(serie: pd.Series) -> pd.Series:
    """Nro.Tarea del FlujoSalidas viene compuesto 'TAREA-LINEA' -> toma la TAREA."""
    s = serie.astype(str).str.strip()
    return s.str.split("-", n=1).str[0].str.strip()


FLUJO_FIELDS = {
    "nro_tarea":   ["nro tarea", "numero tarea", "numerotarea", "nro de tarea"],
    "nro_picking": ["nro picking", "nro de picking", "nropicking", "numeropicking", "numero de picking"],
    "um":          ["um", "unidad medida", "unidad de medida", "umpicking", "um picking",
                    "unidad de extraccion", "unidad extraccion", "unidadmedida", "unidadmedidapedido"],
    "cant":        ["cant picking", "cant", "cantidad picking", "cantidad", "cantpicking", "cantidadpicking"],
    "cod_articulo": ["cod articulo", "codigo articulo", "codigoarticulo", "codarticulo", "cod de articulo", "sku"],
    "paletizado":  ["paletizado", "huella", "codigohuella", "codigo huella", "paletizado huella", "paletizado / huella",
                    "um paletizado", "paletizado huella"],
    "familia":     ["familia", "descripcion familia", "linea articulo"],
}


def _factor_desde_sku(serie: pd.Series) -> pd.Series:
    """Mejora V7: extrae el factor cajas/pallet del codigo de paletizado 'P85C' -> 85."""
    s = serie.astype(str).str.upper().str.strip()
    num = s.str.extract(r"P\s*(\d+)\s*C", expand=False)       # formato P85C / P176C
    num = num.fillna(s.str.extract(r"(\d+)", expand=False))   # respaldo: primer numero
    return pd.to_numeric(num, errors="coerce")


def cruzar_flujo(elig: pd.DataFrame, flujo_raw: pd.DataFrame,
                 maestro_articulo: pd.DataFrame | None) -> tuple[pd.DataFrame, dict]:
    """
    Separa CAJAS SUELTAS de PALLETS COMPLETOS por linea (logica V7) y calcula
    cajas-equivalentes EXACTAS por tarea:
      - linea PALLET          -> pallets = Cant ; cajas_eq = Cant * Factor ; sueltas = 0
      - linea CJ con Factor    -> pallets = ENTERO(Cant/Factor) ; sueltas = Cant - pallets*Factor
      - linea CJ sin Factor    -> sueltas = Cant
    El Factor sale del maestro_articulo y, si falta, del codigo de paletizado (P###C).
    Devuelve (DataFrame por tarea [cajas_eq, pallets, cajas_sueltas], info).
    """
    fc = _resolve_columns(flujo_raw, FLUJO_FIELDS)
    faltan = [f for f in ("um", "cant") if f not in fc]
    if faltan or ("nro_tarea" not in fc and "nro_picking" not in fc):
        raise ValueError(f"FlujoSalidas sin columnas clave (detectado {fc}). "
                         f"Faltan: {faltan or ['nro_tarea/nro_picking']}")

    f = pd.DataFrame(index=flujo_raw.index)
    f["tarea"]   = _normaliza_tarea(flujo_raw[fc["nro_tarea"]]) if "nro_tarea" in fc else ""
    f["picking"] = flujo_raw[fc["nro_picking"]].astype(str).str.strip() if "nro_picking" in fc else ""
    f["um"]      = flujo_raw[fc["um"]].astype(str).str.strip().str.upper()
    f["cant"]    = _to_num(flujo_raw[fc["cant"]]).fillna(0.0)
    f["cod"]     = (flujo_raw[fc["cod_articulo"]].astype(str).str.strip().str.zfill(18)
                    if "cod_articulo" in fc else "")

    # factor cajas/pallet: 1) maestro de articulos, 2) codigo de paletizado (V7)
    factor = {}
    if maestro_articulo is not None and not maestro_articulo.empty:
        mc = _resolve_columns(maestro_articulo, {
            "cod":    ["cod articulo", "codarticulo", "codigo articulo"],
            "factor": ["factor", "cajas por pallet iso", "cajas por pallet", "cajas pallet"],
        })
        if "cod" in mc and "factor" in mc:
            mm = maestro_articulo.copy()
            mm["_k"] = mm[mc["cod"]].astype(str).str.strip().str.zfill(18)
            mm["_f"] = _to_num(mm[mc["factor"]])
            factor = dict(mm.dropna(subset=["_f"]).drop_duplicates("_k")[["_k", "_f"]].to_numpy())

    f["factor"] = f["cod"].map(factor)
    if "paletizado" in fc:   # respaldo V7: factor desde el codigo P###C
        f["factor"] = f["factor"].fillna(_factor_desde_sku(flujo_raw[fc["paletizado"]]))

    es_pallet = f["um"].str.contains("PALLET", na=False)
    fac = f["factor"]
    cant = f["cant"]

    # --- descomposicion por linea (V7, respetando la UM de extraccion) --------
    f["pallets"]       = 0.0
    f["cajas_sueltas"] = 0.0
    f["cajas_eq"]      = cant.copy()

    # 1) lineas marcadas PALLET: la cantidad son pallets fisicos
    f.loc[es_pallet, "pallets"]       = cant[es_pallet]
    f.loc[es_pallet, "cajas_eq"]      = cant[es_pallet] * fac[es_pallet].fillna(1.0)
    f.loc[es_pallet, "cajas_sueltas"] = 0.0

    # 2) lineas CJ con factor >=1 y cantidad suficiente: caso mixto ENTERO(cant/factor)
    cj = ~es_pallet
    mix = cj & fac.notna() & (fac >= 1) & (cant >= fac)
    p_mix = (cant[mix] // fac[mix])
    f.loc[mix, "pallets"]       = p_mix
    f.loc[mix, "cajas_sueltas"] = cant[mix] - p_mix * fac[mix]
    f.loc[mix, "cajas_eq"]      = cant[mix]

    # 3) resto de lineas CJ: todo caja suelta
    rest = cj & ~mix
    f.loc[rest, "cajas_sueltas"] = cant[rest]
    f.loc[rest, "cajas_eq"]      = cant[rest]

    sin_factor = sorted(f.loc[es_pallet & fac.isna(), "cod"].unique().tolist())

    # agregacion por tarea (y por picking como respaldo)
    cols = ["cajas_eq", "pallets", "cajas_sueltas"]
    por_tarea   = f.groupby("tarea")[cols].sum()
    por_picking = f.groupby("picking")[cols].sum()

    out = pd.DataFrame(index=elig.index, columns=cols, dtype=float)
    mask_t = elig["nro_tarea"].isin(por_tarea.index)
    out.loc[mask_t] = por_tarea.reindex(elig.loc[mask_t, "nro_tarea"]).to_numpy()
    if "nro_picking" in elig.columns:
        falta = out["cajas_eq"].isna()
        mask_p = falta & elig["nro_picking"].isin(por_picking.index)
        out.loc[mask_p] = por_picking.reindex(elig.loc[mask_p, "nro_picking"]).to_numpy()
    cruce = float(out["cajas_eq"].notna().mean()) if len(out) else 0.0
    out = out.fillna(0.0)

    info = {
        "lineas_flujo":      int(len(f)),
        "lineas_cj":         int(cj.sum()),
        "lineas_pallet":     int(es_pallet.sum()),
        "pallets_completos": round(float(f["pallets"].sum()), 2),
        "cajas_sueltas":     round(float(f["cajas_sueltas"].sum()), 2),
        "cajas_eq_total":    round(float(f["cajas_eq"].sum()), 2),
        "pct_pallet":        round(float((f["cajas_eq"] - f["cajas_sueltas"]).sum())
                                   / float(f["cajas_eq"].sum()) * 100, 1) if f["cajas_eq"].sum() else 0.0,
        "cruce_pct":         round(cruce * 100, 1),
        "articulos_sin_factor": sin_factor,
        "n_articulos_sin_factor": len(sin_factor),
    }
    return out, info


def calcular(df_prep: pd.DataFrame, umbral_pallet: float = 60.0,
             efic_override: dict | None = None,
             flujo_raw: pd.DataFrame | None = None,
             maestro_articulo: pd.DataFrame | None = None) -> dict:
    elig = df_prep[df_prep["elegible"]].copy()

    # ------------------------------------------------------------------ #
    # VISTA 3: eficiencia vs tiempo estandar. Ajusta/define los coeficientes
    # y agrega t_std_min por tarea; _agg calcula 'efic' por cada grano.
    # ------------------------------------------------------------------ #
    modelo = fit_estandar(elig, efic_override) if len(elig) else dict(EFIC_DEFAULT)
    if len(elig):
        elig["t_std_min"] = (modelo["a"]
                             + modelo["b"] * elig["cajas"].astype(float)
                             + modelo["c"] * elig["ubicaciones"].astype(float))

    # ------------------------------------------------------------------ #
    # CAJAS-EQUIVALENTES EXACTAS (si llega el detalle por linea FlujoSalidas)
    # ------------------------------------------------------------------ #
    flujo_info = None
    if flujo_raw is not None and len(elig):
        fx, flujo_info = cruzar_flujo(elig, flujo_raw, maestro_articulo)
        elig["cajas_eq"] = fx["cajas_eq"].values
        # EXACTO reemplaza al proxy donde hubo cruce con el flujo
        cruzado = fx["cajas_eq"].to_numpy() > 0
        elig.loc[cruzado, "pallets"]       = fx.loc[cruzado, "pallets"].values
        elig.loc[cruzado, "cajas_sueltas"] = fx.loc[cruzado, "cajas_sueltas"].values

    # para granos por-persona, arrastrar cargo/turno (1er valor por usuario)
    cargo_turno = (elig.sort_values("usuario")
                       .drop_duplicates("usuario")
                       .set_index("usuario")[["cargo", "turno"]])

    def _enriquecer_persona(rows):
        for r in rows:
            u = r.get("usuario")
            if u in cargo_turno.index:
                r["cargo"] = str(cargo_turno.loc[u, "cargo"])
                r["turno"] = str(cargo_turno.loc[u, "turno"])
        return rows

    resultado = {
        "global":          (_agg(elig, None)[0] if len(elig) else {}),
        "por_persona":     _enriquecer_persona(_agg(elig, ["usuario"])),
        "por_dia":         _agg(elig, ["dia"]),
        "por_mes":         _agg(elig, ["mes"]),
        "por_persona_dia": _enriquecer_persona(_agg(elig, ["usuario", "dia"])),
        "por_persona_mes": _enriquecer_persona(_agg(elig, ["usuario", "mes"])),
        "por_turno":       _agg(elig, ["turno"]),
    }

    # ------------------------------------------------------------------ #
    # VISTA NUEVA (aditiva): separacion por tipo de UOM + comparativo.
    # Lo de arriba (lo que calculan los jefes) queda intacto. Aqui solo
    # se agrega la forma normalizada para poder mostrar las dos.
    # ------------------------------------------------------------------ #
    resultado["por_tipo_uom"]    = _agg(elig, ["tipo_uom"])
    resultado["por_persona_uom"] = _enriquecer_persona(_agg(elig, ["usuario", "tipo_uom"]))

    g = resultado["global"] or {}
    h_glob = float(g.get("horas", 0) or 0)
    tipos = {r["tipo_uom"]: r for r in resultado["por_tipo_uom"]}
    det = tipos.get("DETALLE", {})
    pal = tipos.get("PALLET", {})

    def _pct_h(r):
        return round(float(r.get("horas", 0)) / h_glob * 100, 1) if h_glob else 0.0

    resultado["comparativo"] = {
        "metodo_jefes_global": {          # <- identico al grano 'global', sin cambios
            "cajas_hr": g.get("cajas_hr", 0),
            "horas":    g.get("horas", 0),
            "tareas":   g.get("tareas", 0),
            "nota": "Forma actual de los jefes: cuenta toda caja por igual "
                    "(los pallets completos inflan la tasa).",
        },
        "metodo_nuevo": {                 # <- UOM separada, sin promediar peras con manzanas
            "detalle_pick": {
                "cajas_hr": det.get("cajas_hr", 0),
                "horas":    det.get("horas", 0),
                "tareas":   det.get("tareas", 0),
                "pct_horas": _pct_h(det),
            },
            "pallet_move": {
                "pallets_hr": pal.get("ubic_hr", 0),   # 1 pallet = 1 ubicacion
                "cajas_hr":   pal.get("cajas_hr", 0),
                "horas":      pal.get("horas", 0),
                "tareas":     pal.get("tareas", 0),
                "pct_horas":  _pct_h(pal),
            },
            "nota": "Normaliza la unidad de medida (estandar 3PL/WMS): el picking "
                    "de detalle se mide en cajas/h REAL (sin distorsion de pallets) "
                    "y el movimiento de pallet en pallets/h (1 pallet = 1 ubicacion).",
        },
    }

    # ------------------------------------------------------------------ #
    # MIX de extraccion: participacion caja suelta vs pallet (cajas-equiv)
    # ------------------------------------------------------------------ #
    cajas_tot    = float(elig["cajas"].sum()) if len(elig) else 0.0
    sueltas_tot  = float(elig["cajas_sueltas"].sum()) if len(elig) else 0.0
    pallet_equiv = max(cajas_tot - sueltas_tot, 0.0)
    base_mix     = sueltas_tot + pallet_equiv
    resultado["mix"] = {
        "cajas_sueltas":      round(sueltas_tot, 0),
        "cajas_equiv_pallet": round(pallet_equiv, 0),
        "total_equiv":        round(base_mix, 0),
        "pct_cajas":   round(sueltas_tot / base_mix * 100, 1) if base_mix else 0.0,
        "pct_pallets": round(pallet_equiv / base_mix * 100, 1) if base_mix else 0.0,
        "pallets":     round(float(elig["pallets"].sum()), 0) if len(elig) else 0.0,
    }

    # ------------------------------------------------------------------ #
    # PARTICIPACION POR FAMILIA (respecto a cajas sueltas procesadas)
    # ------------------------------------------------------------------ #
    fam_rows = []
    if len(elig) and "familia" in elig.columns:
        gf = elig.groupby("familia", dropna=False)
        base = gf[["cajas_sueltas", "cajas"]].sum().reset_index()
        tot_s = float(base["cajas_sueltas"].sum()) or 1.0
        for _, r in base.iterrows():
            fam_rows.append({
                "familia":       str(r["familia"]),
                "cajas_sueltas": round(float(r["cajas_sueltas"]), 0),
                "cajas":         round(float(r["cajas"]), 0),
                "pct":           round(float(r["cajas_sueltas"]) / tot_s * 100, 1),
            })
        fam_rows.sort(key=lambda x: x["cajas_sueltas"], reverse=True)
    resultado["por_familia"] = fam_rows

    # panel de excepciones
    exc = df_prep[~df_prep["elegible"]]
    resultado["excepciones"] = {
        "total": int(len(exc)),
        "por_motivo": [
            {"motivo": k, "tareas": int(v)}
            for k, v in exc["motivo_exclusion"].value_counts().items()
        ],
    }

    # metadatos / cobertura
    resultado["meta"] = {
        "tareas_total":       int(len(df_prep)),
        "tareas_elegibles":   int(len(elig)),
        "tareas_excepcion":   int(len(exc)),
        "personas":           int(elig["usuario"].nunique()),
        "dias":               int(elig["dia"].nunique()),
        "meses":              int(elig["mes"].nunique()),
        "rango_fechas":       [
            (elig["dia"].min() if len(elig) else None),
            (elig["dia"].max() if len(elig) else None),
        ],
        "horas_totales":      round(float(elig["horas"].sum()), 2),
        "regla_kpi":          "razon de totales (Σnum/Σhoras); solo COMPLETADA con T.Prep>0",
        "umbral_pallet_cajas_por_ubic": umbral_pallet,
        "tareas_pallet":      int((elig["tipo_uom"] == "PALLET").sum()),
        "tareas_detalle":     int((elig["tipo_uom"] == "DETALLE").sum()),
    }

    # modelo de tiempo estandar (vista 3)
    rng = None
    if resultado["por_persona"]:
        efs = [p["efic"] for p in resultado["por_persona"] if "efic" in p]
        if efs:
            rng = [round(min(efs), 1), round(max(efs), 1)]
    resultado["meta"]["modelo_estandar"] = {
        **modelo,
        "formula": "t_estandar(min) = a + b*unidades + c*visitas",
        "nota": "100% = promedio de la operacion. Limitacion: sobreestima tareas "
                "muy cortas (eficiencias extremas con muchas tareas chicas).",
        "rango_efic_persona": rng,
    }

    # cobertura de maestros (para completarlos)
    usuarios_sin_turno = sorted(
        elig.loc[elig["turno"].isin(["SIN TURNO", "", "nan"]), "usuario"].unique().tolist()
    )
    resultado["meta"]["cobertura"] = {
        "usuarios_sin_turno":   usuarios_sin_turno,
        "n_usuarios_sin_turno": len(usuarios_sin_turno),
    }
    if flujo_info is not None:
        resultado["meta"]["cobertura"]["articulos_sin_factor"]   = flujo_info["articulos_sin_factor"]
        resultado["meta"]["cobertura"]["n_articulos_sin_factor"] = flujo_info["n_articulos_sin_factor"]
        resultado["meta"]["flujo"] = {k: v for k, v in flujo_info.items()
                                      if k != "articulos_sin_factor"}
    return resultado


# ----------------------------------------------------------------------------- #
# Salidas
# ----------------------------------------------------------------------------- #
def exportar_xlsx(resultado: dict, path: str | Path) -> None:
    with pd.ExcelWriter(path, engine="openpyxl") as xw:
        pd.DataFrame([resultado["global"]]).to_excel(xw, sheet_name="global", index=False)
        for sheet in ("por_persona", "por_dia", "por_mes",
                      "por_persona_dia", "por_persona_mes", "por_turno"):
            pd.DataFrame(resultado[sheet]).to_excel(xw, sheet_name=sheet[:31], index=False)
        pd.DataFrame(resultado["excepciones"]["por_motivo"]).to_excel(
            xw, sheet_name="excepciones", index=False)

        # --- hojas de la VISTA NUEVA (aditivas) ---
        for sheet in ("por_tipo_uom", "por_persona_uom"):
            pd.DataFrame(resultado[sheet]).to_excel(xw, sheet_name=sheet[:31], index=False)

        # hoja comparativa legible: metodo jefes vs metodo nuevo, lado a lado
        c = resultado["comparativo"]
        jg, mn = c["metodo_jefes_global"], c["metodo_nuevo"]
        comp_rows = [
            {"metodo": "JEFES (actual)", "segmento": "GLOBAL (toda caja)",
             "cajas_hr": jg["cajas_hr"], "pallets_hr": "",
             "horas": jg["horas"], "tareas": jg["tareas"], "pct_horas": 100.0,
             "nota": jg["nota"]},
            {"metodo": "NUEVO", "segmento": "Picking de detalle",
             "cajas_hr": mn["detalle_pick"]["cajas_hr"], "pallets_hr": "",
             "horas": mn["detalle_pick"]["horas"], "tareas": mn["detalle_pick"]["tareas"],
             "pct_horas": mn["detalle_pick"]["pct_horas"],
             "nota": "Cajas/h reales del armado de pedido (sin pallets)."},
            {"metodo": "NUEVO", "segmento": "Movimiento de pallet",
             "cajas_hr": mn["pallet_move"]["cajas_hr"],
             "pallets_hr": mn["pallet_move"]["pallets_hr"],
             "horas": mn["pallet_move"]["horas"], "tareas": mn["pallet_move"]["tareas"],
             "pct_horas": mn["pallet_move"]["pct_horas"],
             "nota": mn["nota"]},
        ]
        pd.DataFrame(comp_rows).to_excel(xw, sheet_name="comparativo", index=False)


def main() -> int:
    ap = argparse.ArgumentParser(description="Motor de Productividad de Picking (Unilever/KCC).")
    ap.add_argument("--tareas", required=True, help="ReportTareas .xlsx/.csv del w4w")
    ap.add_argument("--maestro-usuario", default="", help="Maestro Usuario->Cargo/Turno (opcional)")
    ap.add_argument("--umbral-pallet", type=float, default=60.0,
                    help="Cajas por ubicacion a partir de las cuales una tarea se "
                         "considera movimiento de pallet (default 60; anclado al "
                         "pallet mas chico del catalogo).")
    ap.add_argument("--horas-max", type=float, default=16.0,
                    help="Tareas COMPLETADA con horas > este limite van a excepciones "
                         "(dato sucio). 0 desactiva la regla. Default 16.")
    ap.add_argument("--flujo", default="",
                    help="FlujoSalidas (detalle por linea) para cajas-equivalentes exactas.")
    ap.add_argument("--maestro-articulo", default="",
                    help="Maestro CodArticulo->Factor (cajas/pallet). Requiere --flujo.")
    ap.add_argument("--efic-a", type=float, default=None, help="Fijar intercepto del t.estandar.")
    ap.add_argument("--efic-b", type=float, default=None, help="Fijar coef. por unidad.")
    ap.add_argument("--efic-c", type=float, default=None, help="Fijar coef. por visita.")
    ap.add_argument("--out-json", default="productividad.json")
    ap.add_argument("--out-xlsx", default="", help="Excel con una hoja por grano (opcional)")
    args = ap.parse_args()

    df_raw = read_any(args.tareas)
    maestro = read_any(args.maestro_usuario) if args.maestro_usuario else None
    flujo = read_any(args.flujo) if args.flujo else None
    m_articulo = read_any(args.maestro_articulo) if args.maestro_articulo else None
    efic_override = ({"a": args.efic_a, "b": args.efic_b, "c": args.efic_c}
                     if None not in (args.efic_a, args.efic_b, args.efic_c) else None)

    df_prep = preparar_tareas(df_raw, maestro, umbral_pallet=args.umbral_pallet,
                              horas_max=args.horas_max)
    resultado = calcular(df_prep, umbral_pallet=args.umbral_pallet,
                         efic_override=efic_override, flujo_raw=flujo,
                         maestro_articulo=m_articulo)

    Path(args.out_json).write_text(
        json.dumps(resultado, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    print(f"[OK] JSON -> {args.out_json}")
    if args.out_xlsx:
        exportar_xlsx(resultado, args.out_xlsx)
        print(f"[OK] XLSX -> {args.out_xlsx}")

    m = resultado["meta"]
    g = resultado["global"]
    print("\n== RESUMEN ==")
    print(f"Tareas: {m['tareas_total']}  elegibles: {m['tareas_elegibles']}  "
          f"excepciones: {m['tareas_excepcion']}")
    print(f"Personas: {m['personas']}  dias: {m['dias']}  meses: {m['meses']}  "
          f"horas: {m['horas_totales']}")
    if g:
        print(f"GLOBAL: {g['cajas_hr']} cajas/h | {g['m3_hr']} m3/h | {g['tn_hr']} Tn/h | "
              f"{g['ubic_hr']} ubic/h | {g['detalle_hr']} detalle/h | {g['tareas_hr']} tareas/h")
    c = resultado.get("comparativo")
    if c:
        jg, mn = c["metodo_jefes_global"], c["metodo_nuevo"]
        dp, pm = mn["detalle_pick"], mn["pallet_move"]
        print(f"\n== COMPARATIVO (umbral {m['umbral_pallet_cajas_por_ubic']} caj/ubic) ==")
        print(f"JEFES (actual):  {jg['cajas_hr']} cajas/h  (toda caja por igual)")
        print(f"NUEVO detalle :  {dp['cajas_hr']} cajas/h  "
              f"({m['tareas_detalle']} tareas, {dp['pct_horas']}% horas)")
        print(f"NUEVO pallet  :  {pm['pallets_hr']} pallets/h  "
              f"({m['tareas_pallet']} tareas, {pm['pct_horas']}% horas)")

    me = m.get("modelo_estandar")
    if me:
        print(f"\n== EFICIENCIA (t.estandar: a={me['a']} b={me['b']} c={me['c']} R2={me['r2']}) ==")
        print(f"GLOBAL efic: {g.get('efic', 100.0)}%  (100% = promedio de la operacion)"
              + (f" | rango persona {me['rango_efic_persona']}" if me.get('rango_efic_persona') else ""))

    fl = m.get("flujo")
    if fl:
        print(f"\n== FLUJOSALIDAS (separacion exacta V7) ==")
        print(f"cajas_eq: {fl['cajas_eq_total']:,.0f}  (sueltas {fl['cajas_sueltas']:,.0f} + "
              f"pallets {fl['pallets_completos']:,.0f} pallets = {fl['pct_pallet']}% equiv.pallet) | "
              f"cruce {fl['cruce_pct']}%")

    cob = m.get("cobertura", {})
    if cob:
        print(f"\n== COBERTURA MAESTROS ==")
        print(f"usuarios sin turno: {cob.get('n_usuarios_sin_turno', 0)}"
              + (f" -> {', '.join(cob['usuarios_sin_turno'][:15])}" if cob.get('usuarios_sin_turno') else ""))
        if "n_articulos_sin_factor" in cob:
            print(f"articulos sin factor: {cob['n_articulos_sin_factor']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
