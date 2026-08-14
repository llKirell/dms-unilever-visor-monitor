// DINET Dashboard â€” carga Excel directo en el navegador
// Lee .xlsx con SheetJS, mapea columnas flexiblemente, calcula KPIs
// Persiste en localStorage para que sobreviva al refresh

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//  COLUMN ALIASES â€” agrega aquÃ­ variantes si tu Excel usa otros nombres
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const COL_ALIASES = {
  dt:      ['dt', '#dt', 'numerodt', 'nrodt', 'numdt', 'iddt', 'doctransporte', 'dttransporte'],
  transp:  ['transporte', 'transportista', 'empresatransporte', 'empresa', 'transp'],
  solicit: ['solicitante', 'codigosolicitante', 'idsolicitante'],
  cliente: ['cliente', 'razonsocial', 'nombrecliente', 'clientefinal'],
  destino: ['destino', 'direcciondestino', 'ruta', 'direccion', 'lugardestino', 'distrito'],
  ton:     ['ton', 'toneladas', 'tn', 'peso', 'pesoton', 'pesokg', 'kg', 'kilos'],
  m3:      ['m3', 'metroscubicos', 'metros3', 'volumen', 'volumenm3', 'm3', 'vol'],
  ped:     ['unidsolicitadasreal', 'totalundsolicitadas', 'undsolicitadas', 'pedido', 'cajaspedido', 'totalcajas', 'cajaspedidas', 'cajas', 'cantidad', 'bultos', 'unidades', 'totalbultos', 'totalpedido', 'cant', 'umsasignadapicking', 'umsasignada'],
  av:      ['avance', 'cajasavance', 'cajasprocesadas', 'cajaspicadas', 'cajaspicking', 'cajascargadas', 'bultosavance', 'bultoscargados', 'avancecajas', 'procesado', 'totalundpicadas', 'undpicadas', 'umsliberada', 'umsliberadas', 'umscompletadas', 'unidadesatendidas', 'unidpicadasreal', 'unidpickadasreal'],
  placa:   ['placa', 'placaunidad', 'placa_unidad', 'numplaca', 'placavehiculo', 'vehiculo'],
  obs:     ['obs', 'observacion', 'observaciones'],
  ubigeo:  ['ubigeo', 'codigoubigeo'],
  embarque:['embarque10', 'embarque_10', 'embarque', 'dtembarque'],
  archivo: ['archivofuente', 'archivo_fuente', 'fuente'],
  fechaArchivo: ['fechaarchivo', 'fecha_archivo', 'fechaorigen', 'fecha_fuente'],
  match:   ['matchapi', 'match_api'],
  fecEjec: ['fechaejecucion', 'fecha_ejecucion'],
  tTot:    ['totaltareas', 'total_tareas'],
  tComp:   ['tareascompletadas', 'tareas_completadas'],
  hIni:    ['horainiciopicking', 'hora_inicio_picking'],
  hFin:    ['horafinpicking', 'hora_fin_picking'],
  tMin:    ['tiempopickingmin', 'tiempo_picking_min'],
  fecOp:   ['fechaoperativaturno', 'fecha_operativa_turno'],
  umsAsg:  ['umsasignadapicking', 'ums_asignada_picking'],
  porcPk:  ['porccumplimientopicking', 'porc_cumplimiento_picking'],
  difUnd:  ['difunidades', 'dif_unidades'],
  stage:   ['stage', 'etapa', 'fase', 'estadopicking'],
  rampa:   ['rampa', 'anden', 'andén', 'numerorampa', 'docking', 'puerta'],
  cerrado: ['cerrado', 'isclosed'],
  traza:   ['trazatareas', 'traza_tareas'],
  difReal: ['difunidadesreal', 'dif_unidades_real'],
  porcReal:['porccumplimientopickingreal', 'porc_cumplimiento_picking_real'],
  ajuste:  ['ajusteaplicado', 'ajuste_aplicado'],
  motivo:  ['motivoajuste', 'motivo_ajuste'],
  porcAdj: ['porccumplimientopickingajustado', 'porc_cumplimiento_picking_ajustado'],
  difAdj:  ['difunidadesajustada', 'dif_unidades_ajustada'],
  provisional: ['provisional'],
  qcStatus: ['qcstatus', 'qc_status', 'qcestado', 'estadoqc', 'statusqc'],
  cita:    ['cita', 'horacita', 'horaprogramada', 'horacarga', 'horadespacho', 'horallegada', 'fechacita', 'programado', 'vh'],
  status:  ['estado', 'status', 'estadocarga', 'situacion', 'estadodt', 'estadogeneral', 'estadocumplimiento', 'cumplimiento'],
  estadoCarga: ['estadocarga', 'estado_carga', 'statuscarga'],
  estadoCargaAuto: ['estadocargaauto', 'estado_carga_auto'],
  estadoCargaManual: ['estadocargamanual', 'estado_carga_manual'],
  turno:   ['turno', 'numturno', 'turnodescarga', 'turnocarga'],
  tipo:    ['tipo', 'modalidad', 'localprovincia', 'tipodestino', 'tipodt', 'tipozona'],
};
const HISTORICAL_CARGADO_CUTOFF = '2026-07-03';
const STORAGE_KEY = window.DINET_STORAGE_KEY || 'dinet-data';
const OVERRIDE_KEY = window.DINET_OVERRIDE_KEY || 'dinet-monitor-overrides';
const EMBEDDED_MODE = window.DINET_EMBEDDED_SOURCE === 'dms-monitor';

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

function readCachedDashboardPayload() {
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    return cached ? JSON.parse(cached) : null;
  } catch (e) {
    return null;
  }
}

function deriveRampaFromStage(stage, fallback = '') {
  const s = String(stage ?? '').trim();
  const m = s.match(/st\.\s*(\d{1,2})\s*\./i);
  if (m) return String(parseInt(m[1], 10));
  return String(fallback ?? '').trim();
}

function normalizeCita(v) {
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  if (!s) return '';
  if (s.includes(':') || s.includes('/')) return s;

  const n = Number(s);
  if (!Number.isFinite(n)) return s;

  // Prioridad operativa (1/2/3/...)
  if (Number.isInteger(n) && n >= 1 && n <= 9) return String(n);

  // Hora en formato serial Excel (fracción de día)
  if (n > 0 && n < 1) {
    const totalMinutes = Math.round(n * 24 * 60);
    const hh = String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0');
    const mm = String(totalMinutes % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  // Fecha serial Excel
  if (n >= 59 && n < 60000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const ms = Math.round(n * 24 * 60 * 60 * 1000);
    const d = new Date(excelEpoch.getTime() + ms);
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yy = d.getUTCFullYear();
    return `${dd}/${mm}/${yy}`;
  }

  return s;
}

function normalizeOperationalDateValue(v) {
  if (v === null || v === undefined) return '';
  const raw = String(v).trim();
  if (!raw) return '';

  if (/^\d+(\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    if (Number.isFinite(serial) && serial >= 59 && serial < 60000) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const ms = Math.round(serial * 24 * 60 * 60 * 1000);
      const d = new Date(excelEpoch.getTime() + ms);
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  const dmy = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;

  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const yyyy = parsed.getFullYear();
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const dd = String(parsed.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return raw;
}

function formatUiDateTime(v, { includeYear = false } = {}) {
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return includeYear ? `${dd}/${mm}/${yy} ${hh}:${mi}` : `${dd}/${mm} ${hh}:${mi}`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function textOrPlaceholder(v, placeholder = 'Sin dato') {
  const s = String(v ?? '').trim();
  return s || placeholder;
}

function numberOrPlaceholder(v, row, digits = 1) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 'Sin dato';
  const missingMeta = row && (row.provisional && (!String(row.transp ?? '').trim() || !String(row.destino ?? '').trim()));
  if (missingMeta && n === 0) return 'Sin dato';
  return n.toFixed(digits);
}

function parseLooseNumber(v, d = 0) {
  if (v === null || v === undefined || v === '') return d;
  if (typeof v === 'number') return Number.isFinite(v) ? v : d;
  let s = String(v).trim().replace(/\s/g, '');
  if (!s) return d;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma && !hasDot) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : d;
}

function normalizeWeightToTon(v, weightMode = 'published_ton') {
  const raw = parseLooseNumber(v, 0);
  return weightMode === 'excel_kg' ? raw / 1000 : raw;
}

function mapRow(raw, { weightMode = 'published_ton' } = {}) {
  const idx = {};
  for (const k of Object.keys(raw)) idx[norm(k)] = raw[k];
  const pick = (key) => {
    for (const alias of COL_ALIASES[key]) if (idx[alias] !== undefined && idx[alias] !== '') return idx[alias];
    return undefined;
  };
  const num = parseLooseNumber;
  const ped = num(pick('ped'));
  const av = num(pick('av'));
  const tonRaw = num(pick('ton'));
  const m3Raw = num(pick('m3'));
  const ton = normalizeWeightToTon(pick('ton'), weightMode);
  const pct = ped > 0 ? Math.min(100, (av / ped) * 100) : 0;
  const rawStatus = String(pick('status') || '').trim();
  const rawEstadoCarga = String(pick('estadoCarga') || '').trim();
  const rawEstadoCargaAuto = String(pick('estadoCargaAuto') || '').trim();
  const rawEstadoCargaManual = String(pick('estadoCargaManual') || '').trim();
  const rawTipo = String(pick('tipo') || '').trim();
  const rawDestino = String(pick('destino') ?? '');
  const rawUbigeo = String(pick('ubigeo') ?? '');
  const rawFecha = String(
    pick('fecOp') ??
    raw.FechaOperativaTurno ??
    raw.FECHA_OPERATIVA_TURNO ??
    raw.fechaoperativaturno ??
    raw.FechaOperativa ??
    raw.FECHA_OPERATIVA ??
    raw.fechaoperativa ??
    raw.FechaEjecucion ??
    raw.FECHA_EJECUCION ??
    raw.fechaejecucion ??
    raw.Fecha ??
    raw.FECHA ??
    raw.fecha ??
    ''
  );
  const normalizedOperationalDate = normalizeOperationalDateValue(
    pick('fecOp') ??
    raw.FechaOperativaTurno ??
    raw.FECHA_OPERATIVA_TURNO ??
    raw.fechaoperativaturno ??
    rawFecha
  );
  const destinoNorm = norm(rawDestino);
  const inferTipo = () => {
    if (rawTipo) return rawTipo;
    if (rawUbigeo) {
      if (/^15|^07/.test(String(rawUbigeo).trim())) return 'LOCAL';
      return 'PROVINCIA';
    }
    if (destinoNorm.includes('provincia')) return 'PROVINCIA';
    if (destinoNorm.includes('lima') || destinoNorm.includes('callao') || destinoNorm.includes('local')) return 'LOCAL';
    if (/\bpe\s*0*(15|07)/i.test(rawDestino)) return 'LOCAL';
    return 'PROVINCIA';
  };
  const stageVal = String(pick('stage') ?? '').trim();
  const autoEstadoCarga = getAutoEstadoCargaByContext({
    pct,
    av,
    fechaOperativa: normalizedOperationalDate,
    explicitAuto: rawEstadoCargaAuto,
  });
  const manualEstadoCarga = extractManualEstadoCarga(rawEstadoCargaManual) || extractManualEstadoCarga(rawEstadoCarga);
  const effectiveEstadoCarga = manualEstadoCarga || autoEstadoCarga;
  return {
    dt:      String(pick('dt') ?? ''),
    transp:  String(pick('transp') ?? ''),
    solicit: String(pick('solicit') ?? ''),
    cliente: String(pick('cliente') ?? ''),
    destino: rawDestino,
    ton,
    m3:      m3Raw,
    ped, av, pct,
    placa:   (pick('placa') !== undefined && String(pick('placa')).trim() !== '') ? String(pick('placa')).trim() : null,
    stage:   stageVal,
    rampa:   deriveRampaFromStage(stageVal, pick('rampa') ?? ''),
    cita:    normalizeCita(pick('cita')),
    status:  rawStatus || 'Por trabajar',
    estadoCarga: effectiveEstadoCarga,
    estadoCargaAuto: autoEstadoCarga,
    estadoCargaManual: manualEstadoCarga,
    turno:   num(pick('turno'), 1),
    tipo:    inferTipo(),
    fecha:   normalizeOperationalDateValue(rawFecha) || rawFecha,
    obs:     String(pick('obs') ?? ''),
    ubigeo:  String(pick('ubigeo') ?? ''),
    embarque:String(pick('embarque') ?? ''),
    archivo: String(pick('archivo') ?? ''),
    fechaArchivo: String(pick('fechaArchivo') ?? ''),
    match:   String(pick('match') ?? ''),
    fecEjec: String(pick('fecEjec') ?? ''),
    tTot:    num(pick('tTot')),
    tComp:   num(pick('tComp')),
    hIni:    String(pick('hIni') ?? ''),
    hFin:    String(pick('hFin') ?? ''),
    tMin:    num(pick('tMin')),
    fecOp:   normalizedOperationalDate,
    umsAsg:  num(pick('umsAsg')),
    porcPk:  num(pick('porcPk')),
    difUnd:  num(pick('difUnd')),
    cerrado: String(pick('cerrado') ?? ''),
    traza:   String(pick('traza') ?? ''),
    difReal: num(pick('difReal')),
    porcReal:num(pick('porcReal')),
    ajuste:  String(pick('ajuste') ?? ''),
    motivo:  String(pick('motivo') ?? ''),
    provisional: String(pick('provisional') ?? 'NO').trim().toUpperCase() === 'SI',
    qcStatus: String(pick('qcStatus') ?? '').trim().toLowerCase(),
    porcAdj: num(pick('porcAdj')),
    difAdj:  num(pick('difAdj')),
  };
}

function parseFlexibleDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n) && n >= 59 && n < 60000) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const ms = Math.round(n * 24 * 60 * 60 * 1000);
      const d = new Date(excelEpoch.getTime() + ms);
      return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    }
  }
  const m1 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m1) return new Date(Number(m1[3]), Number(m1[2]) - 1, Number(m1[1]));
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return new Date(Number(m2[1]), Number(m2[2]) - 1, Number(m2[3]));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isPastOperationalDate(value) {
  const normalized = normalizeOperationalDateValue(value);
  if (!normalized) return false;
  return normalized <= HISTORICAL_CARGADO_CUTOFF;
}

