# Arquitectura del Visor Monitor

Fecha: 14 de agosto de 2026.

## Decisión

Se usa:

- misma `Supabase`
- nuevo `frontend estático`
- misma cuenta de `Cloudflare`

No se crea otra Supabase en esta fase para evitar:

- duplicidad de datos
- sincronización extra
- más mantenimiento
- más costo operativo

## Seguridad

- login con Supabase Auth existente
- acceso visual limitado por `rol` y, si se necesita, por `username`
- solo lectura
- sin acciones operativas

## Consumo

- sin realtime al inicio
- polling cada `20s`
- rampas estáticas cargadas una vez por sesión
- visitas activas limitadas a consultas livianas

## Fases siguientes

1. crear usuarios dedicados monitor
2. conectar la futura data de Excel importada
3. enriquecer `dashboard-web` con cruces por DT/embarque
4. evaluar voz más dirigida por eventos
