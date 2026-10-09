create table if not exists public.productividad_persona_dia (
  anio smallint not null,
  dia date not null,
  usuario text not null,
  cargo text,
  turno text,
  horas numeric(12,3) not null default 0,
  tareas integer not null default 0,
  cajas numeric(14,2) not null default 0,
  cajas_sueltas numeric(14,2) not null default 0,
  pallets numeric(14,2) not null default 0,
  unidades_productivas numeric(14,2) not null default 0,
  volumen_m3 numeric(14,3) not null default 0,
  peso_tn numeric(14,3) not null default 0,
  ubicaciones numeric(14,2) not null default 0,
  detalle numeric(14,2) not null default 0,
  t_std_min numeric(14,2) not null default 0,
  t_real_min numeric(14,2) not null default 0,
  efic numeric(12,2) not null default 0,
  actualizado_en timestamptz not null default now(),
  primary key (anio, dia, usuario)
);

create index if not exists productividad_persona_dia_dia_idx
  on public.productividad_persona_dia (dia desc);

create table if not exists public.productividad_snapshots (
  snapshot_key text primary key,
  anio smallint not null,
  rango_inicio date,
  rango_fin date,
  tareas_total integer,
  tareas_elegibles integer,
  tareas_excepcion integer,
  personas integer,
  dias integer,
  horas_totales numeric(14,2),
  meta jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists productividad_snapshots_anio_idx
  on public.productividad_snapshots (anio, actualizado_en desc);

alter table public.productividad_persona_dia enable row level security;
alter table public.productividad_snapshots enable row level security;

drop policy if exists "productividad lectura autenticada" on public.productividad_persona_dia;
create policy "productividad lectura autenticada"
  on public.productividad_persona_dia for select
  to authenticated using (true);

drop policy if exists "productividad snapshots lectura autenticada" on public.productividad_snapshots;
create policy "productividad snapshots lectura autenticada"
  on public.productividad_snapshots for select
  to authenticated using (true);
