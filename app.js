import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const config = window.DMS_UNILEVER_MONITOR_CONFIG;

if (!config?.SUPABASE_URL || !config?.SUPABASE_ANON_KEY) {
  document.getElementById('app').innerHTML = '<div class="login-shell"><div class="login-card"><h1>Falta config.js</h1></div></div>';
  throw new Error('Falta configuracion publica del visor monitor.');
}

const APP_NAME = config.APP_NAME ?? 'Visor Monitor Unilever';
const REQUEST_TIMEOUT_MS = 15000;
const DEFAULT_POLL_MS = config.DEFAULT_POLL_MS ?? 20000;
const KIOSK_ROTATION_MS = config.KIOSK_ROTATION_MS ?? 18000;
const BLOCK_CODE = 'A';
const DINET_MONITOR_STORAGE_KEY = 'dinet-monitor-data';
const DINET_MONITOR_OVERRIDE_KEY = 'dinet-monitor-overrides';

const VIEW_DEFS = {
  'rampas-voz': {
    label: 'Rampas + Voz',
    icon: 'campaign',
    subtitle: 'Tablero de rampas del bloque A con anuncios automáticos.',
  },
  resumen: {
    label: 'Resumen',
    icon: 'monitoring',
    subtitle: 'KPIs operativos y panorama instantáneo de la operación.',
  },
  'dashboard-web': {
    label: 'Dashboard Web',
    icon: 'space_dashboard',
    subtitle: 'Replica visual del dashboard DINET usando la data actual del DMS.',
  },
  kiosk: {
    label: 'Kiosk',
    icon: 'slideshow',
    subtitle: 'Rotación automática entre las vistas autorizadas.',
  },
};

const VIEW_ACCESS_BY_ROLE = {
  admin: ['rampas-voz', 'resumen', 'dashboard-web', 'kiosk'],
  supervisor_cuenta: ['rampas-voz', 'resumen', 'dashboard-web', 'kiosk'],
  lider: ['rampas-voz', 'resumen', 'kiosk'],
};

const VIEW_ACCESS_BY_USERNAME = {
  monitorrampas: ['rampas-voz'],
  monitorresumen: ['resumen'],
  monitordashboard: ['dashboard-web'],
  monitorkiosk: ['kiosk'],
};

const noopLock = async (_name, _timeout, fn) => fn();

function fetchWithTimeout(input, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return fetch(input, { ...init, signal: controller.signal })
    .catch((error) => {
      if (error?.name === 'AbortError') {
        throw new Error('No se pudo conectar con Supabase (timeout).');
      }
      throw new Error('No se pudo conectar con Supabase.');
    })
    .finally(() => clearTimeout(timer));
}

const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    lock: noopLock,
  },
  global: {
    fetch: fetchWithTimeout,
  },
});

const state = {
  session: null,
  profile: null,
  roleKey: null,
  loading: false,
  message: null,
  activeView: 'rampas-voz',
  ramps: [],
  visits: [],
  importRows: [],
  importRowsAvailable: false,
  lastSyncAt: null,
  pollTimer: null,
  kioskTimer: null,
  voiceEnabled: true,
  kioskPaused: false,
  sidebarOpen: false,
  previousRampStates: new Map(),
  speaking: false,
  bootedUserId: null,
};

