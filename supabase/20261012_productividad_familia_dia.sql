create table if not exists public.productividad_familia_dia (
  anio smallint not null,
  dia date not null,
  turno text not null,
  familia text not null,
  cajas_sueltas numeric(14,2) not null default 0,
  cajas numeric(14,2) not null default 0,
  actualizado_en timestamptz not null default now(),
  primary key (anio, dia, turno, familia)
);

create index if not exists productividad_familia_dia_dia_idx
  on public.productividad_familia_dia (dia desc);

alter table public.productividad_familia_dia enable row level security;

drop policy if exists "productividad familia lectura autenticada" on public.productividad_familia_dia;
create policy "productividad familia lectura autenticada"
  on public.productividad_familia_dia for select
  to authenticated using (true);
