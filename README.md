# CRM Pay Line

Local tool for the Comercial team at Libertario Coffee Roasters. The interface is in Spanish. It runs on your machine: committees, the Pay Line pipeline, salesperson KPIs, comodatos, client timelines, and copyable email drafts.

Nothing here sends mail, calls Odoo, or writes to Google Sheets.

## Run

```bash
npm install
npm test
npm run dev
```

Open [http://127.0.0.1:4317](http://127.0.0.1:4317). The first request creates `data/crm.sqlite` and seeds it from `data/imports/`.

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js on port 4317 |
| `npm test` | Vitest |
| `npm run import:odoo` | Reimport the three Odoo `.xlsx` files and reapply local lead edits |
| `npm start` | Production server on port 4317, after `npm run build` |

`npm run import:odoo -- path/leads.xlsx path/activities.xlsx path/teams.xlsx` uses other files. The defaults live in `data/imports/`.

## What is on screen

- **Comités** — Comité Out of Stores, seeded from the 14 Oct 2026 acta. History, person filters, age badges, and a copyable summary email.
- **Pay Line** — Kanban of the Odoo lead export. Stage changes stay in SQLite.
- **KPIs** — Open, won, lost, win rate, expected revenue, overdue activities, and stage age, from that export. Targets start empty.
- **Comodatos** — 224 machines from Listado Equipos. Create and edit from the side form. Each serial has a life sheet, a QR code, and a maintenance form. **Ver diff** shows the Google Sheet plan and writes nothing.
- **Clientes** — Timeline of opportunities, activities, committee items, and comodatos.
- **Correos** — Spanish drafts you copy. There is no send button.

Rules, counts, and the sheet adapter are in [docs/process.md](docs/process.md).

## Sheets sync

Sync is off unless `SHEETS_SYNC_ENABLED=true`. Credentials are environment variables only. Copy `.env.example` to `.env.local` when you are ready to turn it on later. Do not put secrets in the repo. The live sheet is not a default target in code.

## Data

`data/crm.sqlite` is gitignored. Delete it to reseed. Committee and equipment edits live only in that file.