const app = document.getElementById('app');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function firstValue(value) {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeRoleKey(roleName) {
  if (!roleName) return null;
  const normalized = normalizeText(roleName).replace(/-/g, '_');
  const map = new Map([
    ['admin', 'admin'],
    ['supervisor_cuenta', 'supervisor_cuenta'],
    ['lider', 'lider'],
    ['lider_jop', 'lider'],
    ['jop', 'lider'],
  ]);
  return map.get(normalized) ?? null;
}

function normalizeUsernameKey(username) {
  return normalizeText(username).replace(/[^a-z0-9]/g, '');
}

function setMessage(type, text) {
  state.message = text ? { type, text } : null;
  render();
}

function buildInternalEmailFromUsername(username) {
  return `login+${username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')}@auth.dms.local`;
}

function formatDateTime(value) {
  if (!value) return '--';
  return new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatTime(value) {
  if (!value) return '--';
  return new Intl.DateTimeFormat('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatElapsed(value) {
  if (!value) return '--';
  const diffMs = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return '--';
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes} min`;
  return `${hours} h ${minutes} min`;
}

function formatNumber(value, digits = 0) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return '--';
  return new Intl.NumberFormat('es-PE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(number);
}

function normalizeImportFieldKey(value) {
  return normalizeText(value)
    .replace(/[_./\\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseLooseNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  let normalized = String(value).trim().replace(/\s/g, '');
  if (!normalized) return 0;
  const hasComma = normalized.includes(',');
  const hasDot = normalized.includes('.');
  if (hasComma && hasDot) {
    if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  } else if (hasComma) {
    normalized = normalized.replace(',', '.');
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getOperationLabel(value) {
  const normalized = normalizeText(value);
  if (normalized.includes('devol')) return 'Devolucion';
  if (normalized.includes('descarg') || normalized.includes('ingres')) return 'Descarga';
  return 'Carga';
}

function getCurrentUserLabel() {
  if (!state.profile) return '';
  return `${state.profile.nombres ?? 'Usuario'} · ${state.profile.username ?? ''}`.trim();
}

function getAllowedViews() {
  const roleViews = VIEW_ACCESS_BY_ROLE[state.roleKey] ?? [];
  const usernameViews = VIEW_ACCESS_BY_USERNAME[normalizeUsernameKey(state.profile?.username)] ?? [];
  const combined = [...new Set([...roleViews, ...usernameViews])];
  return combined.length ? combined : ['rampas-voz'];
}

function syncViewWithHash() {
  const hashView = window.location.hash.replace(/^#\/?/, '').trim();
  const allowed = getAllowedViews();
  if (hashView && allowed.includes(hashView)) {
    state.activeView = hashView;
    return;
  }
  if (!allowed.includes(state.activeView)) {
    state.activeView = allowed[0];
  }
  window.location.hash = `#/${state.activeView}`;
}

async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nombres, username, activo, roles(nombre)')
    .eq('id', userId)
    .single();

  if (error) throw error;
  if (!data?.activo) throw new Error('El usuario monitor no está activo.');

  const roleName = firstValue(data.roles)?.nombre ?? null;
  state.profile = data;
  state.roleKey = normalizeRoleKey(roleName);
}

async function fetchRamps() {
  const { data, error } = await supabase
    .from('rampas')
    .select('id, codigo, nombre, activo, bloques(codigo, nombre)')
    .eq('activo', true)
    .order('codigo');

  if (error) throw error;

  state.ramps = (data ?? []).filter((ramp) => firstValue(ramp.bloques)?.codigo === BLOCK_CODE);
}

async function fetchLiveVisits() {
  const { data, error } = await supabase
    .from('visitas_unidad')
    .select(`
      id,
      codigo_visita,
      tipo_operacion,
      rampa_id,
      created_at,
      updated_at,
      hora_registro,
      hora_asignacion_rampa,
      hora_llegada_rampa,
      hora_inicio_carga,
      hora_fin_carga,
      hora_inicio_descarga,
      hora_fin_descarga,
      hora_inicio_facturacion,
      hora_fin_facturacion,
      hora_salida,
      hora_retiro_unidad,
      vehiculos(placa),
      empresas_transporte(nombre),
      estados_visita(nombre, codigo)
    `)
    .eq('cliente_id', config.CLIENTE_ID)
    .is('hora_salida', null)
    .is('hora_retiro_unidad', null)
    .order('updated_at', { ascending: false })
    .limit(120);

  if (error) throw error;
  state.visits = data ?? [];
  state.lastSyncAt = new Date().toISOString();
}

async function fetchImportRowsOptional() {
  if (!['admin', 'supervisor_cuenta'].includes(state.roleKey)) {
    state.importRows = [];
    state.importRowsAvailable = false;
    return;
  }

  try {
    const { data: batch, error: batchError } = await supabase
      .from('excel_import_batches')
      .select('id, fecha_operacion, completed_at')
      .eq('cliente_id', config.CLIENTE_ID)
      .eq('estado', 'completed')
      .order('fecha_operacion', { ascending: false })
      .order('completed_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (batchError || !batch?.id) {
      state.importRows = [];
      state.importRowsAvailable = false;
      return;
    }

    const { data: rows, error: rowsError } = await supabase
      .from('excel_import_rows')
      .select('id, dt_embarque, placa, empresa_transporte, volumen, operacion, fecha_operacion, raw_data, normalized_data')
      .eq('batch_id', batch.id)
      .order('row_number', { ascending: true })
      .limit(250);

    if (rowsError) {
      state.importRows = [];
      state.importRowsAvailable = false;
      return;
    }

    state.importRows = rows ?? [];
    state.importRowsAvailable = state.importRows.length > 0;
  } catch (_error) {
    state.importRows = [];
    state.importRowsAvailable = false;
  }
}

function getVisualState(visit) {
  if (!visit) return 'free';
  if (visit.hora_llegada_rampa) return 'occupied';
  if (visit.hora_asignacion_rampa) return 'reserved';
  return 'process';
}

function getVisualStateLabel(stateKey) {
  if (stateKey === 'occupied') return 'Ocupada';
  if (stateKey === 'reserved') return 'Reservada';
  if (stateKey === 'process') return 'En proceso';
  return 'Libre';
}

function deriveRampItems() {
  const byRamp = new Map();
  for (const visit of state.visits) {
    if (!visit.rampa_id) continue;
    if (!byRamp.has(visit.rampa_id)) {
      byRamp.set(visit.rampa_id, visit);
    }
  }

  return state.ramps.map((ramp) => {
    const visit = byRamp.get(ramp.id) ?? null;
    return {
      id: ramp.id,
      code: `A-${ramp.codigo}`,
      visit,
      visualState: getVisualState(visit),
    };
  });
}

function getSummary() {
  const rampItems = deriveRampItems();
  const active = state.visits.length;
  return {
    totalRamps: rampItems.length,
    libres: rampItems.filter((item) => item.visualState === 'free').length,
    reservadas: rampItems.filter((item) => item.visualState === 'reserved').length,
    ocupadas: rampItems.filter((item) => item.visualState === 'occupied').length,
    enProceso: rampItems.filter((item) => item.visualState === 'process').length,
    activas: active,
    facturacion: state.visits.filter((visit) => visit.hora_inicio_facturacion && !visit.hora_fin_facturacion).length,
    carga: state.visits.filter((visit) => visit.tipo_operacion === 'salida').length,
    descarga: state.visits.filter((visit) => visit.tipo_operacion !== 'salida').length,
  };
}

function getStageMetrics() {
  return [
    {
      title: 'Espera / Playa',
      note: 'Registradas sin rampa',
      value: state.visits.filter((visit) => !visit.rampa_id).length,
    },
    {
      title: 'Con rampa',
      note: 'Rampa asignada pendiente de llegada',
      value: state.visits.filter((visit) => visit.hora_asignacion_rampa && !visit.hora_llegada_rampa).length,
    },
    {
      title: 'En rampa',
      note: 'Unidad ya posicionada',
      value: state.visits.filter((visit) => visit.hora_llegada_rampa).length,
    },
    {
      title: 'Facturación',
      note: 'Carga en fase documental',
      value: state.visits.filter((visit) => visit.hora_inicio_facturacion && !visit.hora_fin_facturacion).length,
    },
  ];
}

function getDashboardRows() {
  return state.visits.slice(0, 12).map((visit) => {
    const vehiculo = firstValue(visit.vehiculos);
    const empresa = firstValue(visit.empresas_transporte);
    const estado = firstValue(visit.estados_visita);
    return {
      codigo: visit.codigo_visita,
      placa: vehiculo?.placa ?? 'SIN-PLACA',
      empresa: empresa?.nombre ?? 'Sin transportista',
      estado: estado?.nombre ?? 'Sin estado',
      tipo: visit.tipo_operacion === 'salida' ? 'Carga' : visit.tipo_operacion === 'devolucion' ? 'Devolución' : 'Descarga',
      tiempo: formatElapsed(visit.hora_registro || visit.created_at),
      rampa: state.ramps.find((ramp) => ramp.id === visit.rampa_id)?.codigo ? `A-${state.ramps.find((ramp) => ramp.id === visit.rampa_id)?.codigo}` : '--',
    };
  });
}

const IMPORT_DASHBOARD_ALIASES = {
  cliente: ['cliente', 'razon social', 'razon social cliente', 'cliente final', 'nombre cliente'],
  destino: ['destino', 'direccion destino', 'ruta', 'direccion', 'lugar destino', 'ubigeo'],
  ton: ['ton', 'toneladas', 'tn', 'peso ton', 'peso'],
  m3: ['m3', 'metros cubicos', 'metros3', 'volumen m3'],
  pedido: ['pedido', 'cajas pedido', 'total cajas', 'cajas', 'cantidad', 'unidades', 'total pedido', 'volumen'],
  avance: ['avance', 'cajas avance', 'cajas cargadas', 'cajas procesadas', 'avance picking', 'procesado'],
  rampa: ['rampa', 'anden', 'and en', 'puerta', 'dock'],
  estado: ['estado carga', 'estado', 'status carga', 'status', 'situacion'],
  cita: ['cita', 'hora cita', 'horacita', 'programado', 'hora programada'],
  stage: ['stage', 'etapa', 'fase', 'estado picking'],
  turno: ['turno', 'cita', 'hora cita', 'programado'],
};

function getImportFieldValue(source, aliases) {
  const entries = Object.entries(source ?? {});
  for (const [key, value] of entries) {
    if (!aliases.includes(normalizeImportFieldKey(key))) continue;
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
}

function normalizeDashboardStatus(value) {
  const normalized = normalizeText(value);
  if (!normalized) return '';
  if (normalized.includes('cargad')) return 'Cargado';
  if (normalized.includes('en carga') || normalized.includes('encarga') || normalized.includes('proceso')) return 'En carga';
  if (normalized.includes('prepar')) return 'Preparado';
  if (normalized.includes('pend')) return 'Pendiente';
  return String(value ?? '').trim();
}

function inferTurno(value, fallbackDate) {
  const raw = String(value ?? '').trim();
  if (/^[123]$/.test(raw)) return Number(raw);
  const timeMatch = raw.match(/^(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    const hour = Number(timeMatch[1]);
    if (hour < 12) return 1;
    if (hour < 18) return 2;
    return 3;
  }
  if (fallbackDate) {
    const date = new Date(fallbackDate);
    const hour = date.getHours();
    if (Number.isFinite(hour)) {
      if (hour < 12) return 1;
      if (hour < 18) return 2;
      return 3;
    }
  }
  return 1;
}

function inferDashboardStatus({ progressPct, explicitStatus, plate, ramp }) {
  const normalized = normalizeDashboardStatus(explicitStatus);
  if (normalized) return normalized;
  if (progressPct >= 100) return 'Cargado';
  if (progressPct > 0 || (plate && ramp)) return 'En carga';
  if (plate || ramp) return 'Preparado';
  return 'Pendiente';
}

function getVisitProgress(visit) {
  if (visit.hora_fin_carga || visit.hora_fin_descarga || visit.hora_fin_facturacion) return 100;
  if (visit.hora_inicio_facturacion) return 90;
  if (visit.hora_inicio_carga || visit.hora_inicio_descarga) return 72;
  if (visit.hora_llegada_rampa) return 45;
  if (visit.hora_asignacion_rampa) return 22;
  return 0;
}

function buildDashboardRowFromVisit(visit) {
  const vehiculo = firstValue(visit.vehiculos);
  const empresa = firstValue(visit.empresas_transporte);
  const ramp = state.ramps.find((item) => item.id === visit.rampa_id);
  const progressPct = getVisitProgress(visit);
  const pedido = 100;
  const avance = Math.round((pedido * progressPct) / 100);

  return {
    dt: visit.codigo_visita ?? '--',
    transporte: empresa?.nombre ?? 'Sin transportista',
    cliente: 'Unilever',
    destino: getOperationLabel(visit.tipo_operacion),
    ton: 0,
    m3: 0,
    pedido,
    avance,
    placa: vehiculo?.placa ?? '--',
    progressPct,
    rampa: ramp?.codigo ? `A-${ramp.codigo}` : '--',
    estadoCarga: inferDashboardStatus({
      progressPct,
      plate: vehiculo?.placa,
      ramp: ramp?.codigo,
    }),
    turno: inferTurno('', visit.hora_registro || visit.created_at),
    timeRef: visit.hora_registro || visit.created_at || visit.updated_at,
  };
}

function buildDashboardRowFromImportRow(row) {
  const raw = row.raw_data ?? {};
  const normalized = row.normalized_data ?? {};
  const pedido = parseLooseNumber(
    getImportFieldValue(raw, IMPORT_DASHBOARD_ALIASES.pedido)
    || normalized.volumen
    || row.volumen
  );
  const avance = parseLooseNumber(getImportFieldValue(raw, IMPORT_DASHBOARD_ALIASES.avance));
  const ton = parseLooseNumber(getImportFieldValue(raw, IMPORT_DASHBOARD_ALIASES.ton));
  const m3 = parseLooseNumber(getImportFieldValue(raw, IMPORT_DASHBOARD_ALIASES.m3));
  const ramp = getImportFieldValue(raw, IMPORT_DASHBOARD_ALIASES.rampa);
  const progressPct = pedido > 0 ? Math.max(0, Math.min(100, (avance / pedido) * 100)) : 0;

  return {
    dt: row.dt_embarque ?? '--',
    transporte: row.empresa_transporte || getImportFieldValue(raw, ['empresa transporte', 'transportista', 'transporte']) || 'Sin transportista',
    cliente: getImportFieldValue(raw, IMPORT_DASHBOARD_ALIASES.cliente) || 'Unilever',
    destino: getImportFieldValue(raw, IMPORT_DASHBOARD_ALIASES.destino) || (row.operacion ?? '--'),
    ton,
    m3,
    pedido,
    avance,
    placa: row.placa ?? '--',
    progressPct,
    rampa: ramp ? String(ramp).toUpperCase() : '--',
    estadoCarga: inferDashboardStatus({
      progressPct,
      explicitStatus: getImportFieldValue(raw, IMPORT_DASHBOARD_ALIASES.estado),
      plate: row.placa,
      ramp,
    }),
    turno: inferTurno(getImportFieldValue(raw, IMPORT_DASHBOARD_ALIASES.turno), row.fecha_operacion),
    timeRef: row.fecha_operacion || row.created_at || null,
  };
}

function toLegacyEstadoCargaManual(value) {
  const normalized = normalizeText(value);
  if (normalized.includes('cargad')) return 'CARGADO';
  if (normalized.includes('en carga') || normalized.includes('encarga')) return 'EN CARGA';
  return '';
}

function toLegacyStatusLabel(progressPct) {
  if (progressPct >= 100) return 'Completo';
  if (progressPct > 0) return 'En proceso';
  return 'Pendiente';
}

function getRampDigits(value) {
  const match = String(value ?? '').match(/\d+/);
  return match?.[0] ?? '';
}

function buildLegacyRowFromImportRow(row, index) {
  const base = buildDashboardRowFromImportRow(row);
  const raw = row.raw_data ?? {};
  const rampDigits = getRampDigits(base.rampa || getImportFieldValue(raw, IMPORT_DASHBOARD_ALIASES.rampa));
  const explicitStage = getImportFieldValue(raw, IMPORT_DASHBOARD_ALIASES.stage);
  const estadoManual = toLegacyEstadoCargaManual(base.estadoCarga);

  return {
    __id: index + 1,
    dt: String(base.dt || '').trim(),
    transp: base.transporte || '',
    cliente: base.cliente || 'Unilever',
    destino: base.destino || '',
    ton: Number(base.ton) || 0,
    m3: Number(base.m3) || 0,
    ped: Number(base.pedido) || 0,
    av: Number(base.avance) || 0,
    placa: base.placa === '--' ? '' : base.placa,
    pct: Number(base.progressPct) || 0,
    stage: explicitStage || (rampDigits ? `ST.${rampDigits.padStart(2, '0')}.00` : ''),
    rampa: rampDigits || '',
    cita: getImportFieldValue(raw, IMPORT_DASHBOARD_ALIASES.cita) || '',
    status: toLegacyStatusLabel(Number(base.progressPct) || 0),
    estadoCarga: base.estadoCarga || 'Pendiente',
    estadoCargaManual: estadoManual,
    estadoCargaAuto: estadoManual || '',
    turno: base.turno || 1,
    tipo: row.operacion || '',
    fecOp: row.fecha_operacion || '',
    fecha_operativa_turno: row.fecha_operacion || '',
    provisional: false,
  };
}

function buildLegacyRowFromVisit(visit, index) {
  const base = buildDashboardRowFromVisit(visit);
  const rampDigits = getRampDigits(base.rampa);
  const estadoManual = toLegacyEstadoCargaManual(base.estadoCarga);
  const fechaOperativa = String(base.timeRef || '').slice(0, 10);

  return {
    __id: index + 1,
    dt: String(base.dt || '').trim(),
    transp: base.transporte || '',
    cliente: base.cliente || 'Unilever',
    destino: base.destino || '',
    ton: Number(base.ton) || 0,
    m3: Number(base.m3) || 0,
    ped: Number(base.pedido) || 0,
    av: Number(base.avance) || 0,
    placa: base.placa === '--' ? '' : base.placa,
    pct: Number(base.progressPct) || 0,
    stage: rampDigits ? `ST.${rampDigits.padStart(2, '0')}.00` : '',
    rampa: rampDigits || '',
    cita: '',
    status: toLegacyStatusLabel(Number(base.progressPct) || 0),
    estadoCarga: base.estadoCarga || 'Pendiente',
    estadoCargaManual: estadoManual,
    estadoCargaAuto: estadoManual || '',
    turno: base.turno || 1,
    tipo: base.destino || '',
    fecOp: fechaOperativa,
    fecha_operativa_turno: fechaOperativa,
    provisional: true,
  };
}

function buildLegacyDashboardPayload() {
  const overrideMap = (() => {
    try {
      const raw = window.localStorage.getItem(DINET_MONITOR_OVERRIDE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_error) {
      return {};
    }
  })();

  const rows = state.importRowsAvailable
    ? state.importRows.map((row, index) => buildLegacyRowFromImportRow(row, index))
    : state.visits.map((visit, index) => buildLegacyRowFromVisit(visit, index));

  const appliedRows = rows.map((row) => {
    const digits = String(row.dt || '').replace(/\D/g, '').padStart(10, '0');
    const key = `${digits}|${String(row.fecha_operativa_turno || '').trim()}`;
    const patch = overrideMap?.[key];
    if (!patch) return row;

    const next = { ...row };
    if (Object.prototype.hasOwnProperty.call(patch, 'placa')) {
      next.placa = String(patch.placa || '').trim().toUpperCase();
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'stage')) {
      next.stage = String(patch.stage || '').trim().toUpperCase();
      const derivedRamp = getRampDigits(next.stage);
      if (derivedRamp) next.rampa = derivedRamp;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'rampa')) {
      next.rampa = getRampDigits(patch.rampa);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'cita')) {
      next.cita = String(patch.cita || '').trim();
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'estado_carga_manual')) {
      const manual = String(patch.estado_carga_manual || '').trim().toUpperCase();
      next.estadoCargaManual = manual;
      if (manual === 'CARGADO') next.estadoCarga = 'Cargado';
      if (manual === 'EN CARGA') next.estadoCarga = 'En carga';
    }
    return next;
  });

  return {
    rows: appliedRows.filter((row) => row.dt).slice(0, 160),
    filename: state.importRowsAvailable ? 'DMS Monitor + Excel' : 'DMS Monitor en vivo',
    loadedAt: state.lastSyncAt || new Date().toISOString(),
    publishedAt: state.lastSyncAt || new Date().toISOString(),
    rawHeaders: [],
    rawSample: null,
  };
}

