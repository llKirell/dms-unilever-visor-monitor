# Histórico de productividad en Supabase

La productividad se guarda en la misma Supabase del visor. El pipeline conserva
el `dash_data.json` público como respaldo de funcionamiento y, adicionalmente,
archiva el grano `persona x día` en la base.

## Instalación única

1. Abrir Supabase → `SQL Editor`.
2. Ejecutar `supabase/productividad.sql`.
3. En GitHub → `Settings` → `Secrets and variables` → `Actions`, crear:
   - `SUPABASE_URL`: URL del proyecto Supabase.
   - `SUPABASE_SERVICE_ROLE_KEY`: service role key del proyecto.
4. No exponer `SUPABASE_SERVICE_ROLE_KEY` en el frontend ni en archivos del repositorio.

El workflow `Refresh Productividad` publicará en cada corrida las filas de
`productividad_persona_dia` y actualizará el snapshot del período en
`productividad_snapshots`.

## Retención por año

El histórico no se borra automáticamente. Para eliminar un año de forma
explícita, ejecutar localmente con los secretos definidos en la sesión:

```powershell
python productividad_pipeline/publish_productividad_supabase.py --delete-year 2025
```

El comando elimina únicamente las filas y snapshots cuyo `anio` sea `2025`.
