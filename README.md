# CRM Pay Line

Comercial tool for Libertario Coffee Roasters. The interface is in Spanish: committees, the Pay Line pipeline, salesperson KPIs, comodatos, client timelines, and copyable email drafts.

This release runs on Cloudflare Workers with D1. Mail sending, Google Sheets writes, and the Odoo agent ingest stay off. The Odoo adapter still throws and does not call the network. Sheets sync stays a dry-run unless `SHEETS_SYNC_ENABLED=true`.

## Local

Node `22.14.0` or newer (`engines` and `.nvmrc`).

```bash
npm install
cp .env.example .env.local
```

Set in `.env.local` (do not commit it):

- `SESSION_SECRET` — at least 16 characters
- `BOOTSTRAP_ADMIN_PASSWORD` — at least 12 characters

```bash
npm test
npm run dev
```

Open [http://127.0.0.1:4317](http://127.0.0.1:4317). The first request creates `data/crm.sqlite` and seeds it from `data/imports/`. Sign in as `lidertransformacion@libertariocoffee.com` with `BOOTSTRAP_ADMIN_PASSWORD`, then change that password on `/cuenta`.

`npm run dev:worker` starts the Vite/Workers dev server on the same port and uses D1 local state when Wrangler is configured. `npm run build` is the Cloudflare build (`vite build`).

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js on port 4317, local SQLite |
| `npm run dev:worker` | Workers dev server on port 4317 |
| `npm test` | Vitest |
| `npm run build` | Production bundle for Cloudflare Workers |
| `npm run import:odoo` | Reimport the three Odoo `.xlsx` files and reapply local lead edits |

## Authentication

Every page and API route requires a signed `crm_session` cookie. Public routes are only `/login` and `POST /api/auth/login`.

- Roles are `admin` and `user`.
- Only an admin can create users, and only for emails that end exactly in `@libertariocoffee.com` (one `@`, no subdomain, case-insensitive).
- The first admin is always `lidertransformacion@libertariocoffee.com`. It is inserted on boot when `BOOTSTRAP_ADMIN_PASSWORD` is set, with `must_change_password`. There is no password in the repo.
- Until that password is changed, other pages redirect to `/cuenta` and other APIs return 403.

## Cloudflare deploy

Do not put secret values in the repo or in `wrangler.jsonc` `vars`.

1. Create the database and paste the printed `database_id` into `wrangler.jsonc` (`d1_databases[0].database_id`). The committed id is a placeholder.

```bash
npx wrangler d1 create crm-pay-line
```

2. Apply the schema. The app also creates tables on the first request. The migration is the same SQL.

```bash
npx wrangler d1 migrations apply crm-pay-line --remote
```

3. Set secrets. Wrangler prompts for the value; nothing is written to the repo.

```bash
npx wrangler secret put SESSION_SECRET
npx wrangler secret put BOOTSTRAP_ADMIN_PASSWORD
```

4. Build, then deploy when you are ready. This repository does not deploy itself.

```bash
npm run build
npx wrangler deploy
```

The first request after deploy seeds D1 from the bundled `data/imports` snapshot (leads, activities, teams, equipment, suppliers) and creates the bootstrap admin.

### Secrets and vars

| Name | Kind | Required for this release | Notes |
| --- | --- | --- | --- |
| `SESSION_SECRET` | secret | yes | HMAC cookie key, minimum 16 characters |
| `BOOTSTRAP_ADMIN_PASSWORD` | secret | yes | Initial password for `lidertransformacion@libertariocoffee.com`, minimum 12 characters |
| `MAIL_MODE` | var | no | Committed as `log`. Sending is a follow-up |
| `MAIL_FROM_ADDRESS` | var | no | `lidertransformacion@libertariocoffee.com` |
| `MAIL_FROM_NAME` | var | no | `Comercial Libertario` |
| `SHEETS_SYNC_ENABLED` | var | no | Committed as `false`. Dry-run only |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | var | no | Public sheet id already in the docs |
| `GOOGLE_SHEETS_TAB` | var | no | `Listado Equipos` |
| `BOOTSTRAP_ADMIN_EMAIL` | var | no | Documented only. The address is fixed in code |
| `GOOGLE_SHEETS_CLIENT_EMAIL` | secret | later | Not used while sync is off |
| `GOOGLE_SHEETS_PRIVATE_KEY` | secret | later | Not used while sync is off |
| `GMAIL_TOKEN_JSON` | secret | later | Gmail API, follow-up |
| `ODOO_AGENT_TOKEN` | secret | later | Ingest token, follow-up |
| `CRM_DB_PATH` | local env | no | SQLite path for `next dev` only |

Binding: D1 database `crm-pay-line` as `DB`.

## What is on screen

- **Comités** — Comité Out of Stores. History, filters, and a copyable summary.
- **Pay Line** — Kanban of the Odoo lead export. Cards with no expected revenue say “Sin ingreso”.
- **KPIs** — Open, won, and lost follow Odoo `active` and won/lost status, not the stage alone. On the 15 Oct 2026 export: 169 open, 182 won, 309 lost, 39 recurrente.
- **Comodatos** — 224 machines. **Ver diff** shows the sheet plan and writes nothing.
- **Clientes** — Timeline of opportunities, activities, committee items, and comodatos.
- **Correos** — Spanish drafts you copy. There is no send button in this release.
- **Ajustes** — Admins create users.
- **Cuenta** — Password change.

Rules and the sheet adapter are in [docs/process.md](docs/process.md).

## Follow-up

Not in this deploy: email outbox (log / Gmail API), two-way Sheets sync, stable equipment ids, and the authenticated Odoo ingest/outbound queue. Those modules are present and unused, or still throw, so they do not run.