function syncEmbeddedDinetDashboard() {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const payload = buildLegacyDashboardPayload();
    window.localStorage.setItem(DINET_MONITOR_STORAGE_KEY, JSON.stringify(payload));
    const frame = document.getElementById('dinet-dashboard-frame');
    frame?.contentWindow?.postMessage({ type: 'dinet-monitor-data-updated' }, '*');
  } catch (_error) {
    // noop
  }
}

function getDashboardRowsDinet() {
  if (state.importRowsAvailable) {
    return state.importRows
      .map((row) => buildDashboardRowFromImportRow(row))
      .filter((row) => row.dt || row.placa || row.transporte)
      .slice(0, 18);
  }

  return state.visits
    .slice(0, 18)
    .map((visit) => buildDashboardRowFromVisit(visit));
}

function getDinetMetrics(rows) {
  const safeRows = rows ?? [];
  const totalPedido = safeRows.reduce((sum, row) => sum + Math.max(0, Number(row.pedido) || 0), 0);
  const totalAvance = safeRows.reduce((sum, row) => sum + Math.max(0, Number(row.avance) || 0), 0);
  const totalBase = totalPedido || safeRows.length || 0;
  const despachoAvance = safeRows.reduce((sum, row) => {
    if (row.estadoCarga !== 'Cargado') return sum;
    return sum + Math.max(0, Number(row.avance) || (Number(row.pedido) || 0));
  }, 0);
  const pickingPct = totalBase ? Math.round((totalAvance / totalBase) * 100) : 0;
  const despachoPct = totalBase ? Math.round((despachoAvance / totalBase) * 100) : 0;
  const pendientePicking = Math.max(totalBase - totalAvance, 0);
  const byTurno = new Map();
  const statusTabs = [
    { key: 'todos', label: 'Todos', count: safeRows.length, tone: 'neutral' },
    { key: 'en-carga', label: 'En carga', count: safeRows.filter((row) => row.estadoCarga === 'En carga').length, tone: 'blue' },
    { key: 'pendiente', label: 'Pendiente', count: safeRows.filter((row) => row.estadoCarga === 'Pendiente').length, tone: 'amber' },
    { key: 'preparado', label: 'Preparado', count: safeRows.filter((row) => row.estadoCarga === 'Preparado').length, tone: 'cyan' },
    { key: 'cargado', label: 'Cargado', count: safeRows.filter((row) => row.estadoCarga === 'Cargado').length, tone: 'green' },
  ];

  for (const row of safeRows) {
    const turnoKey = row.turno || 1;
    if (!byTurno.has(turnoKey)) {
      byTurno.set(turnoKey, { name: `${turnoKey} turno`, total: 0, done: 0 });
    }
    const bucket = byTurno.get(turnoKey);
    bucket.total += Math.max(1, Number(row.pedido) || 1);
    bucket.done += Math.max(0, Number(row.avance) || 0);
  }

  return {
    sourceLabel: state.importRowsAvailable ? 'Excel importado + operacion DMS' : 'Operacion DMS en vivo',
    summary: [
      { label: 'Total', value: formatNumber(safeRows.length), helper: 'DTs visibles', tone: 'tone-ink' },
      { label: 'Avance picking', value: `${pickingPct}%`, helper: `${formatNumber(totalAvance)} / ${formatNumber(totalBase)}`, tone: 'tone-green' },
      { label: 'Pendiente picking', value: formatNumber(pendientePicking), helper: 'Por completar', tone: 'tone-ink' },
      { label: 'Avance despacho', value: `${despachoPct}%`, helper: `${formatNumber(despachoAvance)} cerrados`, tone: 'tone-blue' },
    ],
    turnos: [...byTurno.entries()]
      .sort((left, right) => Number(left[0]) - Number(right[0]))
      .map(([, item]) => {
        const pct = item.total ? Math.round((item.done / item.total) * 100) : 0;
        return {
          ...item,
          pct,
          stat: `${formatNumber(item.done)} / ${formatNumber(item.total)}`,
        };
      }),
    statusTabs,
    pickingPct,
    despachoPct,
    pickingCj: totalAvance,
    despachoCj: despachoAvance,
    totalCj: totalBase,
  };
}

