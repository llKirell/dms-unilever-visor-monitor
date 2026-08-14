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

- frontend estatico puro
- polling controlado cada `20s`
- sin realtime en esta primera fase
- solo lectura
- consultas pequenas y limitadas

## Verlo local

```powershell
cd "C:\Users\ctrlreckcc\Desktop\erik proyectos\dms-unilever-visor-monitor"
python -m http.server 4174
```

Abrir en el navegador:

`http://localhost:4174`

## Verlo en linea

El repo ya incluye workflow de `GitHub Pages`.

URL esperada:

`https://llKirell.github.io/dms-unilever-visor-monitor/`

Notas:

- la primera publicacion depende de que GitHub Actions termine correctamente
- si GitHub Pages pide activacion, en el repo entra a `Settings > Pages` y deja `Build and deployment` con `GitHub Actions`
- las vistas usan `hash routes`, por ejemplo:
  - `https://llKirell.github.io/dms-unilever-visor-monitor/#/rampas-voz`
  - `https://llKirell.github.io/dms-unilever-visor-monitor/#/dashboard-web`
