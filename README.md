# Visor Monitor Unilever

Proyecto visual separado y de solo lectura para pantallas tipo monitor, TV o kiosko.

## Objetivo

- mantener separada la operacion del DMS principal
- reutilizar la misma Supabase
- consumir poco en Cloudflare y Supabase
- ofrecer vistas dedicadas por usuario y por tipo de pantalla

## Vistas incluidas en esta fase

- `#/rampas-voz`
- `#/resumen`
- `#/dashboard-web`
- `#/kiosk`

## Accesos iniciales

- `Admin`: todas las vistas
- `Supervisor Unilever`: todas las vistas
- `Lider`: `rampas-voz`, `resumen`, `kiosk`

El archivo `app.js` ya incluye una matriz para futuros usuarios dedicados como:

- `MonitorRampas`
- `MonitorResumen`
- `MonitorDashboard`
- `MonitorKiosk`

## Consumo y estrategia

- frontend estático puro
- polling controlado cada `20s`
- sin realtime en esta primera fase
- solo lectura
- consultas pequeñas y limitadas

## Probar local

```powershell
cd "C:\Users\ctrlreckcc\Desktop\erik proyectos\dms-unilever-visor-monitor"
python -m http.server 4174
```

Abrir:

`http://localhost:4174`

## Deploy

Se puede desplegar como proyecto estático nuevo en la misma cuenta de Cloudflare.