function renderGauge({ pct, colorClass, title, sub }) {
  const safePct = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  return `
    <article class="dinet-card dinet-gauge-card">
      <div class="dinet-card-eyebrow">${escapeHtml(title)}</div>
      <div class="dinet-gauge-wrap">
        <div class="dinet-gauge ${colorClass}" style="--gauge-pct:${safePct};">
          <div class="dinet-gauge-base"></div>
          <div class="dinet-gauge-value"></div>
          <div class="dinet-gauge-center">
            <strong>${safePct}%</strong>
            <span>${escapeHtml(sub)}</span>
          </div>
        </div>
      </div>
    </article>
  `;
}

function announceRampChanges() {
  if (!state.voiceEnabled || !('speechSynthesis' in window)) return;

  const nextMap = new Map();
  const announcements = [];
  for (const item of deriveRampItems()) {
    const plate = firstValue(item.visit?.vehiculos)?.placa ?? '';
    nextMap.set(item.id, `${item.visualState}|${plate}`);

    const previous = state.previousRampStates.get(item.id);
    const current = nextMap.get(item.id);
    if (!previous || previous === current) continue;

    if (item.visualState === 'occupied' && plate) {
      announcements.push(`Rampa ${item.code} ocupada por la placa ${plate}`);
    } else if (item.visualState === 'reserved' && plate) {
      announcements.push(`Rampa ${item.code} reservada para la placa ${plate}`);
    } else if (item.visualState === 'free') {
      announcements.push(`Rampa ${item.code} liberada`);
    }
  }

  state.previousRampStates = nextMap;
  if (!announcements.length) return;

  const utterance = new SpeechSynthesisUtterance(announcements[0]);
  utterance.lang = 'es-PE';
  utterance.rate = 1;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

async function refreshLiveData({ initial = false } = {}) {
  state.loading = true;
  render();
  try {
    if (initial && !state.ramps.length) {
      await fetchRamps();
    }
    await Promise.all([
      fetchLiveVisits(),
      fetchImportRowsOptional(),
    ]);
    syncEmbeddedDinetDashboard();
    announceRampChanges();
  } catch (error) {
    setMessage('error', error.message || 'No se pudo cargar el visor.');
  } finally {
    state.loading = false;
    render();
  }
}

function stopPolling() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

function startPolling() {
  stopPolling();
  state.pollTimer = window.setInterval(() => {
    refreshLiveData();
  }, DEFAULT_POLL_MS);
}

function stopKioskRotation() {
  if (state.kioskTimer) {
    clearInterval(state.kioskTimer);
    state.kioskTimer = null;
  }
}

function startKioskRotation() {
  stopKioskRotation();
  if (state.activeView !== 'kiosk') return;
  state.kioskTimer = window.setInterval(() => {
    if (state.kioskPaused) return;
    const sequence = getAllowedViews().filter((view) => view !== 'kiosk');
    if (!sequence.length) return;
    const current = sequence.indexOf(state.kioskCurrentSubview ?? sequence[0]);
    const nextIndex = current >= 0 ? (current + 1) % sequence.length : 0;
    state.kioskCurrentSubview = sequence[nextIndex];
    render();
  }, KIOSK_ROTATION_MS);
}

function getCurrentViewForRender() {
  if (state.activeView !== 'kiosk') return state.activeView;
  const sequence = getAllowedViews().filter((view) => view !== 'kiosk');
  if (!sequence.length) return 'resumen';
  if (!sequence.includes(state.kioskCurrentSubview)) {
    state.kioskCurrentSubview = sequence[0];
  }
  return state.kioskCurrentSubview;
}

function renderMessage() {
  if (!state.message) return '';
  return `<div class="message ${state.message.type}">${escapeHtml(state.message.text)}</div>`;
}

function renderLogin() {
  app.innerHTML = `
    <div class="login-shell">
      <div class="login-card">
        <div class="login-brand">
          <div class="brand-badge"><span class="material-symbols-outlined">tv</span></div>
          <div>
            <h1>${APP_NAME}</h1>
            <p>Visor separado, solo lectura y orientado a monitor.</p>
          </div>
        </div>
        ${renderMessage()}
        <form id="login-form">
          <div class="field">
            <label for="username">Usuario</label>
            <input id="username" placeholder="Supervisor o Lider" autocomplete="username" />
          </div>
          <div class="field">
            <label for="password">Contraseña</label>
            <input id="password" type="password" placeholder="********" autocomplete="current-password" />
          </div>
          <button class="btn btn-primary" ${state.loading ? 'disabled' : ''}>
            <span class="material-symbols-outlined">${state.loading ? 'progress_activity' : 'login'}</span>
            <span>${state.loading ? 'Ingresando...' : 'Entrar al visor'}</span>
          </button>
        </form>
      </div>
    </div>
  `;

  document.getElementById('login-form')?.addEventListener('submit', handleLogin);
}

function renderRampasView() {
  const items = deriveRampItems();
  const summary = getSummary();

  return `
    <section class="view-panel rampas-panel">
      <div class="hero">
        <div>
          <p class="eyebrow">RAMPAS + VOZ</p>
          <h2>Cluster A&E - Bloque A</h2>
          <span>Visor de ocupación en tiempo real con anuncios por cambio de estado.</span>
        </div>
        <div class="hero-metrics">
          <article class="metric"><span>Ocupadas</span><strong>${summary.ocupadas}</strong></article>
          <article class="metric"><span>Reservadas</span><strong>${summary.reservadas}</strong></article>
          <article class="metric"><span>Libres</span><strong>${summary.libres}</strong></article>
        </div>
      </div>
      <div class="ramp-board">
        <div class="ramp-grid">
          ${items.length ? items.map((item) => {
            const plate = firstValue(item.visit?.vehiculos)?.placa ?? getVisualStateLabel(item.visualState);
            const eta = item.visit ? `Registro: ${formatTime(item.visit.hora_registro || item.visit.created_at)}` : 'Disponible para nueva asignación';
            const company = firstValue(item.visit?.empresas_transporte)?.nombre ?? 'Unilever';
            return `
              <article class="ramp-card ${item.visualState}">
                <div class="ramp-card-top">
                  <span class="ramp-code">${item.code.replace(/^A-/, '')}</span>
                  <span class="material-symbols-outlined truck">local_shipping</span>
                </div>
                <div class="ramp-plate">${escapeHtml(plate)}</div>
                <div class="ramp-meta">${escapeHtml(company)}</div>
                <div class="ramp-meta">${escapeHtml(eta)}</div>
                <div class="ramp-state state-${item.visualState}">${getVisualStateLabel(item.visualState)}</div>
              </article>
            `;
          }).join('') : '<div class="empty">No hay rampas cargadas para el bloque A.</div>'}
        </div>
      </div>
    </section>
  `;
}

function renderResumenView() {
  const summary = getSummary();
  return `
    <section class="view-panel resumen-panel">
      <div class="hero">
        <div>
          <p class="eyebrow">RESUMEN OPERATIVO</p>
          <h2>Panorama ejecutivo del patio Unilever</h2>
          <span>Indicadores compactos para seguimiento rápido de operación, facturación y rampas.</span>
        </div>
      </div>
      <div class="grid-cards">
        <article class="summary-card"><p class="label">Total rampas</p><strong>${summary.totalRamps}</strong><p class="sub">Bloque A visible</p></article>
        <article class="summary-card"><p class="label">Unidades activas</p><strong>${summary.activas}</strong><p class="sub">Aún dentro del flujo</p></article>
        <article class="summary-card"><p class="label">Facturación</p><strong>${summary.facturacion}</strong><p class="sub">En trámite documental</p></article>
        <article class="summary-card"><p class="label">En proceso</p><strong>${summary.enProceso}</strong><p class="sub">Sin llegada a rampa confirmada</p></article>
      </div>
      <div class="list-grid">
        <article class="info-card">
          <div class="toolbar-row">
            <div>
              <p class="eyebrow">Distribución</p>
              <h2>Estado de rampas</h2>
            </div>
          </div>
          <table class="data-table">
            <thead>
              <tr><th>Estado</th><th>Total</th><th>Detalle</th></tr>
            </thead>
            <tbody>
              <tr><td><span class="status-dot dot-free"></span>Libres</td><td class="strong">${summary.libres}</td><td class="muted">Disponibles para nueva asignación</td></tr>
              <tr><td><span class="status-dot dot-reserved"></span>Reservadas</td><td class="strong">${summary.reservadas}</td><td class="muted">Con rampa asignada</td></tr>
              <tr><td><span class="status-dot dot-occupied"></span>Ocupadas</td><td class="strong">${summary.ocupadas}</td><td class="muted">Con unidad posicionada</td></tr>
              <tr><td><span class="status-dot dot-process"></span>En proceso</td><td class="strong">${summary.enProceso}</td><td class="muted">En flujo previo a ocupación</td></tr>
            </tbody>
          </table>
        </article>
        <article class="info-card">
          <p class="eyebrow">Operación</p>
          <h2>Mix actual</h2>
          <div class="stack-list" style="margin-top: 1rem;">
            <article class="stage-card"><h3>Carga</h3><p>Salidas activas</p><strong>${summary.carga}</strong></article>
            <article class="stage-card"><h3>Descarga / Devolución</h3><p>Ingresos y devoluciones activas</p><strong>${summary.descarga}</strong></article>
          </div>
        </article>
      </div>
    </section>
  `;
}

function renderDashboardView() {
  const rows = getDashboardRows();
  const stages = getStageMetrics();
  return `
    <section class="view-panel">
      <div class="hero">
        <div>
          <p class="eyebrow">DASHBOARD WEB</p>
          <h2>Dashboard ejecutivo inicial</h2>
          <span>Base visual separada para evolucionar luego al tablero tipo DINET con cruces por Excel.</span>
        </div>
      </div>
      <div class="list-grid">
        <article class="info-card">
          <p class="eyebrow">Últimas unidades</p>
          <h2>Flujo operativo activo</h2>
          ${rows.length ? `
            <table class="data-table" style="margin-top: 1rem;">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Placa</th>
                  <th>Operación</th>
                  <th>Rampa</th>
                  <th>Tiempo</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map((row) => `
                  <tr>
                    <td class="mono">${escapeHtml(row.codigo)}</td>
                    <td class="strong">${escapeHtml(row.placa)}</td>
                    <td>${escapeHtml(row.tipo)}</td>
                    <td>${escapeHtml(row.rampa)}</td>
                    <td>${escapeHtml(row.tiempo)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : '<div class="empty">No hay unidades activas para mostrar.</div>'}
        </article>
        <article class="info-card">
          <p class="eyebrow">Etapas</p>
          <h2>Mapa del flujo</h2>
          <div class="stack-list" style="margin-top: 1rem;">
            ${stages.map((item) => `
              <article class="stage-card">
                <h3>${escapeHtml(item.title)}</h3>
                <p>${escapeHtml(item.note)}</p>
                <strong>${item.value}</strong>
              </article>
            `).join('')}
          </div>
        </article>
      </div>
    </section>
  `;
}

function renderDashboardWebDinet() {
  const rows = getDashboardRowsDinet();
  const metrics = getDinetMetrics(rows);

  return `
    <section class="view-panel">
      <div class="dinet-panel">
        <div class="dinet-head">
          <div class="dinet-brand">
            <p class="dinet-overline">Unilever</p>
            <div class="dinet-title-row">
              <span class="dinet-mark material-symbols-outlined">space_dashboard</span>
              <div>
                <h2>DINET · Estatus Picking / Despachos Unilever</h2>
                <span>Replica visual del dashboard DINET usando la misma operacion de la app.</span>
              </div>
            </div>
          </div>
          <div class="dinet-head-side">
            <span class="chip"><span class="material-symbols-outlined">database</span><strong>${escapeHtml(metrics.sourceLabel)}</strong></span>
            <span class="chip"><span class="material-symbols-outlined">sync</span><strong>${escapeHtml(formatDateTime(state.lastSyncAt))}</strong></span>
          </div>
        </div>

        <div class="dinet-grid">
          ${renderGauge({
            pct: metrics.pickingPct,
            colorClass: 'green',
            title: 'Picking',
            sub: `${formatNumber(metrics.pickingCj)} / ${formatNumber(metrics.totalCj)} cjs`,
          })}

          <article class="dinet-card dinet-summary-card">
            <div class="dinet-card-eyebrow">Resumen operativo</div>
            <div class="dinet-summary-table">
              ${metrics.summary.map((item) => `
                <div class="dinet-summary-row ${item.tone}">
                  <span>${escapeHtml(item.label)}</span>
                  <strong>${escapeHtml(item.value)}</strong>
                  <small>${escapeHtml(item.helper)}</small>
                </div>
              `).join('')}
            </div>
            <div class="dinet-shifts">
              ${metrics.turnos.length ? metrics.turnos.map((turno) => `
                <div class="dinet-shift-row">
                  <div class="dinet-shift-head">
                    <span>${escapeHtml(turno.name)}</span>
                    <b>${escapeHtml(turno.stat)}</b>
                  </div>
                  <div class="dinet-shift-bar">
                    <div style="width:${Math.max(turno.pct, 4)}%;">${turno.pct}%</div>
                  </div>
                </div>
              `).join('') : '<div class="dinet-empty-inline">Sin datos de turnos</div>'}
            </div>
          </article>

          ${renderGauge({
            pct: metrics.despachoPct,
            colorClass: 'blue',
            title: 'Despacho',
            sub: `${formatNumber(metrics.despachoCj)} cjs cerradas`,
          })}
        </div>

        <article class="dinet-detail">
          <div class="dinet-detail-head">
            <div>
              <p class="dinet-card-eyebrow">Detalle DTs</p>
              <h3>Operacion activa</h3>
            </div>
            <div class="dinet-status-tabs">
              ${metrics.statusTabs.map((tab) => `
                <span class="dinet-status-tab tone-${tab.tone}">
                  <span class="dinet-status-dot"></span>
                  ${escapeHtml(tab.label)} ${tab.count}
                </span>
              `).join('')}
            </div>
          </div>
          ${rows.length ? `
            <div class="dinet-table-wrap">
              <table class="dinet-table">
                <thead>
                  <tr>
                    <th># DT</th>
                    <th>Transporte</th>
                    <th>Cliente</th>
                    <th>Destino</th>
                    <th>Ton</th>
                    <th>m3</th>
                    <th>Pedido</th>
                    <th>Avance</th>
                    <th>Placa</th>
                    <th>% Avance</th>
                    <th>Rampa</th>
                    <th>Estado carga</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows.map((row) => `
                    <tr>
                      <td class="mono">${escapeHtml(row.dt)}</td>
                      <td>${escapeHtml(row.transporte)}</td>
                      <td>${escapeHtml(row.cliente)}</td>
                      <td>${escapeHtml(row.destino)}</td>
                      <td>${row.ton ? escapeHtml(formatNumber(row.ton, 1)) : '--'}</td>
                      <td>${row.m3 ? escapeHtml(formatNumber(row.m3, 1)) : '--'}</td>
                      <td>${row.pedido ? escapeHtml(formatNumber(row.pedido)) : '--'}</td>
                      <td>${row.avance ? escapeHtml(formatNumber(row.avance)) : '--'}</td>
                      <td class="strong">${escapeHtml(row.placa)}</td>
                      <td class="dinet-pct-cell">
                        <div class="dinet-pct-bar">
                          <div style="width:${Math.max(row.progressPct, 3)}%;"></div>
                        </div>
                        <span>${Math.round(row.progressPct)}%</span>
                      </td>
                      <td>${escapeHtml(row.rampa)}</td>
                      <td><span class="dinet-estado-pill estado-${normalizeText(row.estadoCarga).replace(/\s+/g, '-')}">${escapeHtml(row.estadoCarga)}</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : `
            <div class="empty">No hay registros disponibles todavia para el dashboard web.</div>
          `}
        </article>
      </div>
    </section>
  `;
}

function renderDashboardWebExactDinet() {
  syncEmbeddedDinetDashboard();

  return `
    <section class="view-panel dinet-embed-panel">
      <div class="dashboard-frame-shell">
        <iframe
          id="dinet-dashboard-frame"
          class="dashboard-frame"
          src="./dashboard-web/DINET%20Dashboard.html"
          title="Dashboard Web DINET"
          loading="eager"
        ></iframe>
      </div>
    </section>
  `;
}

function renderCurrentView() {
  const current = getCurrentViewForRender();
  if (current === 'rampas-voz') return renderRampasView();
  if (current === 'resumen') return renderResumenView();
  if (current === 'dashboard-web') return renderDashboardWebExactDinet();
  return renderDashboardView();
}

function renderDashboardFocusShell({ allowedViews, currentView }) {
  return `
    <div class="monitor-shell dashboard-focus-shell">
      <button class="focus-toggle-btn" data-action="toggle-sidebar" aria-label="Abrir panel del monitor">
        <span class="material-symbols-outlined">${state.sidebarOpen ? 'close' : 'menu'}</span>
      </button>

      <aside class="focus-sidebar ${state.sidebarOpen ? 'open' : ''}">
        <div class="focus-sidebar-head">
          <div class="topbar-brand">
            <p>Monitor · ${config.CLIENTE_NOMBRE}</p>
            <h1>${APP_NAME}</h1>
            <span>${VIEW_DEFS[currentView]?.subtitle ?? ''}</span>
          </div>
          <button class="focus-close-btn" data-action="toggle-sidebar" aria-label="Cerrar panel">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <div class="focus-sidebar-body">
          <div class="focus-sidebar-block">
            <span class="chip"><span class="material-symbols-outlined">person</span><strong>${escapeHtml(getCurrentUserLabel())}</strong></span>
            <span class="chip"><span class="material-symbols-outlined">sync</span><strong>${escapeHtml(formatDateTime(state.lastSyncAt))}</strong></span>
          </div>

          <div class="focus-sidebar-block focus-sidebar-actions">
            <button class="btn btn-secondary" data-action="toggle-voice">
              <span class="material-symbols-outlined">${state.voiceEnabled ? 'volume_up' : 'volume_off'}</span>
              <span>${state.voiceEnabled ? 'Voz activa' : 'Voz desactivada'}</span>
            </button>
            ${allowedViews.includes('kiosk') ? `
              <button class="btn btn-ghost" data-action="toggle-kiosk-pause">
                <span class="material-symbols-outlined">${state.kioskPaused ? 'play_arrow' : 'pause'}</span>
                <span>${state.kioskPaused ? 'Reanudar' : 'Pausar'}</span>
              </button>
            ` : ''}
            <button class="btn btn-ghost" data-action="refresh">
              <span class="material-symbols-outlined ${state.loading ? 'spinner' : ''}">${state.loading ? 'progress_activity' : 'refresh'}</span>
              <span>Actualizar</span>
            </button>
            <button class="btn btn-ghost" data-action="logout">
              <span class="material-symbols-outlined">logout</span>
              <span>Salir</span>
            </button>
          </div>

          <nav class="focus-sidebar-nav">
            ${allowedViews.map((viewKey) => `
              <button class="focus-nav-btn ${state.activeView === viewKey ? 'active' : ''}" data-action="view" data-view="${viewKey}">
                <span class="material-symbols-outlined">${VIEW_DEFS[viewKey].icon}</span>
                <span>${VIEW_DEFS[viewKey].label}</span>
              </button>
            `).join('')}
          </nav>
        </div>
      </aside>

      <div class="focus-backdrop ${state.sidebarOpen ? 'open' : ''}" data-action="close-sidebar"></div>

      ${renderMessage()}
      ${renderCurrentView()}
    </div>
  `;
}

function renderShell() {
  const allowedViews = getAllowedViews();
  const currentView = getCurrentViewForRender();
  const isDashboardFocus = currentView === 'dashboard-web';

  if (isDashboardFocus) {
    app.innerHTML = renderDashboardFocusShell({ allowedViews, currentView });
    bindUiEvents();
    return;
  }

  app.innerHTML = `
    <div class="monitor-shell">
      <header class="topbar">
        <div class="topbar-brand">
          <p>Monitor · ${config.CLIENTE_NOMBRE}</p>
          <h1>${APP_NAME}</h1>
          <span>${VIEW_DEFS[currentView]?.subtitle ?? ''}</span>
        </div>
        <div class="topbar-actions">
          <span class="chip"><span class="material-symbols-outlined">person</span><strong>${escapeHtml(getCurrentUserLabel())}</strong></span>
          <span class="chip"><span class="material-symbols-outlined">sync</span><strong>${escapeHtml(formatDateTime(state.lastSyncAt))}</strong></span>
          <button class="btn btn-secondary" data-action="toggle-voice">
            <span class="material-symbols-outlined">${state.voiceEnabled ? 'volume_up' : 'volume_off'}</span>
            <span>${state.voiceEnabled ? 'Voz activa' : 'Voz desactivada'}</span>
          </button>
          ${allowedViews.includes('kiosk') ? `
            <button class="btn btn-ghost" data-action="toggle-kiosk-pause">
              <span class="material-symbols-outlined">${state.kioskPaused ? 'play_arrow' : 'pause'}</span>
              <span>${state.kioskPaused ? 'Reanudar' : 'Pausar'}</span>
            </button>
          ` : ''}
          <button class="btn btn-ghost" data-action="refresh">
            <span class="material-symbols-outlined ${state.loading ? 'spinner' : ''}">${state.loading ? 'progress_activity' : 'refresh'}</span>
            <span>Actualizar</span>
          </button>
          <button class="btn btn-ghost" data-action="logout">
            <span class="material-symbols-outlined">logout</span>
            <span>Salir</span>
          </button>
        </div>
      </header>

      <nav class="view-tabs">
        ${allowedViews.map((viewKey) => `
          <button class="tab-btn ${state.activeView === viewKey ? 'active' : ''}" data-action="view" data-view="${viewKey}">
            <span class="material-symbols-outlined">${VIEW_DEFS[viewKey].icon}</span>
            <span>${VIEW_DEFS[viewKey].label}</span>
          </button>
        `).join('')}
      </nav>

      ${renderMessage()}
      ${renderCurrentView()}
    </div>
  `;

  bindUiEvents();
}

function renderUnifiedShell() {
  const allowedViews = getAllowedViews();
  const currentView = getCurrentViewForRender();

  app.innerHTML = renderDashboardFocusShell({ allowedViews, currentView });
  bindUiEvents();
}

function render() {
  if (!state.session || !state.profile) {
    renderLogin();
    return;
  }
  renderUnifiedShell();
}

async function handleLogin(event) {
  event.preventDefault();
  const username = document.getElementById('username')?.value?.trim();
  const password = document.getElementById('password')?.value ?? '';

  if (!username || !password) {
    setMessage('error', 'Ingresa usuario y contraseña.');
    return;
  }

  state.loading = true;
  render();
  try {
    const email = buildInternalEmailFromUsername(username);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  } catch (error) {
    state.loading = false;
    setMessage('error', error.message || 'No se pudo iniciar sesión.');
  }
}

async function handleLogout() {
  stopPolling();
  stopKioskRotation();
  window.speechSynthesis?.cancel();
  await supabase.auth.signOut();
  state.profile = null;
  state.roleKey = null;
  state.visits = [];
  state.ramps = [];
  state.importRows = [];
  state.importRowsAvailable = false;
  state.sidebarOpen = false;
  state.previousRampStates = new Map();
  state.bootedUserId = null;
  state.kioskCurrentSubview = null;
  render();
}

function bindUiEvents() {
  document.querySelectorAll('[data-action="view"]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeView = button.dataset.view;
      state.sidebarOpen = false;
      window.location.hash = `#/${state.activeView}`;
      startKioskRotation();
      render();
    });
  });

  document.querySelectorAll('[data-action="toggle-sidebar"]').forEach((button) => {
    button.addEventListener('click', () => {
      state.sidebarOpen = !state.sidebarOpen;
      render();
    });
  });

  document.querySelector('[data-action="close-sidebar"]')?.addEventListener('click', () => {
    state.sidebarOpen = false;
    render();
  });

  document.querySelector('[data-action="refresh"]')?.addEventListener('click', async () => {
    await refreshLiveData();
  });

  document.querySelector('[data-action="logout"]')?.addEventListener('click', async () => {
    await handleLogout();
  });

  document.querySelector('[data-action="toggle-voice"]')?.addEventListener('click', () => {
    state.voiceEnabled = !state.voiceEnabled;
    if (!state.voiceEnabled) window.speechSynthesis?.cancel();
    render();
  });

  document.querySelector('[data-action="toggle-kiosk-pause"]')?.addEventListener('click', () => {
    state.kioskPaused = !state.kioskPaused;
    render();
  });
}

