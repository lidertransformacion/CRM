# CRM Comercial · Libertario Coffee Roasters

Herramienta local del equipo Comercial. Corre en tu máquina, la interfaz está en español y los datos viven en un archivo SQLite. No envía correos, no llama a Odoo y no escribe en Google Sheets.

## Arrancar

```bash
npm install
npm test
npm run dev
```

Abre [http://127.0.0.1:4317](http://127.0.0.1:4317). La primera petición crea `data/crm.sqlite` y lo siembra desde `data/imports/`.

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Next.js en el puerto 4317 |
| `npm test` | Pruebas con Vitest |
| `npm run build` y `npm start` | Build y servidor de producción en el 4317 |
| `npm run lint` | ESLint |
| `npm run import:odoo` | Reimporta los tres `.xlsx` de Odoo y reaplica los cambios locales de etapa |

`npm run import:odoo -- ruta/leads.xlsx ruta/activities.xlsx ruta/teams.xlsx` usa otros archivos. Los de ejemplo están en `data/imports/`.

## Qué hay en pantalla

Menú lateral con siete secciones y un buscador global (`⌘K` / `Ctrl K`) que encuentra clientes, equipos y oportunidades desde cualquier pantalla.

- **Inicio** — Qué requiere atención hoy: pendientes vencidos y arrastrados, oportunidades con actividad vencida, equipos con garantía vencida o mantenimiento pendiente, y el estado del comité en curso. Cada indicador lleva a la lista filtrada.
- **Comités** — El acta viva del Comité Out of Stores: temas, puntos, decisiones y pendientes con responsable, fecha y antigüedad (cuántos comités lleva sin cerrarse). Vista por tema o por persona, comités anteriores en solo lectura, comparación entre actas, exportación CSV/JSON y correo resumen listo para copiar.
- **Pipeline (Pay Line)** — Tablero por etapa del export de Odoo, con vista de lista. Cada oportunidad se abre en un panel lateral con sus datos y actividades; la etapa se cambia arrastrando o desde el panel. Los cambios se guardan en SQLite, no en Odoo.
- **KPIs** — Resultados del equipo y de cada vendedor: abiertas, ganadas, perdidas, tasa de cierre, ingreso esperado y ponderado, actividades vencidas y antigüedad por etapa. Metas por vendedor, métrica y mes con progreso.
- **Equipos** — Los 224 equipos en tiendas y en comodato. Tabla completa con filtros, panel lateral para crear o editar, hoja de vida por serial con QR, historial y registro de mantenimientos. "Comparar con la hoja de Google" muestra qué celdas cambiarían y no escribe nada.
- **Clientes** — Línea de tiempo por cliente: oportunidades, actividades, pendientes de comité y equipos.
- **Correos** — Elige plantilla y oportunidad, revisa el borrador y cópialo. No hay botón de enviar.

Las reglas de negocio (arrastre, vencidos, códigos de tienda, garantías, costos) están en [docs/process.md](docs/process.md). La guía de diseño y el catálogo de componentes, en [docs/DESIGN.md](docs/DESIGN.md).

## Diseño

La interfaz usa la marca Libertario (navy `#182B55`, crema `#E8E4DE`, Poppins y Libre Baskerville), la misma de libertariocoffee.com y de las otras apps internas. Los tokens están en `app/globals.css`; las primitivas (botones, campos, tablas, paneles, avisos) en `components/ui`.

## Sincronización con Google Sheets

Apagada salvo que `SHEETS_SYNC_ENABLED=true`. Las credenciales van solo en variables de entorno: copia `.env.example` a `.env.local` cuando vayas a activarla. No pongas secretos en el repo. La hoja real no es un destino por defecto en el código.

## Datos

`data/crm.sqlite` está en `.gitignore`. Bórralo para volver a sembrar. Las ediciones de comités, equipos, metas y etapas viven solo en ese archivo.