function getAutoEstadoCargaByContext({ pct = 0, av = 0, fechaOperativa = '', explicitAuto = '' }) {
  if (isPastOperationalDate(fechaOperativa)) return 'CARGADO';
  const normalizedExplicit = normalizeEstadoCargaLabel(explicitAuto);
  if (normalizedExplicit) return normalizedExplicit;
  if (pct >= 100) return 'PREPARADO';
  if (av > 0 || pct > 0) return 'EN PROCESO';
  return 'PENDIENTE';
}

function getTemporalDateValue(row, mode = 'actualizacion') {
  const temporalMode = String(mode || 'actualizacion').toLowerCase();
  if (temporalMode === 'operativo') {
    return String(
      row?.fecOp ??
      row?.fechaOperativaTurno ??
      row?.fecha ??
      ''
    ).trim();
  }
  if (temporalMode === 'calendario') {
    return String(
      row?.hIni ??
      row?.hFin ??
      row?.fecOp ??
      row?.fechaOperativaTurno ??
      row?.fecha ??
      ''
    ).trim();
  }
  if (temporalMode === 'cierre') {
    return String(
      row?.hFin ??
      row?.hIni ??
      row?.fecOp ??
      row?.fechaOperativaTurno ??
      row?.fecha ??
      ''
    ).trim();
  }
  return String(
    row?.fechaArchivo ??
    row?.fecEjec ??
    row?.fechaEjecucion ??
    row?.fecha ??
    row?.fecOp ??
    row?.fechaOperativaTurno ??
    ''
  ).trim();
}

function getSourceValue(row) {
  return String(
    row?.archivo ??
    row?.source ??
    row?.filename ??
    row?.ARCHIVO_FUENTE ??
    ''
  ).trim();
}

function prettySourceValue(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  const parts = s.split(/[\\/]/).filter(Boolean);
  if (parts.length >= 3) return parts.slice(-3).join(' / ');
  if (parts.length >= 2) return parts.slice(-2).join(' / ');
  return s;
}

// Normaliza status a una de las categorÃ­as conocidas (case-insensitive)
function statusKey(s) {
  const n = norm(s);
  if (!n) return 'Por trabajar';
  if (n.includes('complet'))                                                       return 'Completo';
  if (n.includes('cargad') || n.includes('encarga') || n.includes('despachad'))    return 'En carga';
  if (n.includes('proceso') || n.includes('curso') || n.includes('picking'))       return 'En proceso';
  if (n.includes('pendient') || n.includes('espera'))                              return 'Pendiente';
  if (n.includes('portrabajar') || n.includes('inicial') || n.includes('sininicar') || n.includes('nuevo')) return 'Por trabajar';
  return s;
}

function normalizeEstadoCargaLabel(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const n = norm(s);
  if (n.includes('cargado') || n.includes('despachad')) return 'CARGADO';
  if (n.includes('preparad') || n.includes('completo')) return 'PREPARADO';
  if (n.includes('encarga') || n.includes('cargando')) return 'EN CARGA';
  if (n.includes('proceso') || n.includes('progres')) return 'EN PROCESO';
  if (n.includes('pendient') || n.includes('espera')) return 'PENDIENTE';
  return s.toUpperCase();
}

function estadoCargaMeta(v) {
  const e = normalizeEstadoCargaLabel(v);
  if (e === 'CARGADO') return { label: 'CARGADO', fg: '#138a46', bg: '#e9f7ef', bd: '#bde5cc' };
  if (e === 'EN CARGA') return { label: 'EN CARGA', fg: '#c77700', bg: '#fff4e6', bd: '#ffd9a8' };
  if (e === 'PREPARADO') return { label: 'PREPARADO', fg: '#16794a', bg: '#edf9f0', bd: '#c6e9d1' };
  if (e === 'EN PROCESO') return { label: 'EN PROCESO', fg: '#276ef1', bg: '#eef4ff', bd: '#cddcff' };
  return { label: 'PENDIENTE', fg: '#d93025', bg: '#fdecec', bd: '#f3b9b4' };
}

function pedidoRow(r) {
  const asg = Number(r?.umsAsg) || 0;
  if (asg > 0) return asg;
  return Number(r?.ped) || 0;
}

function isAdjustedComplete(r) {
  return String(r?.ajuste ?? '').trim().toUpperCase() === 'SI' &&
    Number(r?.porcAdj) >= 100 &&
    Number(r?.difAdj) === 0;
}

function getEffectivePickingPct(r) {
  const adj = Number(r?.porcAdj);
  if (isAdjustedComplete(r)) return 100;
  if (String(r?.ajuste ?? '').trim().toUpperCase() === 'SI' && Number.isFinite(adj) && adj > 0) {
    return Math.min(100, adj);
  }
  const real = Number(r?.porcReal);
  if (Number.isFinite(real) && real > 0) return Math.min(100, real);
  const pedido = pedidoRow(r);
  const avance = Number(r?.av) || 0;
  return pedido > 0 ? Math.min(100, (avance / pedido) * 100) : 0;
}

function getAutoEstadoCarga(r) {
  const pct = Number(getEffectivePickingPct(r)) || 0;
  const avance = Number(r?.av) || 0;
  return getAutoEstadoCargaByContext({
    pct,
    av: avance,
    fechaOperativa: r?.fecOp || r?.fechaOperativaTurno || r?.fecha || '',
    explicitAuto: r?.estadoCargaAuto || r?.estado_carga_auto || '',
  });
}

function extractManualEstadoCarga(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const n = norm(s);
  if (n.includes('encarga')) return 'EN CARGA';
  if (n.includes('cargado')) return 'CARGADO';
  return '';
}

function getManualEstadoCarga(r) {
  return extractManualEstadoCarga(r?.estadoCargaManual || r?.estado_carga_manual || '');
}

function getEffectiveAvanceUnits(r) {
  const pedido = pedidoRow(r);
  if (pedido <= 0) return Number(r?.av) || 0;
  return Math.max(0, Math.min(pedido, Math.round((getEffectivePickingPct(r) / 100) * pedido)));
}

function getEffectiveStatusKey(r) {
  return getEffectivePickingPct(r) >= 100 ? 'Completo' : statusKey(r.status);
}

function getEffectiveEstadoCarga(r) {
  if (isPastOperationalDate(r?.fecOp || r?.fechaOperativaTurno || r?.fecha || '')) return 'CARGADO';
  return getManualEstadoCarga(r) || getAutoEstadoCarga(r);
}

const MANUAL_OVERRIDE_FIELDS = ['placa', 'stage', 'rampa', 'cita', 'estado_carga_manual'];
const PENDING_OVERRIDES_STORAGE_KEY = 'dinet-pending-overrides-v1';

function buildEditKey(dt, fechaOperativaTurno = '') {
  const digits = String(dt || '').replace(/\D/g, '');
  if (!digits) return '';
  return `${digits.padStart(10, '0')}|${normalizeOperationalDateValue(fechaOperativaTurno)}`;
}

function getRowEditKey(row) {
  return buildEditKey(row?.dt, row?.fecOp || row?.fecha || '');
}

function normalizeTouchedFields(fields) {
  const out = [];
  const seen = new Set();
  for (const field of Array.isArray(fields) ? fields : []) {
    const name = String(field || '').trim().toLowerCase();
    if (!MANUAL_OVERRIDE_FIELDS.includes(name) || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

function normalizeOverridePatch(patch = {}) {
  const normalized = {};
  if (Object.prototype.hasOwnProperty.call(patch, 'placa')) {
    normalized.placa = String(patch.placa || '').trim().toUpperCase();
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'stage')) {
    normalized.stage = String(patch.stage || '').trim().toUpperCase();
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'rampa')) {
    normalized.rampa = String(patch.rampa || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'cita')) {
    normalized.cita = normalizeCita(patch.cita);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'estado_carga_manual')) {
    normalized.estado_carga_manual = extractManualEstadoCarga(patch.estado_carga_manual || '');
  }
  return normalized;
}

function mergeOverridePayload(current = {}, patch = {}) {
  const touched = normalizeTouchedFields([
    ...(current?.touched_fields || []),
    ...(patch?.touched_fields || []),
  ]);
  return {
    ...current,
    ...patch,
    touched_fields: touched,
  };
}

function loadPendingOverrideMapFromStorage() {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = localStorage.getItem(PENDING_OVERRIDES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const out = {};
    for (const [key, value] of Object.entries(parsed || {})) {
      const normalizedPatch = normalizeOverridePatch(value || {});
      const touchedFields = normalizeTouchedFields(
        value?.touched_fields || Object.keys(normalizedPatch)
      );
      if (!key || !touchedFields.length) continue;
      out[key] = mergeOverridePayload({}, {
        dt: String(value?.dt || '').trim(),
        fecha_operativa_turno: normalizeOperationalDateValue(value?.fecha_operativa_turno || ''),
        ...normalizedPatch,
        touched_fields: touchedFields,
      });
    }
    return out;
  } catch (e) {
    return {};
  }
}

function savePendingOverrideMapToStorage(mapValue) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const keys = Object.keys(mapValue || {});
    if (!keys.length) {
      localStorage.removeItem(PENDING_OVERRIDES_STORAGE_KEY);
      return;
    }
    const out = {};
    for (const key of keys) {
      const value = mapValue[key];
      const normalizedPatch = normalizeOverridePatch(value || {});
      const touchedFields = normalizeTouchedFields(
        value?.touched_fields || Object.keys(normalizedPatch)
      );
      if (!touchedFields.length) continue;
      out[key] = mergeOverridePayload({}, {
        dt: String(value?.dt || '').trim(),
        fecha_operativa_turno: normalizeOperationalDateValue(value?.fecha_operativa_turno || ''),
        ...normalizedPatch,
        touched_fields: touchedFields,
      });
    }
    if (!Object.keys(out).length) {
      localStorage.removeItem(PENDING_OVERRIDES_STORAGE_KEY);
      return;
    }
    localStorage.setItem(PENDING_OVERRIDES_STORAGE_KEY, JSON.stringify(out));
  } catch (e) { /* ignore */ }
}

function applyOverridePatchToRow(row, payload) {
  if (!row || !payload) return row;
  const touched = new Set(normalizeTouchedFields(payload.touched_fields));
  if (!touched.size) return row;

  const next = { ...row };
  if (touched.has('placa')) next.placa = String(payload.placa || '').trim().toUpperCase();
  if (touched.has('stage')) next.stage = String(payload.stage || '').trim().toUpperCase();
  if (touched.has('rampa')) next.rampa = String(payload.rampa || '').trim();
  else if (touched.has('stage')) next.rampa = deriveRampaFromStage(next.stage, next.rampa || '');
  if (touched.has('cita')) next.cita = normalizeCita(payload.cita);
  if (touched.has('estado_carga_manual')) {
    next.estadoCargaManual = extractManualEstadoCarga(payload.estado_carga_manual || '');
  }
  next.estadoCargaAuto = getAutoEstadoCarga(next);
  next.estadoCarga = next.estadoCargaManual || next.estadoCargaAuto;
  return next;
}

function applyOverrideMapToRows(rows, overridesMap = {}) {
  if (!Array.isArray(rows) || !rows.length) return rows;
  return rows.map((row) => {
    const key = getRowEditKey(row);
    const fallbackKey = buildEditKey(row?.dt, '');
    const payload = overridesMap[key] || overridesMap[fallbackKey];
    return payload ? applyOverridePatchToRow(row, payload) : row;
  });
}

function nextEstado(v) {
  const e = normalizeEstadoCargaLabel(v);
  if (e === 'PENDIENTE' || e === 'EN PROCESO' || e === 'PREPARADO') return 'EN CARGA';
  if (e === 'EN CARGA') return 'CARGADO';
  return 'PREPARADO';
}