async function bootstrapAuthenticatedApp(user) {
  if (state.bootedUserId === user.id) return;
  state.bootedUserId = user.id;
  try {
    await fetchProfile(user.id);
    syncViewWithHash();
    await refreshLiveData({ initial: true });
    startPolling();
    startKioskRotation();
  } catch (error) {
    state.bootedUserId = null;
    throw error;
  }
}

window.addEventListener('hashchange', () => {
  if (!state.profile) return;
  state.sidebarOpen = false;
  syncViewWithHash();
  startKioskRotation();
  render();
});

window.addEventListener('message', (event) => {
  if (event?.data?.type !== 'dinet-monitor-overrides-updated') return;
  syncEmbeddedDinetDashboard();
});

supabase.auth.onAuthStateChange((_event, session) => {
  state.session = session;

  if (!session?.user) {
    stopPolling();
    stopKioskRotation();
    state.profile = null;
    state.roleKey = null;
    state.visits = [];
    state.importRows = [];
    state.importRowsAvailable = false;
    state.sidebarOpen = false;
    state.loading = false;
    state.bootedUserId = null;
    render();
    return;
  }

  if (state.bootedUserId === session.user.id) {
    state.loading = false;
    render();
    return;
  }

  state.loading = true;
  render();
  bootstrapAuthenticatedApp(session.user)
    .then(() => {
      state.loading = false;
      render();
    })
    .catch(async (error) => {
      await supabase.auth.signOut();
      state.loading = false;
      setMessage('error', error.message || 'No se pudo cargar el perfil del visor.');
    });
});

render();