function EstadoIcon({ estado, color }) {
  const e = normalizeEstadoCargaLabel(estado);
  if (e === 'PENDIENTE') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 11l8-6 8 6v9h-5v-6H9v6H4z" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (e === 'EN PROCESO') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="7" fill="none" stroke={color} strokeWidth="2" />
        <path d="M12 7v5l3 2" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (e === 'PREPARADO') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8" fill="none" stroke={color} strokeWidth="2" />
        <path d="M8.5 12.2l2.3 2.4 4.8-5" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (e === 'EN CARGA') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="8" cy="5" r="2" fill={color} />
        <path d="M8 8v5M8 10l4 2M8 12l-3 4M12 12l3 2" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
        <rect x="14.5" y="13" width="5" height="5" rx="0.8" fill="none" stroke={color} strokeWidth="2" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="9" width="10" height="7" rx="1.2" fill="none" stroke={color} strokeWidth="2" />
      <path d="M13 11h4l3 3v2h-2" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7" cy="18" r="2" fill="none" stroke={color} strokeWidth="2" />
      <circle cx="17" cy="18" r="2" fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//  MOCK DATA â€” se muestra hasta que se cargue un Excel
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const MOCK_ROWS = [
  { dt: '98307875', transp: 'Transporte Zavala Cargo Sac',  cliente: 'Belen Distrib E I R L',                destino: 'Pe 030201 Andahuaylas Â· Pe 030109 Abancay', ton: 2.2,  m3: 5.2,   ped: 98,    av: 98,    placa: 'BLM-218', pct: 100,  stage: 'ST.06.01', rampa: '6',  cita: '14:30', status: 'En carga',     turno: 1 },
  { dt: '98309151', transp: 'Transporte Zavala Cargo Sac',  cliente: 'Distrib Mdm Sac Â· D Olphins E I R L',  destino: 'Pe 021801 Santa',                          ton: 12.2, m3: 29.2,  ped: 2275,  av: 2275,  placa: 'BLM-219', pct: 100,  stage: 'ST.13.01', rampa: '13', cita: '15:00', status: 'En carga',     turno: 2 },
  { dt: '98311042', transp: 'Andina LogÃ­stica SAC',         cliente: 'Mayoristas del Sur SA',                destino: 'Pe 040301 Arequipa',                       ton: 8.4,  m3: 19.8,  ped: 1480,  av: 1480,  placa: 'AAA-481', pct: 100,  stage: 'ST.08.02', rampa: '8',  cita: '13:15', status: 'Completo',     turno: 2 },
  { dt: '98312018', transp: 'Transporte Inca Express',      cliente: 'Comercial Plaza Norte EIRL',           destino: 'Pe 150101 Lima Cercado',                   ton: 4.8,  m3: 11.2,  ped: 820,   av: 612,   placa: 'PIN-372', pct: 74.6, stage: 'ST.02.04', rampa: '2',  cita: '16:00', status: 'En proceso',   turno: 2 },
  { dt: '98312194', transp: 'Carga Andina SA',              cliente: 'Distribuidora PacÃ­fico',               destino: 'Pe 130108 Trujillo',                       ton: 6.1,  m3: 14.4,  ped: 1042,  av: 1042,  placa: 'CAS-104', pct: 100,  stage: 'ST.10.01', rampa: '10', cita: '12:45', status: 'Completo',     turno: 1 },
  { dt: '98312488', transp: 'Transporte Zavala Cargo Sac',  cliente: 'Hipermercados Tottus SA',              destino: 'Pe 070101 Callao',                         ton: 18.6, m3: 42.8,  ped: 3180,  av: 1908,  placa: 'BLM-220', pct: 60.0, stage: 'ST.05.03', rampa: '5',  cita: '17:30', status: 'En proceso',   turno: 2 },
  { dt: '98313027', transp: 'LogÃ­stica Cordillera SAC',     cliente: 'Minimarkets Unidos SA',                destino: 'Pe 080101 Cusco',                          ton: 3.4,  m3: 8.1,   ped: 580,   av: 0,     placa: null,      pct: 0,    stage: 'ST.04.00', rampa: '4',  cita: null,    status: 'Pendiente',    turno: 3 },
  { dt: '98313319', transp: 'Inversiones El Sol',           cliente: 'Distrib NorteÃ±a EIRL',                 destino: 'Pe 200101 Piura',                          ton: 9.8,  m3: 23.4,  ped: 1684,  av: 1684,  placa: 'IES-902', pct: 100,  stage: 'ST.11.02', rampa: '11', cita: '13:00', status: 'En carga',     turno: 1 },
  { dt: '98313612', transp: 'Transporte Continental SA',    cliente: 'Comercializadora Bracamonte',          destino: 'Pe 120101 Huancayo',                       ton: 5.6,  m3: 13.2,  ped: 962,   av: 481,   placa: 'TCS-128', pct: 50.0, stage: 'ST.03.02', rampa: '3',  cita: '18:00', status: 'En proceso',   turno: 2 },
  { dt: '98313904', transp: 'Carga Andina SA',              cliente: 'Mass DistribuciÃ³n SAC',                destino: 'Pe 020101 Chimbote',                       ton: 7.2,  m3: 16.8,  ped: 1248,  av: 1248,  placa: 'CAS-105', pct: 100,  stage: 'ST.09.01', rampa: '9',  cita: '14:00', status: 'Completo',     turno: 1 },
  { dt: '98314188', transp: 'Andina LogÃ­stica SAC',         cliente: 'Supermercados Peruanos',               destino: 'Pe 230101 Tacna',                          ton: 14.2, m3: 32.6,  ped: 2412,  av: 0,     placa: null,      pct: 0,    stage: 'ST.07.00', rampa: '7',  cita: null,    status: 'Por trabajar', turno: 3 },
  { dt: '98314472', transp: 'Transporte Inca Express',      cliente: 'Distrib Olympus EIRL',                 destino: 'Pe 220701 Tarapoto',                       ton: 4.2,  m3: 9.8,   ped: 712,   av: 285,   placa: 'PIN-373', pct: 40.0, stage: 'ST.01.02', rampa: '1',  cita: '19:00', status: 'En proceso',   turno: 3 },
  { dt: '98314765', transp: 'LogÃ­stica Cordillera SAC',     cliente: 'Mayorista La Hermelinda',              destino: 'Pe 130108 Trujillo',                       ton: 11.4, m3: 26.8,  ped: 1962,  av: 1962,  placa: 'LCS-441', pct: 100,  stage: 'ST.12.01', rampa: '12', cita: '13:30', status: 'Completo',     turno: 2 },
  { dt: '98315041', transp: 'Inversiones El Sol',           cliente: 'Distribuidora PacÃ­fico',               destino: 'Pe 060101 Cajamarca',                      ton: 6.8,  m3: 16.0,  ped: 1184,  av: 0,     placa: null,      pct: 0,    stage: 'ST.14.00', rampa: '14', cita: null,    status: 'Pendiente',    turno: 3 },
  { dt: '98315328', transp: 'Transporte Continental SA',    cliente: 'Comercial Plaza Norte EIRL',           destino: 'Pe 250101 Pucallpa',                       ton: 8.9,  m3: 20.4,  ped: 1538,  av: 0,     placa: null,      pct: 0,    stage: 'ST.15.00', rampa: '15', cita: null,    status: 'Por trabajar', turno: 3 },
];

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//  KPI COMPUTATION â€” calcula resumen, turnos y % desde las filas
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function computeData(rows) {
  const isPickingDone   = (r) => getEffectivePickingPct(r) >= 100;
  const isDespachoDone  = (r) => getEffectiveEstadoCarga(r) === 'CARGADO';

  const sum = (key, pred = () => true) => rows.filter(pred).reduce((a, r) => a + (Number(r[key]) || 0), 0);

  const totalTon = sum('ton');
  const totalM3  = sum('m3');
  const totalCj  = rows.reduce((a, r) => a + pedidoRow(r), 0);

  const pickingTon = sum('ton', isPickingDone);
  const pickingM3  = sum('m3',  isPickingDone);
  const pickingCj  = rows.reduce((a, r) => a + getEffectiveAvanceUnits(r), 0);  // cajas procesadas

  const pendienteTon = Math.max(0, totalTon - pickingTon);
  const pendienteM3  = Math.max(0, totalM3  - pickingM3);
  const pendienteCj  = Math.max(0, totalCj  - pickingCj);

  const despachoTon = sum('ton', isDespachoDone);
  const despachoM3  = sum('m3',  isDespachoDone);
  const despachoCj  = rows.filter(isDespachoDone).reduce((a, r) => a + pedidoRow(r), 0);

  const fmt = (n, dec = 1) => n.toFixed(dec);
  const summary = [
    { label: 'Total',             ton: fmt(totalTon),     m3: fmt(totalM3),     cj: totalCj.toLocaleString(),    color: 'ink',   bold: true },
    { label: 'Avance picking',    ton: fmt(pickingTon),   m3: fmt(pickingM3),   cj: pickingCj.toLocaleString(),  color: 'green' },
    { label: 'Pendiente picking', ton: fmt(pendienteTon), m3: fmt(pendienteM3), cj: pendienteCj.toLocaleString(),color: 'green' },
    { label: 'Avance despacho',   ton: fmt(despachoTon),  m3: fmt(despachoM3),  cj: despachoCj.toLocaleString(), color: 'blue' },
  ];

  // Turnos
  const byTurno = {};
  for (const r of rows) {
    const t = r.turno || 1;
    if (!byTurno[t]) byTurno[t] = { ton: 0, m3: 0, ped: 0, av: 0 };
    byTurno[t].ton += Number(r.ton) || 0;
    byTurno[t].m3  += Number(r.m3)  || 0;
    byTurno[t].ped += pedidoRow(r);
    byTurno[t].av  += getEffectiveAvanceUnits(r);
  }
  const totalTurnoAv = Object.values(byTurno).reduce((a, d) => a + (Number(d.av) || 0), 0);
  const totalTurnoPed = Object.values(byTurno).reduce((a, d) => a + (Number(d.ped) || 0), 0);
  const turnos = Object.keys(byTurno).sort().map((t) => {
    const d = byTurno[t];
    const pctShare = totalTurnoAv > 0
      ? (d.av / totalTurnoAv) * 100
      : (totalTurnoPed > 0 ? (d.ped / totalTurnoPed) * 100 : 0);
    return {
      name: `${t} turno`,
      ton: fmt(d.ton),
      m3:  fmt(d.m3),
      cj:  d.av.toLocaleString(),
      pct: Math.round(pctShare),
    };
  });

  const pickingPct  = totalCj > 0 ? (pickingCj  / totalCj) * 100 : 0;
  const despachoPct = totalCj > 0 ? (despachoCj / totalCj) * 100 : 0;

  return { summary, turnos, pickingPct, despachoPct, pickingCj, despachoCj, totalCj };
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//  COMPONENT
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const DashDinet = () => {
  const A = {
    bg: '#fafaf9', card: '#ffffff', ink: '#111110', sub: '#6b6b66',
    line: '#ececea', lineSoft: '#f3f3f1',
    blue: 'oklch(60% 0.14 250)',
    green: 'oklch(62% 0.13 150)',
    amber: 'oklch(72% 0.15 75)',
    red:   'oklch(62% 0.18 25)',
    bgSoftBlue:  'oklch(96% 0.02 250)',
    bgSoftGreen: 'oklch(95% 0.04 150)',
    bgSoftAmber: 'oklch(95% 0.05 75)',
    bgSoftRed:   'oklch(95% 0.04 25)',
  };
  const colorMap = { ink: A.ink, green: A.green, blue: A.blue, sub: A.sub };

  // â”€â”€ state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [rawRows, setRawRows]   = React.useState(null);
  const [filename, setFilename] = React.useState(null);
  const [loadedAt, setLoadedAt] = React.useState(null);
  const [publishedAt, setPublishedAt] = React.useState(null);
  const [dragOver, setDragOver] = React.useState(false);
  const [error, setError]       = React.useState(null);
  const [rawHeaders, setRawHeaders] = React.useState(null);
  const [rawSample, setRawSample]   = React.useState(null);
  const [showInspector, setShowInspector] = React.useState(false);
  const [zoneFilter, setZoneFilter] = React.useState('Todos');
  const [searchText, setSearchText] = React.useState('');
  const [filterYear, setFilterYear] = React.useState('Todos');
  const [filterMonth, setFilterMonth] = React.useState('Todos');
  const [filterDay, setFilterDay] = React.useState('Todos');
  const [temporalView, setTemporalView] = React.useState('operativo');
  const [sourceFilter, setSourceFilter] = React.useState('Todos');
  const [autoLoadTried, setAutoLoadTried] = React.useState(false);
  const [savedOverrides, setSavedOverrides] = React.useState({});
  const [pendingEdits, setPendingEdits] = React.useState(() => loadPendingOverrideMapFromStorage());
  const [isSavingEdits, setIsSavingEdits] = React.useState(false);
  const [saveNotice, setSaveNotice] = React.useState('');
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [showFilters, setShowFilters] = React.useState(false);
  const [sortCol, setSortCol] = React.useState(null);
  const [sortDir, setSortDir] = React.useState('asc');
  const [statusFilters, setStatusFilters] = React.useState([]);
  const [detailExpanded, setDetailExpanded] = React.useState(false);
  const [viewportWidth, setViewportWidth] = React.useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1280));
  const fileInputRef = React.useRef(null);
  const savedOverridesRef = React.useRef({});
  const pendingEditsRef = React.useRef({});

  React.useEffect(() => {
    savedOverridesRef.current = savedOverrides;
  }, [savedOverrides]);

  React.useEffect(() => {
    pendingEditsRef.current = pendingEdits;
    savePendingOverrideMapToStorage(pendingEdits);
  }, [pendingEdits]);

  React.useEffect(() => {
    if (!saveNotice) return undefined;
    const id = setTimeout(() => setSaveNotice(''), 2400);
    return () => clearTimeout(id);
  }, [saveNotice]);

  React.useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // load from localStorage on mount
  React.useEffect(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        const { rows, filename, loadedAt, publishedAt, rawHeaders, rawSample } = JSON.parse(cached);
        if (Array.isArray(rows) && rows.length) {
          const fixedRows = rows.map((r, idx) => ({ ...r, __id: r.__id ?? idx + 1 }));
          setRawRows(fixedRows);
          setFilename(filename);
          setLoadedAt(loadedAt);
          setPublishedAt(publishedAt || loadedAt || null);
          if (rawHeaders) setRawHeaders(rawHeaders);
          if (rawSample)  setRawSample(rawSample);
        }
      }
    } catch (e) { /* ignore */ }
  }, []);

  const persistCachedRows = React.useCallback((rows, replacements = {}) => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      const payload = cached ? JSON.parse(cached) : {};
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...payload, ...replacements, rows }));
    } catch (e) { /* ignore */ }
  }, []);

  React.useEffect(() => {
    if (!EMBEDDED_MODE) return undefined;

    const hydrate = () => {
      try {
        const payload = readCachedDashboardPayload();
        if (!payload || !Array.isArray(payload.rows)) return;
        const fixedRows = payload.rows.map((r, idx) => ({ ...r, __id: r.__id ?? idx + 1 }));
        setRawRows(fixedRows);
        setFilename(payload.filename || 'DMS Monitor');
        setLoadedAt(payload.loadedAt || new Date().toISOString());
        setPublishedAt(payload.publishedAt || payload.loadedAt || null);
        setRawHeaders(payload.rawHeaders || null);
        setRawSample(payload.rawSample || null);
      } catch (e) { /* ignore */ }
    };

    const onStorage = (event) => {
      if (event.key && event.key !== STORAGE_KEY) return;
      hydrate();
    };

    const onMessage = (event) => {
      if (event?.data?.type !== 'dinet-monitor-data-updated') return;
      hydrate();
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener('message', onMessage);
    hydrate();
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('message', onMessage);
    };
  }, []);

  const loadSavedOverrides = React.useCallback(async ({ applyToCurrent = true } = {}) => {
    if (EMBEDDED_MODE) return false;
    try {
      const res = await fetch(`/api/sync-edits?_ts=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return false;
      const out = await res.json().catch(() => ({}));
      if (!out?.ok) return false;

      const nextMap = {};
      for (const item of Array.isArray(out.items) ? out.items : []) {
        const key = buildEditKey(item?.dt, item?.fecha_operativa_turno);
        const normalized = normalizeOverridePatch(item || {});
        const touchedFields = normalizeTouchedFields(
          item?.touched_fields || Object.keys(normalized)
        );
        if (!key || !touchedFields.length) continue;
        nextMap[key] = {
          dt: String(item?.dt || '').trim(),
          fecha_operativa_turno: normalizeOperationalDateValue(item?.fecha_operativa_turno || ''),
          ...normalized,
          touched_fields: touchedFields,
        };
      }

      setSavedOverrides(nextMap);

      if (applyToCurrent) {
        const mergedOverrides = { ...nextMap, ...(pendingEditsRef.current || {}) };
        setRawRows((prev) => {
          if (!Array.isArray(prev) || !prev.length) return prev;
          const nextRows = applyOverrideMapToRows(prev, mergedOverrides);
          persistCachedRows(nextRows);
          return nextRows;
        });
      }

      return true;
    } catch (e) {
      return false;
    }
  }, [persistCachedRows]);

  React.useEffect(() => {
    loadSavedOverrides();
  }, [loadSavedOverrides]);

  const parseWorkbookRows = (wb, sourceName, sourcePublishedAt = null, { weightMode = 'published_ton' } = {}) => {
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const raw = window.XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (!raw.length) return false;
    const headers = Object.keys(raw[0]);
    const mappedBase = raw.map((row) => mapRow(row, { weightMode })).filter((r) => r.dt).map((r, idx) => ({ ...r, __id: r.__id ?? idx + 1 }));
    const mergedOverrides = { ...(savedOverridesRef.current || {}), ...(pendingEditsRef.current || {}) };
    const mapped = applyOverrideMapToRows(mappedBase, mergedOverrides);
    if (!mapped.length) return false;
    const now = new Date().toISOString();
    const publishStamp = sourcePublishedAt || now;
    setRawRows(mapped);
    setFilename(sourceName);
    setLoadedAt(now);
    setPublishedAt(publishStamp);
    setRawHeaders(headers);
    setRawSample(raw[0]);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ rows: mapped, filename: sourceName, loadedAt: now, publishedAt: publishStamp, rawHeaders: headers, rawSample: raw[0], weightMode }));
    } catch (e) { /* ignore */ }
    return true;
  };

  const tryAutoLoad = async ({ attempts = 4, delayMs = 1800 } = {}) => {
    if (EMBEDDED_MODE) return false;
    setError(null);
    if (!window.XLSX) return false;
    setIsRefreshing(true);
    try {
      const runStamp = Date.now();
      const isFileMode = window.location.protocol === 'file:';
      const candidates = isFileMode
        ? [
            'http://localhost:5501/output/base%20de%20datos.csv',
            'http://127.0.0.1:5501/output/base%20de%20datos.csv',
            '../output/base de datos.csv',
            '/output/base de datos.csv',
            'output/base de datos.csv',
          ]
        : [
            '../output/base de datos.csv',
            '/output/base de datos.csv',
            './output/base de datos.csv',
            'output/base de datos.csv',
          ];

      for (let attempt = 1; attempt <= attempts; attempt++) {
        for (const url of candidates) {
          try {
            const encodedUrl = encodeURI(url);
            const requestUrl = encodedUrl.includes('?') ? `${encodedUrl}&_ts=${runStamp}` : `${encodedUrl}?_ts=${runStamp}`;
            const r = await fetch(requestUrl, { cache: 'no-store' });
            if (!r.ok) continue;
            const txt = await r.text();
            const wb = window.XLSX.read(txt, { type: 'string' });
            const ok = parseWorkbookRows(wb, `AUTO: ${url}`, r.headers.get('last-modified') || new Date().toISOString(), { weightMode: 'published_ton' });
            if (ok) return true;
          } catch (e) { /* continue */ }
        }
        if (attempt < attempts) {
          await sleep(delayMs * attempt);
        }
      }
      return false;
    } finally {
      setIsRefreshing(false);
    }
  };

  // Auto-refresh cada 5 minutos cuando los datos vienen del servidor
  React.useEffect(() => {
    if (EMBEDDED_MODE || !filename || !String(filename).startsWith('AUTO:')) return;
    const id = setInterval(() => { tryAutoLoad(); }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [filename]);

  React.useEffect(() => {
    if (EMBEDDED_MODE || rawRows || autoLoadTried) return;
    (async () => {
      setAutoLoadTried(true);
      const ok = await tryAutoLoad({ attempts: 5, delayMs: 2000 });
      if (!ok && !rawRows) {
        const localHint = window.location.protocol === 'file:'
          ? 'Abriste el HTML directo. Usa DINET.bat o el servidor local http://localhost:5501/dashboard%20web/DINET%20Dashboard.html.'
          : 'Si el archivo acaba de publicarse, espera unos segundos y vuelve a intentar.';
        setError(`No pude cargar automáticamente output/base de datos.csv. ${localHint} También puedes usar "Cargar Excel".`);
      }
    })();
  }, [rawRows, autoLoadTried]);

  // Auto-select most recent date with data (today → yesterday → ...) on every data load
  React.useEffect(() => {
    if (!rawRows || !rawRows.length) return;
    if (temporalView === 'archivo') {
      setFilterYear('Todos');
      setFilterMonth('Todos');
      setFilterDay('Todos');
      return;
    }
    const sourceRows = rawRows;
    if (!sourceRows.length) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let back = 0; back <= 30; back++) {
      const d = new Date(today);
      d.setDate(today.getDate() - back);
      const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
      const found = sourceRows.some(r => {
        const rd = parseFlexibleDate(getTemporalDateValue(r, temporalView));
        return rd && rd.getFullYear() === y && (rd.getMonth() + 1) === m && rd.getDate() === day;
      });
      if (found) {
        setFilterYear(String(y));
        setFilterMonth(String(m));
        setFilterDay(String(day));
        return;
      }
    }
  }, [loadedAt, temporalView, sourceFilter]);

  const handleFile = async (file) => {
    setError(null);
    if (!file) return;
    if (!window.XLSX) { setError('SheetJS no cargado. Verifica el script de xlsx.'); return; }
    try {
      const buffer = await file.arrayBuffer();
      const wb = window.XLSX.read(buffer, { cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = window.XLSX.utils.sheet_to_json(sheet, { defval: '' });
      if (!raw.length) { setError('El archivo está vacío o no tiene una hoja válida.'); return; }
      const headers = Object.keys(raw[0]);
      const mappedBase = raw.map((row) => mapRow(row, { weightMode: 'excel_kg' })).filter((r) => r.dt).map((r, idx) => ({ ...r, __id: r.__id ?? idx + 1 }));
      const mergedOverrides = { ...(savedOverridesRef.current || {}), ...(pendingEditsRef.current || {}) };
      const mapped = applyOverrideMapToRows(mappedBase, mergedOverrides);
      if (!mapped.length) {
        setError(`Encontré ${raw.length} filas pero ninguna tenía una columna que mapee a "DT". Columnas detectadas: ${headers.join(', ')}`);
        return;
      }
      const now = new Date().toISOString();
      const publishStamp = file.lastModified ? new Date(file.lastModified).toISOString() : now;
      setRawRows(mapped); setFilename(file.name); setLoadedAt(now); setPublishedAt(publishStamp);
      setRawHeaders(headers); setRawSample(raw[0]);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ rows: mapped, filename: file.name, loadedAt: now, publishedAt: publishStamp, rawHeaders: headers, rawSample: raw[0], weightMode: 'excel_kg' }));
      } catch (e) { /* storage full, ignore */ }
    } catch (e) {
      setError('Error leyendo el archivo: ' + e.message);
    }
  };

  const clearData = () => {
    setRawRows(null); setFilename(null); setLoadedAt(null); setPublishedAt(null); setError(null);
    setRawHeaders(null); setRawSample(null);
    localStorage.removeItem(STORAGE_KEY);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const queueEdit = (row, patch = {}) => {
    if (!row || !row.dt) return;
    const key = getRowEditKey(row);
    const normalizedPatch = normalizeOverridePatch(patch);
    const touchedFields = normalizeTouchedFields(
      patch.touched_fields || Object.keys(normalizedPatch)
    );
    if (!key || !touchedFields.length) return;

    const payload = mergeOverridePayload(pendingEditsRef.current?.[key], {
      dt: String(row.dt || '').trim(),
      fecha_operativa_turno: normalizeOperationalDateValue(row.fecOp || row.fecha || ''),
      ...normalizedPatch,
      touched_fields: touchedFields,
    });
    setSaveNotice('');
    setPendingEdits((prev) => ({ ...prev, [key]: payload }));
  };

  const syncEditsNow = async ({ manual = false } = {}) => {
    const editsMap = pendingEditsRef.current || {};
    const keys = Object.keys(editsMap);
    if (!keys.length) return true;
    const pendingLabel = `${keys.length} cambio${keys.length === 1 ? '' : 's'}`;
    if (manual) {
      setIsSavingEdits(true);
      setSaveNotice('');
      setError(null);
    }
    if (EMBEDDED_MODE) {
      try {
        const raw = localStorage.getItem(OVERRIDE_KEY);
        const current = raw ? JSON.parse(raw) : {};
        localStorage.setItem(OVERRIDE_KEY, JSON.stringify({ ...current, ...editsMap }));
        setPendingEdits((prev) => {
          const next = { ...prev };
          keys.forEach((k) => delete next[k]);
          return next;
        });
        setSavedOverrides((prev) => ({ ...prev, ...editsMap }));
        setSaveNotice('Guardado');
        window.parent?.postMessage?.({ type: 'dinet-monitor-overrides-updated' }, '*');
        return true;
      } catch (e) {
        setSaveNotice(`${pendingLabel} en respaldo local.`);
        if (manual) setError(`No pude guardar cambios manuales. Detalle: ${e.message}`);
        return false;
      } finally {
        if (manual) setIsSavingEdits(false);
      }
    }
    try {
      const res = await fetch('/api/sync-edits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ edits: keys.map((k) => editsMap[k]) }),
      });
      const responseText = await res.text();
      let out = {};
      try { out = responseText ? JSON.parse(responseText) : {}; } catch (e) { out = {}; }
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('La API /api/sync-edits no está activa en este deployment. Revisa redeploy y que la variable esté en Preview o usa el dominio de Production.');
        }
        throw new Error(out.message || out.error || `Servidor respondió ${res.status}`);
      }
      if (!out || !out.ok) throw new Error(out?.message || out?.error || 'No se pudo guardar');
      setPendingEdits((prev) => {
        const next = { ...prev };
        keys.forEach((k) => delete next[k]);
        return next;
      });
      loadSavedOverrides({ applyToCurrent: true });
      if (manual) {
        setSaveNotice('Guardado');
      }
      else setSaveNotice('');
      return true;
    } catch (e) {
      setSaveNotice(`${pendingLabel} en respaldo local. Se reintentará automáticamente.`);
      if (manual) {
        setError(`No pude guardar cambios manuales. Detalle: ${e.message}`);
      }
      return false;
    } finally {
      if (manual) setIsSavingEdits(false);
    }
  };

  React.useEffect(() => {
    const id = setInterval(() => { syncEditsNow(); }, 180000);
    return () => clearInterval(id);
  }, []);

  React.useEffect(() => {
    if (!Object.keys(pendingEdits || {}).length || isSavingEdits) return undefined;
    const id = setTimeout(() => { syncEditsNow(); }, 12000);
    return () => clearTimeout(id);
  }, [pendingEdits, isSavingEdits]);

  React.useEffect(() => {
    const onOnline = () => { syncEditsNow(); };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  const updateEstadoCarga = (rowId, nextEstado) => {
    setRawRows((prev) => {
      if (!Array.isArray(prev)) return prev;
      let editedRow = null;
      const updated = prev.map((r) => {
        if (r.__id !== rowId) return r;
        const manual = normalizeEstadoCargaLabel(nextEstado);
        const estadoCargaManual = manual === 'EN CARGA' || manual === 'CARGADO' ? manual : '';
        const estadoCargaAuto = getAutoEstadoCarga(r);
        const estadoCarga = estadoCargaManual || estadoCargaAuto;
        editedRow = { ...r, estadoCargaManual, estadoCargaAuto, estadoCarga };
        return editedRow;
      });
      persistCachedRows(updated);
      if (editedRow) {
        queueEdit(editedRow, {
          estado_carga_manual: editedRow.estadoCargaManual,
          touched_fields: ['estado_carga_manual'],
        });
      }
      return updated;
    });
  };

  const updateRowFields = (rowId, patch) => {
    setRawRows((prev) => {
      if (!Array.isArray(prev)) return prev;
      let editedRow = null;
      const updated = prev.map((r) => {
        if (r.__id !== rowId) return r;
        const merged = { ...r, ...patch };
        if (patch.estadoCargaManual !== undefined) {
          const manual = normalizeEstadoCargaLabel(patch.estadoCargaManual);
          merged.estadoCargaManual = manual === 'EN CARGA' || manual === 'CARGADO' ? manual : '';
          merged.estadoCargaAuto = getAutoEstadoCarga(merged);
          merged.estadoCarga = merged.estadoCargaManual || merged.estadoCargaAuto;
        }
        if (patch.stage !== undefined) {
          merged.rampa = deriveRampaFromStage(merged.stage, merged.rampa || '');
        }
        if (patch.cita !== undefined) {
          merged.cita = normalizeCita(patch.cita);
        }
        if (patch.placa !== undefined) {
          merged.placa = String(patch.placa || '').trim();
        }
        editedRow = merged;
        return merged;
      });
      persistCachedRows(updated);
      if (editedRow) {
        const manualPatch = {};
        const touchedFields = [];
        if (patch.stage !== undefined) {
          manualPatch.stage = editedRow.stage || '';
          manualPatch.rampa = editedRow.rampa || '';
          touchedFields.push('stage', 'rampa');
        }
        if (patch.cita !== undefined) {
          manualPatch.cita = editedRow.cita || '';
          touchedFields.push('cita');
        }
        if (patch.placa !== undefined) {
          manualPatch.placa = editedRow.placa || '';
          touchedFields.push('placa');
        }
        if (patch.estadoCargaManual !== undefined) {
          manualPatch.estado_carga_manual = editedRow.estadoCargaManual || '';
          touchedFields.push('estado_carga_manual');
        }
        queueEdit(editedRow, { ...manualPatch, touched_fields: touchedFields });
      }
      return updated;
    });
  };

  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  // â”€â”€ data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const rows = rawRows || MOCK_ROWS;
  const sourceCounts = rows.reduce((acc, r) => {
    const s = getSourceValue(r);
    if (s) acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});
  const sourceOptions = Object.keys(sourceCounts).sort((a, b) => prettySourceValue(a).localeCompare(prettySourceValue(b), 'es'));
  const rowsForSource = temporalView === 'archivo' && sourceFilter !== 'Todos'
    ? rows.filter((r) => getSourceValue(r) === sourceFilter)
    : rows;
  const rowsWithDate = rowsForSource.map((r) => ({ ...r, _date: parseFlexibleDate(getTemporalDateValue(r, temporalView)) }));
  const monthName = (m) => ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][m - 1] || String(m);
  const years = [...new Set(rowsWithDate.filter(r => r._date).map(r => r._date.getFullYear()))].sort((a, b) => a - b);
  const months = [...new Set(rowsWithDate.filter(r => r._date && (filterYear === 'Todos' || r._date.getFullYear() === Number(filterYear))).map(r => r._date.getMonth() + 1))].sort((a, b) => a - b);
  const days = [...new Set(rowsWithDate.filter(r =>
    r._date &&
    (filterYear === 'Todos' || r._date.getFullYear() === Number(filterYear)) &&
    (filterMonth === 'Todos' || (r._date.getMonth() + 1) === Number(filterMonth))
  ).map(r => r._date.getDate()))].sort((a, b) => a - b);

  const rowsBase = rowsWithDate.filter((r) => {
    const z = String(r.tipo || '').toUpperCase();
    if (zoneFilter === 'Local' && z !== 'LOCAL') return false;
    if (zoneFilter === 'Provincia' && z !== 'PROVINCIA') return false;
    if (temporalView !== 'archivo' && (filterYear !== 'Todos' || filterMonth !== 'Todos' || filterDay !== 'Todos')) {
      if (!r._date) return false;
      if (filterYear !== 'Todos' && r._date.getFullYear() !== Number(filterYear)) return false;
      if (filterMonth !== 'Todos' && (r._date.getMonth() + 1) !== Number(filterMonth)) return false;
      if (filterDay !== 'Todos' && r._date.getDate() !== Number(filterDay)) return false;
    }
    if (searchText.trim()) {
      const q = norm(searchText);
      const blob = norm([r.dt, r.destino, r.cliente, r.transp, r.placa].join(' '));
      if (!blob.includes(q)) return false;
    }
    return true;
  });

  const rowsFiltered = rowsBase.filter((r) => {
    if (statusFilters.length === 0) return true;
    const estado = getEffectiveEstadoCarga(r);
    return statusFilters.includes(estado);
  });

  const setDateTo = (offsetDays) => {
    const d = new Date();
    d.setDate(d.getDate() - offsetDays);
    setFilterYear(String(d.getFullYear()));
    setFilterMonth(String(d.getMonth() + 1));
    setFilterDay(String(d.getDate()));
  };

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const parseCitaForSort = (v) => {
    const s = String(v ?? '').trim();
    if (!s) return 9999;
    if (/^\d{1,2}:\d{2}$/.test(s)) {
      const [h, m] = s.split(':').map(Number);
      return h * 60 + m;
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : 9999;
  };

  const rowsSorted = sortCol
    ? [...rowsFiltered].sort((a, b) => {
        let va, vb;
        if (sortCol === 'cita')   { va = parseCitaForSort(a.cita);  vb = parseCitaForSort(b.cita); }
        if (sortCol === 'rampa')  { va = Number(a.rampa) || 0;       vb = Number(b.rampa) || 0; }
        if (sortCol === 'pct')    { va = getEffectivePickingPct(a); vb = getEffectivePickingPct(b); }
        return sortDir === 'asc' ? va - vb : vb - va;
      })
    : rowsFiltered;

  const { summary, turnos, pickingPct, despachoPct, pickingCj, despachoCj, totalCj } = computeData(rowsFiltered);
  const missingMetaRows = rowsFiltered.filter((r) => {
    return !String(r.transp ?? '').trim() || !String(r.destino ?? '').trim();
  }).length;
  const turnoColor = (p) => p >= 75 ? '#3aa55c' : p >= 25 ? '#f59f3a' : '#e63946';
  const isCompactView = viewportWidth <= 1024;
  const estadoCargaOptions = [
    { value: '', label: 'A' },
    { value: 'EN CARGA', label: 'E' },
    { value: 'CARGADO', label: 'C' },
  ];

  const renderEstadoCargaControl = (r) => {
    const effective = getEffectiveEstadoCarga(r);
    const manual = getManualEstadoCarga(r);
    const ecMeta = estadoCargaMeta(effective);
    return (
      <div className="dn-estado-control">
        <div
          className="dn-estado-pill"
          style={{
            color: ecMeta.fg,
            background: ecMeta.bg,
            borderColor: ecMeta.bd,
          }}
        >
          <EstadoIcon estado={effective} color={ecMeta.fg} />
          <span>{ecMeta.label}</span>
        </div>
        <div className="dn-estado-select-wrap" title={`DT ${r.dt}: A=sin manual, E=en carga, C=cargado`}>
          <select
            className="dn-estado-select-icon"
            value={manual}
            onChange={(e) => updateEstadoCarga(r.__id, e.target.value)}
            aria-label={`Estado carga manual para DT ${r.dt}`}
          >
            {estadoCargaOptions.map((opt) => (
              <option key={opt.value || 'auto'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <span className="dn-estado-chevron" aria-hidden="true">▾</span>
        </div>
      </div>
    );
  };

  const statusStyle = (s) => {
    const k = statusKey(s);
    return ({
      'Completo':     { bg: A.bgSoftGreen, fg: A.green, accent: A.green },
      'En carga':     { bg: A.bgSoftAmber, fg: A.amber, accent: A.amber },
      'En proceso':   { bg: A.bgSoftBlue,  fg: A.blue,  accent: A.blue },
      'Pendiente':    { bg: A.bgSoftRed,   fg: A.red,   accent: A.red },
      'Por trabajar': { bg: '#f3f3f1',     fg: A.sub,   accent: '#cfcfca' },
    })[k] || { bg: '#f3f3f1', fg: A.sub, accent: '#cfcfca' };
  };

  const counts = rowsBase.reduce((acc, r) => {
    const k = getEffectiveEstadoCarga(r);
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const statusTabs = [
    { label: 'Todos',      count: rowsBase.length,          dot: A.blue,  value: 'Todos' },
    { label: 'Pendiente',  count: counts['PENDIENTE']  || 0, dot: A.red,   value: 'PENDIENTE' },
    { label: 'En proceso', count: counts['EN PROCESO'] || 0, dot: A.blue,  value: 'EN PROCESO' },
    { label: 'Preparado',  count: counts['PREPARADO']  || 0, dot: A.green, value: 'PREPARADO' },
    { label: 'En carga',   count: counts['EN CARGA']   || 0, dot: A.amber, value: 'EN CARGA' },
    { label: 'Cargado',    count: counts['CARGADO']    || 0, dot: '#138a46', value: 'CARGADO' },
  ];
  const toggleStatusFilter = (value) => {
    if (value === 'Todos') { setStatusFilters([]); return; }
    setStatusFilters((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };
  const isTabActive = (value) => value === 'Todos' ? statusFilters.length === 0 : statusFilters.includes(value);
  const renderCompactCard = (r, i) => {
    const effectiveStatus = getEffectiveStatusKey(r);
    const st = statusStyle(effectiveStatus);
    const pedido = pedidoRow(r);
    const avance = getEffectiveAvanceUnits(r);
    const pctAvance = getEffectivePickingPct(r);
    const effectiveEstado = getEffectiveEstadoCarga(r);
    const ecMeta = estadoCargaMeta(effectiveEstado);
    return (
      <div key={(r.dt || '') + '-' + i} className="dn-compact-card" style={r.provisional ? { opacity: 0.76 } : {}}>
        <div className="dn-compact-head">
          <div className="dn-compact-title">
            <div className="dn-compact-line">
              <div className="dn-row-accent" style={{ background: st.accent, height: 22 }} />
              <span className="dn-dt">{r.dt}</span>
              {r.provisional && (
                <span title="Sin Excel de ruteo aún" className="dn-manual-badge" style={{ background: A.bgSoftAmber, color: A.amber }}>
                  PROV
                </span>
              )}
            </div>
            <div className="dn-compact-sub">
              <b style={{ color: A.ink, fontWeight: 700 }}>{textOrPlaceholder(r.transp)}</b>
              <br />
              {textOrPlaceholder(r.cliente)} · {textOrPlaceholder(r.destino)}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, minWidth: 110 }}>
            <div
              className="dn-estado-pill"
              style={{
                color: ecMeta.fg,
                background: ecMeta.bg,
                borderColor: ecMeta.bd,
              }}
            >
              <EstadoIcon estado={effectiveEstado} color={ecMeta.fg} />
              <span>{ecMeta.label}</span>
            </div>
          </div>
        </div>

        <div className="dn-compact-kpis">
          <div className="dn-compact-field">
            <span className="dn-compact-label">Ton / m³</span>
            <span className="dn-compact-value">{numberOrPlaceholder(r.ton, r)} / {numberOrPlaceholder(r.m3, r)}</span>
          </div>
          <div className="dn-compact-field">
            <span className="dn-compact-label">Pedido / Avance</span>
            <span className="dn-compact-value">{pedido.toLocaleString()} / {avance.toLocaleString()}</span>
          </div>
          <div className="dn-compact-field">
            <span className="dn-compact-label">% Avance</span>
            <span className="dn-compact-value" style={{ color: st.accent }}>{Math.min(100, pctAvance).toFixed(1)}%</span>
            <div className="dn-compact-progress"><div style={{ width: Math.min(100, pctAvance) + '%', background: st.accent }} /></div>
          </div>
          <div className="dn-compact-field">
            <span className="dn-compact-label">Stage / Rampa</span>
            <span className="dn-compact-value" style={{ fontSize: 12 }}>{textOrPlaceholder(r.stage, 'Sin stage')} · {textOrPlaceholder(r.rampa, 'Sin dato')}</span>
          </div>
        </div>

        <div className="dn-compact-editors">
          <div className="dn-compact-field">
            <span className="dn-compact-label">Placa</span>
            <input
              className="dn-inline-input"
              defaultValue={r.placa || ''}
              placeholder="AB1-1C3"
              maxLength={7}
              onInput={(e) => {
                const clean = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
                e.target.value = clean.length > 3 ? clean.slice(0, 3) + '-' + clean.slice(3) : clean;
              }}
              onBlur={(e) => {
                const v = e.target.value.trim();
                const ok = v === '' || /^[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(v);
                if (!ok) e.target.value = '';
                updateRowFields(r.__id, { placa: ok ? v : '' });
              }}
            />
          </div>
          <div className="dn-compact-field">
            <span className="dn-compact-label">Stage</span>
            <input
              className="dn-inline-input dn-stage-input"
              defaultValue={r.stage || ''}
              placeholder="ST.00.00"
              maxLength={9}
              onInput={(e) => {
                e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9.]/g, '').slice(0, 9);
              }}
              onBlur={(e) => {
                const v = e.target.value.trim().toUpperCase();
                const ok = v === '' || /^ST\.\d{1,2}\.\d{1,2}$/.test(v);
                if (!ok) e.target.value = '';
                updateRowFields(r.__id, { stage: ok ? v : '' });
              }}
            />
          </div>
          <div className="dn-compact-field">
            <span className="dn-compact-label">Cita</span>
            <input
              className="dn-inline-input"
              defaultValue={(r.cita ?? '').toString().trim() || ''}
              placeholder="HH:MM ó 1-9"
              maxLength={5}
              onInput={(e) => {
                let v = e.target.value.replace(/[^0-9:]/g, '');
                const ci = v.indexOf(':');
                if (ci !== -1) v = v.slice(0, ci + 1) + v.slice(ci + 1).replace(/:/g, '');
                if (!v.includes(':') && v.length > 3) v = v.slice(0, 2) + ':' + v.slice(2);
                if (v.length > 5) v = v.slice(0, 5);
                e.target.value = v;
              }}
              onBlur={(e) => updateRowFields(r.__id, { cita: e.target.value })}
            />
          </div>
          <div className="dn-compact-field" style={{ gridColumn: '1 / -1' }}>
            <span className="dn-compact-label">Estado carga</span>
            {renderEstadoCargaControl(r)}
          </div>
        </div>
      </div>
    );
  };

  // â”€â”€ Gauge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const Gauge = ({ pct, color, sub, gradId }) => {
    const W = 260, H = 170, cx = W / 2, cy = H - 20, r = 98;
    const pctSafe = Math.max(0, Math.min(100, Number(pct) || 0));
    const pctDisplay = Math.round(pctSafe);
    const angle = (p) => Math.PI + (p / 100) * Math.PI;
    const point = (p) => [cx + r * Math.cos(angle(p)), cy + r * Math.sin(angle(p))];
    const [sx, sy] = point(0);
    const [ex, ey] = point(100);
    const fullArc = `M ${sx} ${sy} A ${r} ${r} 0 1 1 ${ex} ${ey}`;
    const tick = (p, len = 8) => {
      const [x1, y1] = point(p);
      const ir = r - len;
      const x2 = cx + ir * Math.cos(angle(p));
      const y2 = cy + ir * Math.sin(angle(p));
      return { x1, y1, x2, y2 };
    };
    const needleAngle = angle(pctSafe);
    const needleLen = 80;
    const needleX = cx + needleLen * Math.cos(needleAngle);
    const needleY = cy + needleLen * Math.sin(needleAngle);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: 4 }}>
        <div className="dn-gauge" style={{ position: 'relative', width: W, height: H }}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'hidden' }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%"   stopColor="#e63946" />
                <stop offset="30%"  stopColor="#f08a3a" />
                <stop offset="50%"  stopColor="#f5c842" />
                <stop offset="75%"  stopColor="#5cb872" />
                <stop offset="100%" stopColor="#2e8c4d" />
              </linearGradient>
            </defs>
            <path d={fullArc} fill="none" stroke={A.lineSoft} strokeWidth="10" strokeLinecap="round" />
            {pctSafe > 0 && (
              <path
                d={fullArc}
                fill="none"
                stroke={`url(#${gradId})`}
                strokeWidth="10"
                strokeLinecap="round"
                pathLength="100"
                strokeDasharray={`${pctSafe} 100`}
              />
            )}
            {[0, 25, 50, 75, 100].map((p) => {
              const t = tick(p, p === 0 || p === 100 ? 9 : 7);
              return <line key={p} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="#cfd6dd" strokeWidth="2" strokeLinecap="round" />;
            })}
            <text x={cx + (r + 10) * Math.cos(angle(0))}   y={cy + (r + 10) * Math.sin(angle(0))   + 3} fontSize="9" fill="#9c9c95" textAnchor="end">0%</text>
            <text x={cx + (r + 10) * Math.cos(angle(25))}  y={cy + (r + 10) * Math.sin(angle(25))  + 3} fontSize="9" fill="#9c9c95" textAnchor="end">25%</text>
            <text x={cx}                                    y={cy - r - 6}                              fontSize="9" fill="#9c9c95" textAnchor="middle">50%</text>
            <text x={cx + (r + 10) * Math.cos(angle(75))}  y={cy + (r + 10) * Math.sin(angle(75))  + 3} fontSize="9" fill="#9c9c95" textAnchor="start">75%</text>
            <text x={cx + (r + 10) * Math.cos(angle(100))} y={cy + (r + 10) * Math.sin(angle(100)) + 3} fontSize="9" fill="#9c9c95" textAnchor="start">100%</text>
            <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke="#18243f" strokeWidth="7" strokeLinecap="round" />
            <circle cx={cx} cy={cy} r="9" fill="#f6f7f9" stroke="#18243f" strokeWidth="5" />
          </svg>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 30, textAlign: 'center', lineHeight: 1, pointerEvents: 'none' }}>
            <div style={{ fontSize: 52, fontWeight: 800, letterSpacing: '-0.02em', color: color, fontVariantNumeric: 'tabular-nums' }}>
              {pctDisplay}<span style={{ fontSize: 20 }}>%</span>
            </div>
          </div>
        </div>
        <div style={{ fontSize: 16, color: '#7b8dac', marginTop: 0, fontVariantNumeric: 'tabular-nums' }}>{sub}</div>
      </div>
    );
  };

  // â”€â”€ CSS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const css = `
    .dn { font-family: 'Manrope', system-ui, sans-serif; background: ${A.bg}; color: ${A.ink}; width: 100%; min-height: 100vh; padding: 14px 18px; box-sizing: border-box; display: flex; flex-direction: column; gap: 10px; overflow-x: hidden; overflow-y: auto; position: relative; }
    .dn, .dn * { box-sizing: border-box; }

    .dn-head { display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; }
    .dn-brand { display: flex; align-items: center; gap: 10px; }
    .dn-mark { width: 32px; height: 32px; border-radius: 8px; background: ${A.ink}; color: #fff; display: grid; place-items: center; font-weight: 700; font-size: 13px; }
    .dn-brand h1 { margin: 0; font-size: 15px; font-weight: 700; letter-spacing: -0.01em; line-height: 1.2; }
    .dn-brand .meta { font-size: 10.5px; color: ${A.sub}; margin-top: 1px; display: flex; align-items: center; gap: 6px; }
    .dn-source-pill { display: inline-flex; align-items: center; gap: 5px; padding: 1px 7px; border-radius: 999px; background: ${A.bgSoftBlue}; color: ${A.blue}; font-size: 9.5px; font-weight: 700; }
    .dn-source-pill.mock { background: #f3f3f1; color: ${A.sub}; }
    .dn-source-pill-good { background: ${A.bgSoftGreen}; color: ${A.green}; }
    .dn-validation-note { font-size: 10px; color: ${A.sub}; font-weight: 500; }
    .dn-head-right { display: flex; gap: 8px; align-items: center; position: relative; }
    .dn-btn { padding: 5px 10px; border: 1px solid ${A.line}; background: #fff; border-radius: 7px; font-size: 11px; font-weight: 500; color: ${A.ink}; display: inline-flex; align-items: center; gap: 5px; cursor: pointer; }
    .dn-btn:hover { background: ${A.lineSoft}; }
    .dn-btn-primary { background: ${A.ink}; color: #fff; border-color: ${A.ink}; }
    .dn-btn-primary:hover { background: #000; }
    .dn-save-btn { padding: 5px 9px; border: 1px solid ${A.line}; background: #fff; border-radius: 7px; font-size: 11px; font-weight: 700; color: ${A.sub}; display: inline-flex; align-items: center; justify-content: center; min-width: 62px; cursor: default; }
    .dn-save-btn.pending { color: #fff; background: ${A.green}; border-color: ${A.green}; cursor: pointer; }
    .dn-save-btn.pending:hover { filter: brightness(0.94); }
    .dn-save-note { position: absolute; right: 38px; top: calc(100% + 4px); font-size: 10px; font-weight: 700; color: ${A.green}; white-space: nowrap; background: rgba(237, 249, 240, 0.96); border: 1px solid #c6e9d1; border-radius: 999px; padding: 4px 8px; box-shadow: 0 8px 18px rgba(0,0,0,0.06); z-index: 20; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
    .dn-filter-toggle-btn { padding: 5px 9px; border: 1px solid ${A.line}; background: #fff; border-radius: 7px; font-size: 11px; color: ${A.sub}; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; line-height: 1; }
    .dn-filter-toggle-btn:hover { background: ${A.lineSoft}; color: ${A.ink}; }
    .dn-head { flex-wrap: wrap; gap: 8px; }

    .dn-filters { background: ${A.card}; border: 1px solid ${A.line}; border-radius: 10px; padding: 8px 14px; display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-shrink: 0; }
    .dn-tabs { display: flex; gap: 2px; background: ${A.lineSoft}; padding: 2px; border-radius: 7px; }
    .dn-tab { padding: 5px 12px; border-radius: 5px; font-size: 11.5px; color: ${A.sub}; font-weight: 500; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
    .dn-tab .dot { width: 6px; height: 6px; border-radius: 50%; }
    .dn-tab.active { background: #fff; color: ${A.ink}; font-weight: 600; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
    .dn-date { display: flex; align-items: center; gap: 6px; }
    .dn-date-label { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.08em; color: #9c9c95; font-weight: 600; }
    .dn-select { padding: 5px 10px; border: 1px solid ${A.line}; border-radius: 6px; font-size: 11.5px; background: #fff; display: inline-flex; align-items: center; gap: 6px; min-width: 64px; justify-content: space-between; }
    .dn-search { border: 1px solid ${A.line}; background: #fff; border-radius: 7px; padding: 5px 12px; font-size: 11.5px; color: ${A.sub}; display: inline-flex; align-items: center; gap: 8px; min-width: 220px; }
    .dn-search input { border: none; outline: none; font-size: 11.5px; width: 200px; color: ${A.ink}; background: transparent; }

    .dn-grid { display: grid; grid-template-columns: 1fr 1.6fr 1fr; gap: 10px; flex-shrink: 0; }
    .dn-card { background: ${A.card}; border: 1px solid ${A.line}; border-radius: 10px; padding: 10px 14px; }
    .dn-card-eyebrow { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.1em; color: #9c9c95; font-weight: 600; margin-bottom: 6px; }
    .dn-card-title { font-size: 12.5px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.2; }
    .dn-card-sub { font-size: 10.5px; color: ${A.sub}; margin-top: 2px; }

    .dn-card-middle { display: grid; grid-template-rows: auto 1fr auto; gap: 8px; }
    .dn-summary { width: 100%; border-collapse: collapse; }
    .dn-summary th { text-align: right; font-weight: 500; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.08em; color: ${A.sub}; padding: 4px 0 6px; border-bottom: 1px solid ${A.line}; }
    .dn-summary th:first-child { text-align: left; }
    .dn-summary td { padding: 2px 0; border-bottom: 1px solid ${A.lineSoft}; font-size: 11px; font-variant-numeric: tabular-nums; text-align: right; }
    .dn-summary td:first-child { text-align: left; font-size: 11px; color: ${A.sub}; font-weight: 500; }
    .dn-summary tr:last-child td { border-bottom: none; }

    .dn-turno { padding-top: 5px; border-top: 1px solid ${A.line}; display: flex; flex-direction: column; gap: 3px; }
    .dn-turno-row { display: flex; flex-direction: column; gap: 2px; }
    .dn-turno-head { display: flex; justify-content: space-between; align-items: baseline; font-size: 9.5px; }
    .dn-turno-name { font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; font-size: 9.5px; }
    .dn-turno-stats { font-variant-numeric: tabular-nums; color: ${A.sub}; font-size: 9.5px; }
    .dn-turno-stats b { color: ${A.ink}; font-weight: 600; }
    .dn-turno-bar { height: 9px; background: ${A.lineSoft}; border-radius: 3px; overflow: hidden; position: relative; }
    .dn-turno-bar > div { height: 100%; border-radius: 3px; display: flex; align-items: center; justify-content: flex-end; padding-right: 5px; font-size: 8px; font-weight: 700; color: #fff; min-width: 22px; }

    .dn-gauge-card { display: flex; flex-direction: column; gap: 4px; padding: 10px 14px; }
    .dn-gauge-head { display: flex; justify-content: space-between; align-items: center; }

    .dn-detail { background: ${A.card}; border: 1px solid ${A.line}; border-radius: 10px; overflow: hidden; flex: 1; display: flex; flex-direction: column; min-height: 400px; }
    .dn-detail-expanded { position: fixed; inset: 12px; z-index: 300; min-height: unset; border-radius: 12px; box-shadow: 0 24px 80px rgba(0,0,0,0.18); }
    .dn-status-tab.multi-active { background: ${A.bgSoftBlue}; color: ${A.blue}; border-color: ${A.blue}30; }
    .dn-detail-head { padding: 8px 16px; border-bottom: 1px solid ${A.line}; display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-shrink: 0; }
    .dn-detail-head h2 { margin: 0; font-size: 13px; font-weight: 700; letter-spacing: -0.01em; line-height: 1.2; }
    .dn-detail-head .sub { font-size: 10.5px; color: ${A.sub}; }
    .dn-status-tabs { display: flex; gap: 2px; }
    .dn-status-tab { padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; color: ${A.sub}; display: inline-flex; align-items: center; gap: 6px; border: 1px solid transparent; cursor: pointer; }
    .dn-status-tab .dot { width: 6px; height: 6px; border-radius: 50%; }
    .dn-status-tab .count { font-variant-numeric: tabular-nums; padding: 0 6px; border-radius: 999px; font-size: 10px; background: ${A.lineSoft}; color: ${A.sub}; min-width: 18px; text-align: center; }
    .dn-status-tab.active { background: ${A.bgSoftBlue}; color: ${A.blue}; border-color: ${A.blue}30; }
    .dn-status-tab.active .count { background: #fff; color: ${A.blue}; }

    .dn-table-wrap { flex: 1; overflow-y: auto; overflow-x: auto; scrollbar-gutter: stable; padding-right: 8px; }
    .dn-table { width: 100%; border-collapse: collapse; font-size: 11.5px; table-layout: auto; }
    .dn-table th { text-align: left; font-weight: 600; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.06em; color: ${A.sub}; padding: 7px 10px; border-bottom: 1px solid ${A.line}; background: ${A.bg}; white-space: nowrap; position: sticky; top: 0; z-index: 1; }
    .dn-th-sort { cursor: pointer; user-select: none; }
    .dn-th-sort:hover { color: ${A.ink}; }
    .dn-table th:first-child { padding-left: 16px; }
    .dn-table th:last-child  { padding-right: 16px; }
    .dn-table td { padding: 5px 8px; border-bottom: 1px solid ${A.lineSoft}; vertical-align: middle; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .dn-table td:first-child { padding-left: 0; }
    .dn-table td:last-child  { padding-right: 4px; }
    .dn-table tr:last-child td { border-bottom: none; }
    .dn-table td.num { font-variant-numeric: tabular-nums; text-align: right; }
    .dn-table th.num { text-align: right; }
    .dn-dt-cell { display: flex; align-items: center; gap: 8px; }
    .dn-row-accent { width: 3px; height: 18px; border-radius: 2px; flex-shrink: 0; }
    .dn-dt { font-weight: 700; color: ${A.blue}; font-variant-numeric: tabular-nums; font-size: 11.5px; }
    .dn-cell-placeholder { color: ${A.amber}; font-size: 10.5px; font-style: italic; font-weight: 500; }
    .dn-pct-row { display: flex; align-items: center; gap: 6px; min-width: 96px; }
    .dn-pct-bar { flex: 1; height: 4px; background: ${A.lineSoft}; border-radius: 2px; overflow: hidden; min-width: 40px; }
    .dn-pct-bar > div { height: 100%; border-radius: 2px; }
    .dn-pct-num { font-weight: 600; min-width: 42px; text-align: right; font-variant-numeric: tabular-nums; font-size: 10.5px; }
    .dn-pill { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 600; white-space: nowrap; }
    .dn-pill::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
    .dn-estado-pill-btn { min-width: 98px; width: 100%; border: 1px solid; border-radius: 8px; font-size: 9.5px; font-weight: 800; letter-spacing: 0.01em; padding: 4px 5px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; justify-content: center; background: #fff; }
    .dn-estado-pill-btn:focus { outline: none; border-color: ${A.blue}; box-shadow: 0 0 0 2px ${A.bgSoftBlue}; }
    .dn-estado-control { display: inline-flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%; white-space: nowrap; }
    .dn-estado-pill { min-width: 0; max-width: 100%; border: 1px solid; border-radius: 10px; font-size: 10px; font-weight: 800; letter-spacing: 0.01em; padding: 5px 8px; display: inline-flex; align-items: center; gap: 5px; justify-content: center; background: #fff; white-space: nowrap; }
    .dn-estado-pill span { line-height: 1; }
    .dn-estado-select-wrap { position: relative; width: 34px; height: 28px; flex: 0 0 34px; }
    .dn-estado-select-icon { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; border: 1px solid ${A.line}; border-radius: 8px; background: #fff; color: ${A.sub}; cursor: pointer; appearance: none; -webkit-appearance: none; padding: 0 12px 0 0; text-align: center; text-align-last: center; font-size: 11px; font-weight: 800; }
    .dn-estado-select-icon:focus { outline: none; border-color: ${A.blue}; box-shadow: 0 0 0 2px ${A.bgSoftBlue}; }
    .dn-estado-chevron { position: absolute; top: 0; right: 5px; bottom: 0; display: flex; align-items: center; justify-content: center; color: ${A.sub}; font-size: 10px; pointer-events: none; }
    .dn-manual-badge { display: inline-flex; align-items: center; padding: 2px 6px; border-radius: 999px; font-size: 9px; font-weight: 800; letter-spacing: 0.08em; background: ${A.bgSoftAmber}; color: ${A.amber}; }
    .dn-compact-list { display: none; }
    .dn-compact-card { background: #fff; border: 1px solid ${A.line}; border-radius: 14px; padding: 12px; display: flex; flex-direction: column; gap: 10px; box-shadow: 0 1px 0 rgba(0,0,0,0.02); }
    .dn-compact-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
    .dn-compact-title { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .dn-compact-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .dn-compact-sub { font-size: 11px; color: ${A.sub}; line-height: 1.3; }
    .dn-compact-kpis { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .dn-compact-field { background: ${A.bg}; border: 1px solid ${A.lineSoft}; border-radius: 10px; padding: 8px 10px; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .dn-compact-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: ${A.sub}; font-weight: 700; }
    .dn-compact-value { font-size: 13px; font-weight: 700; color: ${A.ink}; font-variant-numeric: tabular-nums; line-height: 1.1; }
    .dn-compact-progress { height: 5px; background: ${A.lineSoft}; border-radius: 999px; overflow: hidden; }
    .dn-compact-progress > div { height: 100%; border-radius: 999px; }
    .dn-compact-editors { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .dn-compact-editors .dn-inline-input { width: 100%; }
    .dn-compact-editors .dn-estado-control { min-width: 0; flex-wrap: wrap; }
    .dn-compact-editors .dn-estado-pill { min-width: 0; max-width: 100%; }
    .dn-truncate { max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
    .dn-stage { font-family: ui-monospace, monospace; font-size: 10.5px; color: ${A.sub}; }
    .dn-inline-input { width: 100%; min-width: 0; border: 1px solid ${A.line}; border-radius: 6px; padding: 2px 5px; font-size: 10px; color: ${A.ink}; background: #fff; }
    .dn-inline-input:focus { outline: none; border-color: ${A.blue}; box-shadow: 0 0 0 2px ${A.bgSoftBlue}; }
    .dn-stage-input { font-family: ui-monospace, monospace; }
    .dn-table th:nth-child(1), .dn-table td:nth-child(1) { min-width: 86px; }
    .dn-table th:nth-child(2), .dn-table td:nth-child(2) { min-width: 140px; }
    .dn-table th:nth-child(3), .dn-table td:nth-child(3) { min-width: 140px; width: 18%; }
    .dn-table th:nth-child(4), .dn-table td:nth-child(4) { min-width: 160px; width: 20%; }
    .dn-table th:nth-child(5), .dn-table td:nth-child(5) { min-width: 52px; }
    .dn-table th:nth-child(6), .dn-table td:nth-child(6) { min-width: 48px; }
    .dn-table th:nth-child(7), .dn-table td:nth-child(7) { min-width: 60px; }
    .dn-table th:nth-child(8), .dn-table td:nth-child(8) { min-width: 60px; }
    .dn-table th:nth-child(9), .dn-table td:nth-child(9) { min-width: 88px; }
    .dn-table th:nth-child(10), .dn-table td:nth-child(10) { min-width: 105px; }
    .dn-table th:nth-child(11), .dn-table td:nth-child(11) { min-width: 76px; }
    .dn-table th:nth-child(12), .dn-table td:nth-child(12) { min-width: 55px; }
    .dn-table th:nth-child(13), .dn-table td:nth-child(13) { min-width: 88px; }
    .dn-table th:nth-child(14), .dn-table td:nth-child(14) { min-width: 106px; }

    /* Drag overlay */
    .dn-dragover { position: absolute; inset: 0; background: rgba(250, 250, 249, 0.95); border: 3px dashed ${A.blue}; border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; z-index: 100; pointer-events: none; }
    .dn-dragover .icon { font-size: 56px; }
    .dn-dragover h3 { margin: 0; font-size: 22px; font-weight: 700; color: ${A.ink}; }
    .dn-dragover p { margin: 0; font-size: 13px; color: ${A.sub}; }

    .dn-error { position: absolute; top: 70px; left: 50%; transform: translateX(-50%); background: ${A.bgSoftRed}; color: ${A.red}; border: 1px solid ${A.red}40; padding: 8px 14px; border-radius: 8px; font-size: 12px; font-weight: 500; z-index: 50; display: flex; align-items: center; gap: 8px; max-width: 80%; }

    /* Inspector modal */
    .dn-modal-bg { position: absolute; inset: 0; background: rgba(0,0,0,0.4); z-index: 200; display: flex; align-items: center; justify-content: center; }
    .dn-modal { background: #fff; border-radius: 12px; padding: 24px; max-width: 900px; max-height: 80%; overflow: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.25); width: 90%; }
    .dn-modal h3 { margin: 0 0 4px; font-size: 16px; font-weight: 700; letter-spacing: -0.01em; }
    .dn-modal .desc { font-size: 12px; color: ${A.sub}; margin-bottom: 16px; }
    .dn-map-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .dn-map-table th { text-align: left; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: ${A.sub}; padding: 8px 10px; border-bottom: 1px solid ${A.line}; }
    .dn-map-table td { padding: 8px 10px; border-bottom: 1px solid ${A.lineSoft}; vertical-align: top; }
    .dn-map-ok { color: ${A.green}; font-weight: 600; }
    .dn-map-bad { color: ${A.red}; font-weight: 600; }
    .dn-map-code { font-family: ui-monospace, monospace; font-size: 11px; background: ${A.lineSoft}; padding: 2px 6px; border-radius: 4px; color: ${A.ink}; }
    .dn-modal-close { float: right; padding: 6px 12px; background: ${A.ink}; color: #fff; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600; }

    @media (max-width: 720px) {
      .dn { padding: 10px 10px; gap: 10px; }
      .dn-head { flex-direction: column; align-items: flex-start; gap: 6px; }
      .dn-head-right { width: 100%; flex-wrap: wrap; justify-content: flex-start; }
      .dn-save-note { right: auto; left: 0; top: calc(100% + 6px); }
      .dn-date { flex-wrap: wrap; }
      .dn-grid { grid-template-columns: 1fr; }
      .dn-gauge { transform: scale(0.9); transform-origin: top center; }
      .dn-table-wrap { overflow-x: auto; padding-right: 0; }
      .dn-detail-head { flex-direction: column; align-items: flex-start; gap: 6px; }
      .dn-status-tabs { flex-wrap: wrap; }
      .dn-filters { flex-wrap: wrap; }
      .dn-search { min-width: 0; width: 100%; }
      .dn-search input { width: 100%; min-width: 0; }
      .dn-btn { font-size: 14px; }
    }

    @media (max-width: 1024px) {
      .dn-table-wrap { display: none; }
      .dn-compact-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(290px, 1fr)); gap: 10px; padding: 12px; overflow-y: auto; flex: 1; }
      .dn-detail { min-height: 0; }
      .dn-detail-expanded { inset: 8px; }
      .dn-detail-head { padding: 10px 12px; }
    }

    @media (max-width: 420px) {
      .dn { padding: 8px 8px; gap: 8px; }
      .dn-gauge { transform: scale(0.78); transform-origin: top center; }
      .dn-select { min-width: 52px; font-size: 11px; padding: 3px 4px; }
      .dn-live { font-size: 9px; padding: 3px 8px; }
      .dn-head-title { font-size: 14px; }
      .dn-table { font-size: 10.5px; }
      .dn-modal { padding: 14px; }
      .dn-compact-list { grid-template-columns: 1fr; padding: 10px; }
      .dn-compact-editors, .dn-compact-kpis { grid-template-columns: 1fr; }
      .dn-estado-control { min-width: 0; flex-wrap: wrap; }
      .dn-estado-pill { min-width: 0; max-width: 100%; }
    }
  `;

  const temporalViewLabel = 'Fecha operativa';
  const loadedAtLabel = loadedAt ? formatUiDateTime(loadedAt, { includeYear: true }) : '';
  const publishedAtLabel = publishedAt ? formatUiDateTime(publishedAt, { includeYear: true }) : '';
  const lastUpdateLabel = loadedAtLabel || publishedAtLabel || 'sin dato';
  const sourceLabel = filename
    ? <span>Última actualización: {lastUpdateLabel}</span>
    : <span>Última actualización: sin dato</span>;
  const pendingEditsCount = Object.keys(pendingEdits || {}).length;

  return (
    <div
      className="dn"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
      onDrop={onDrop}
    >
      <style>{css}</style>

      {dragOver && (
        <div className="dn-dragover">
          <div className="icon">+</div>
          <h3>Suelta tu archivo Excel aquí</h3>
          <p>Acepta .xlsx y .xls - el dashboard se actualiza automáticamente</p>
        </div>
      )}

      {error && (
        <div className="dn-error">Advertencia: {error} <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setError(null)}>cerrar</span></div>
      )}

      {showInspector && rawHeaders && (
        <div className="dn-modal-bg" onClick={() => setShowInspector(false)}>
          <div className="dn-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dn-modal-close" onClick={() => setShowInspector(false)}>Cerrar</div>
            <h3>Inspector de columnas</h3>
            <div className="desc">Aquí ves cómo se mapearon las columnas de tu Excel. Si un campo dice <b style={{color: A.red}}>NO ENCONTRADA</b>, dime el nombre exacto de tu columna y lo agrego.</div>
            <table className="dn-map-table">
              <thead><tr><th>Campo dashboard</th><th>Tu columna Excel</th><th>Ejemplo (1ª fila)</th></tr></thead>
              <tbody>
                {Object.keys(COL_ALIASES).map((key) => {
                  const matchedHeader = rawHeaders.find(h => COL_ALIASES[key].includes(norm(h)));
                  return (
                    <tr key={key}>
                      <td><span className="dn-map-code">{key}</span></td>
                      <td>{matchedHeader
                        ? <span className="dn-map-ok">OK "{matchedHeader}"</span>
                        : <span className="dn-map-bad">NO ENCONTRADA</span>}
                      </td>
                      <td style={{color: A.sub}}>{matchedHeader && rawSample ? String(rawSample[matchedHeader] ?? '-') : '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <h3 style={{marginTop: 20}}>Todas las columnas en tu Excel ({rawHeaders.length})</h3>
            <div style={{display: 'flex', flexWrap: 'wrap', gap: 6}}>
              {rawHeaders.map(h => {
                const isMapped = Object.values(COL_ALIASES).some(aliases => aliases.includes(norm(h)));
                return (
                  <span key={h} className="dn-map-code" style={{background: isMapped ? A.bgSoftGreen : A.bgSoftRed, color: isMapped ? A.green : A.red}}>
                    {isMapped ? 'OK' : 'FALTA'} {h}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="dn-head">
        <div className="dn-brand">
          <div className="dn-mark">D</div>
          <div>
            <h1>DINET · Estatus Picking / Despachos Unilever</h1>
            <div className="meta">{sourceLabel}</div>
          </div>
        </div>
        <div className="dn-head-right">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={(e) => handleFile(e.target.files && e.target.files[0])}
          />
          <div className="dn-tabs" style={{ justifyContent: 'flex-end', flexWrap: 'wrap', gap: 6 }}>
            <div className="dn-tab active" title="Filtra por fecha operativa">
              Fecha operativa
            </div>
          </div>
          <div className="dn-date">
            <span className="dn-date-label">{temporalViewLabel}</span>
            <div className="dn-btn" onClick={() => setDateTo(0)} title="Ir a hoy" style={{ padding: '5px 9px' }}>Hoy</div>
            <div className="dn-btn" onClick={() => setDateTo(1)} title="Ir a ayer" style={{ padding: '5px 9px' }}>Ayer</div>
            <select className="dn-select" value={filterDay} onChange={(e) => setFilterDay(e.target.value)}>
              <option value="Todos">Día</option>
              {days.map((d) => <option key={d} value={String(d)}>{d}</option>)}
            </select>
            <select className="dn-select" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}>
              <option value="Todos">Mes</option>
              {months.map((m) => <option key={m} value={String(m)}>{monthName(m)}</option>)}
            </select>
            <select className="dn-select" value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
              <option value="Todos">Año</option>
              {years.map((y) => <option key={y} value={String(y)}>{y}</option>)}
            </select>
          </div>
          <div
            className="dn-btn"
            style={isRefreshing ? { opacity: 0.55, pointerEvents: 'none', padding: '5px 8px', minWidth: 28, justifyContent: 'center' } : { padding: '5px 8px', minWidth: 28, justifyContent: 'center' }}
            onClick={isRefreshing ? undefined : tryAutoLoad}
            title="Actualizar datos"
          >{isRefreshing ? '↻' : '↻'}</div>
          <div
            className={'dn-save-btn' + (pendingEditsCount ? ' pending' : '')}
            onClick={pendingEditsCount && !isSavingEdits ? () => syncEditsNow({ manual: true }) : undefined}
            title={pendingEditsCount ? 'Guardar cambios manuales con respaldo local y remoto' : 'Sin cambios manuales pendientes'}
          >
            {isSavingEdits ? 'Guardando' : pendingEditsCount ? `Guardar ${pendingEditsCount}` : 'Guardar'}
          </div>
          {saveNotice && <div className="dn-save-note">{saveNotice}</div>}
          <div
            className="dn-filter-toggle-btn"
            onClick={() => setShowFilters(v => !v)}
            title={showFilters ? 'Ocultar filtros de zona' : 'Mostrar filtros de zona'}
          >{showFilters ? '▲' : '▼'}</div>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="dn-filters">
          <div className="dn-tabs">
            <div className={'dn-tab' + (zoneFilter === 'Todos' ? ' active' : '')} onClick={() => setZoneFilter('Todos')}><span className="dot" style={{ background: A.blue }} />Todos</div>
            <div className={'dn-tab' + (zoneFilter === 'Local' ? ' active' : '')} onClick={() => setZoneFilter('Local')}><span className="dot" style={{ background: A.green }} />Local</div>
            <div className={'dn-tab' + (zoneFilter === 'Provincia' ? ' active' : '')} onClick={() => setZoneFilter('Provincia')}><span className="dot" style={{ background: A.amber }} />Provincia</div>
          </div>
          <div className="dn-search">Buscar: <input placeholder="Buscar destino o DT..." value={searchText} onChange={(e) => setSearchText(e.target.value)} /></div>
        </div>
      )}

      {/* Main metrics */}
      <div className="dn-grid">
        <div className="dn-card dn-gauge-card">
          <div className="dn-gauge-head">
            <div>
              <div className="dn-card-title">Picking</div>
            </div>
          </div>
          <Gauge pct={pickingPct} color={A.green} sub={`${pickingCj.toLocaleString()} / ${totalCj.toLocaleString()} Cjs`} gradId="grad-picking" />
        </div>

        <div className="dn-card dn-card-middle">
          <div className="dn-card-eyebrow">Resumen operativo</div>
          <table className="dn-summary">
            <thead><tr><th></th><th>Ton</th><th>m³</th><th>Cajas</th></tr></thead>
            <tbody>
              {summary.map((r) => (
                <tr key={r.label}>
                  <td style={r.bold ? { color: A.ink, fontWeight: 700 } : {}}>{r.label}</td>
                  <td style={{ color: colorMap[r.color], fontWeight: r.bold ? 700 : 600 }}>{r.ton} Ton</td>
                  <td style={{ color: colorMap[r.color], fontWeight: r.bold ? 700 : 600 }}>{r.m3} m³</td>
                  <td style={{ color: colorMap[r.color], fontWeight: r.bold ? 700 : 600 }}>{r.cj} Cj</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="dn-turno">
            {turnos.map((t) => (
              <div className="dn-turno-row" key={t.name}>
                <div className="dn-turno-head">
                  <span className="dn-turno-name">{t.name}</span>
                  <span className="dn-turno-stats">
                    <b>{t.ton}</b> Ton
                    <span style={{ margin: '0 6px', color: A.line }}>·</span>
                    <b>{t.m3}</b> m³
                    <span style={{ margin: '0 6px', color: A.line }}>·</span>
                    <b>{t.cj}</b> Cjs
                  </span>
                </div>
                <div className="dn-turno-bar">
                  <div style={{ width: Math.max(t.pct, 4) + '%', background: turnoColor(t.pct) }}>{t.pct}%</div>
                </div>
              </div>
            ))}
            {turnos.length === 0 && <div style={{ fontSize: 10.5, color: A.sub, padding: '8px 0' }}>Sin datos de turnos</div>}
          </div>
        </div>

        <div className="dn-card dn-gauge-card">
          <div className="dn-gauge-head">
            <div>
              <div className="dn-card-title">Despacho</div>
            </div>
          </div>
          <Gauge pct={despachoPct} color={A.blue} sub={`${despachoCj.toLocaleString()} cjs cargadas`} gradId="grad-despacho" />
        </div>
      </div>

      {/* Detail */}
      <div className={'dn-detail' + (detailExpanded ? ' dn-detail-expanded' : '')}>
        <div className="dn-detail-head">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <h2>Detalle DTs</h2>
            <div className="sub">{rowsFiltered.length} registros</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="dn-status-tabs">
              {statusTabs.map((t) => (
                <div key={t.label} className={'dn-status-tab' + (isTabActive(t.value) ? ' active' : '')} onClick={() => toggleStatusFilter(t.value)}>
                  <span className="dot" style={{ background: t.dot }} />
                  {t.label}
                  <span className="count">{t.count}</span>
                </div>
              ))}
            </div>
            <div
              className="dn-btn"
              onClick={() => setDetailExpanded(v => !v)}
              title={detailExpanded ? 'Contraer tabla' : 'Expandir tabla'}
              style={{ padding: '4px 8px', fontSize: 13, lineHeight: 1 }}
            >{detailExpanded ? '▼ Contraer' : '▲ Expandir'}</div>
          </div>
        </div>
        {isCompactView ? (
          <div className="dn-compact-list">
            {rowsSorted.map(renderCompactCard)}
          </div>
        ) : (
          <div className="dn-table-wrap">
            <table className="dn-table">
              <thead>
                <tr>
                  <th># DT</th>
                  <th>Transporte</th>
                  <th>Cliente</th>
                  <th>Destino</th>
                  <th className="num">Ton</th>
                  <th className="num">m³</th>
                  <th className="num">Pedido</th>
                  <th className="num">Avance</th>
                  <th>Placa</th>
                  <th className="num dn-th-sort" onClick={() => toggleSort('pct')} title="Ordenar por % Avance">% Avance {sortCol === 'pct' ? (sortDir === 'asc' ? '↑' : '↓') : '⇅'}</th>
                  <th>Stage</th>
                  <th className="num dn-th-sort" onClick={() => toggleSort('rampa')} title="Ordenar por Rampa">Rampa {sortCol === 'rampa' ? (sortDir === 'asc' ? '↑' : '↓') : '⇅'}</th>
                  <th className="dn-th-sort" onClick={() => toggleSort('cita')} title="Ordenar por Cita">Cita {sortCol === 'cita' ? (sortDir === 'asc' ? '↑' : '↓') : '⇅'}</th>
                  <th>Estado Carga</th>
                </tr>
              </thead>
              <tbody>
                {rowsSorted.map((r, i) => {
                  const effectiveStatus = getEffectiveStatusKey(r);
                  const st = statusStyle(effectiveStatus);
                  const pedido = pedidoRow(r);
                  const avance = getEffectiveAvanceUnits(r);
                  const pctAvance = getEffectivePickingPct(r);
                  const citaTxt = (r.cita ?? '').toString().trim();
                  const citaValida = citaTxt;
                  return (
                    <tr key={(r.dt || '') + '-' + i} style={r.provisional ? { opacity: 0.72, fontStyle: 'italic' } : {}}>
                      <td>
                        <div className="dn-dt-cell">
                          <div className="dn-row-accent" style={{ background: st.accent }} />
                          <span className="dn-dt">{r.dt}</span>
                          {r.provisional && <span title="Sin Excel de ruteo aún" style={{ fontSize: 9, fontWeight: 700, color: A.amber, background: A.amber + '22', borderRadius: 4, padding: '1px 4px', marginLeft: 3, fontStyle: 'normal' }}>P</span>}
                        </div>
                      </td>
                      <td className="dn-truncate" style={!String(r.transp ?? '').trim() ? { color: A.amber, fontStyle: 'italic' } : {}}>{textOrPlaceholder(r.transp)}</td>
                      <td className="dn-truncate">{r.cliente}</td>
                      <td className="dn-truncate" style={!String(r.destino ?? '').trim() ? { color: A.amber, fontSize: 11, fontStyle: 'italic' } : { color: A.sub, fontSize: 11 }}>{textOrPlaceholder(r.destino)}</td>
                      <td className="num">{numberOrPlaceholder(r.ton, r)}</td>
                      <td className="num">{numberOrPlaceholder(r.m3, r)}</td>
                      <td className="num">{pedido.toLocaleString()}</td>
                      <td className="num" style={{ fontWeight: 600 }}>{avance.toLocaleString()}</td>
                      <td>
                        <input
                          className="dn-inline-input"
                          defaultValue={r.placa || ''}
                          placeholder="AB1-1C3"
                          maxLength={7}
                          onInput={(e) => {
                            const clean = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
                            e.target.value = clean.length > 3 ? clean.slice(0, 3) + '-' + clean.slice(3) : clean;
                          }}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            const ok = v === '' || /^[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(v);
                            if (!ok) e.target.value = '';
                            updateRowFields(r.__id, { placa: ok ? v : '' });
                          }}
                        />
                      </td>
                      <td>
                        <div className="dn-pct-row">
                          <span className="dn-pct-num" style={{ color: st.accent }}>{Math.min(100, pctAvance).toFixed(1)}%</span>
                          <div className="dn-pct-bar"><div style={{ width: Math.min(100, pctAvance) + '%', background: st.accent }} /></div>
                        </div>
                      </td>
                      <td>
                        <input
                          className="dn-inline-input dn-stage-input"
                          defaultValue={r.stage || ''}
                          placeholder="ST.00.00"
                          maxLength={9}
                          onInput={(e) => {
                            e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9.]/g, '').slice(0, 9);
                          }}
                          onBlur={(e) => {
                            const v = e.target.value.trim().toUpperCase();
                            const ok = v === '' || /^ST\.\d{1,2}\.\d{1,2}$/.test(v);
                            if (!ok) e.target.value = '';
                            updateRowFields(r.__id, { stage: ok ? v : '' });
                          }}
                        />
                      </td>
                      <td className="num" style={{ fontWeight: 600 }}>{r.rampa}</td>
                      <td>
                        <input
                          className="dn-inline-input"
                          defaultValue={citaValida || ''}
                          placeholder="HH:MM ó 1-9"
                          maxLength={5}
                          onInput={(e) => {
                            let v = e.target.value.replace(/[^0-9:]/g, '');
                            const ci = v.indexOf(':');
                            if (ci !== -1) v = v.slice(0, ci + 1) + v.slice(ci + 1).replace(/:/g, '');
                            if (!v.includes(':') && v.length > 3) v = v.slice(0, 2) + ':' + v.slice(2);
                            if (v.length > 5) v = v.slice(0, 5);
                            e.target.value = v;
                          }}
                          onBlur={(e) => updateRowFields(r.__id, { cita: e.target.value })}
                        />
                      </td>
                      <td>{renderEstadoCargaControl(r)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

window.DashDinet = DashDinet;
