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

Open [http://127.0.0.1:4317](http://127.0.0.1:4317). The first request creates `data/crm.sqlite` and advances one seed batch. Run `npm run seed` to finish the snapshot. Sign in as `lidertransformacion@libertariocoffee.com` with `BOOTSTRAP_ADMIN_PASSWORD`, then change that password on `/cuenta`.

`npm run dev:worker` starts the Vite/Workers dev server on the same port and uses D1 local state when Wrangler is configured. `npm run build` is the Cloudflare build (`vite build`).

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js on port 4317, local SQLite |
| `npm run dev:worker` | Workers dev server on port 4317 |
| `npm test` | Vitest |
| `npm run build` | Production bundle for Cloudflare Workers |
| `npm run import:odoo` | Reimport the three Odoo `.xlsx` files and reapply local lead edits |
| `npm run reset-password -- email 'temporary'` | One-off recovery: set a temporary password with `must_change_password` |

## Authentication

Every page and API route requires a signed `crm_session` cookie. Public routes are only `/login` and `POST /api/auth/login`.

- Each user has one role: `admin`, `comercial`, `legal`, or `gerencia`. The previous role `user` is read and stored as `comercial`.
- Only an admin can create users and chooses that role. Emails must end exactly in `@libertariocoffee.com` (one `@`, no subdomain, case-insensitive).
- Everyone can read contracts. Legal and admin manage the in-CRM file folders. Comercial uploads PDFs for their own deals and equipment. Gerencia has a placeholder dashboard at `/gerencia`. Signing is not built yet; each contract stores an ordered signer list that can include the external client.
- The first admin is always `lidertransformacion@libertariocoffee.com`. It is inserted on boot when `BOOTSTRAP_ADMIN_PASSWORD` is set, with `must_change_password`. There is no password in the repo.
- Changing `BOOTSTRAP_ADMIN_PASSWORD` after that user exists does not rotate the password.
- An admin can set a temporary password from Ajustes, or `POST /api/users/reset` with `{ "email", "password" }`. The account must change it on `/cuenta`, and its previous sessions stop working.
- An admin can remove someone from the team in Ajustes. `DELETE /api/users/:id` deactivates that user, ends their sessions, and deletes their `gmail_tokens` row. It refuses the signed-in admin and the last active admin.
- Until that password is changed, other pages redirect to `/cuenta` and other APIs return 403.
- Each request reads secrets from the Workers env binding. A value left on `process.env` does not hide a newer binding. Setup runs one seed batch and the bootstrap check on every request, not once per isolate.

## Cloudflare deploy

Production deploys from `main` through Cloudflare Workers Builds. The dashboard Git integration creates its own API token. This repository has no GitHub Actions workflow and no Cloudflare token. The exact dashboard fields are in [docs/deploy-cloudflare.md](docs/deploy-cloudflare.md).

The Worker name is `crm-libertario`. The D1 binding `DB` is the existing database `crm-pay-line` (`ded1c012-2e0a-4b1b-9339-24047b32a99e`). Contract PDFs use the R2 binding `LEGAL_FILES` (bucket `crm-legal-files`, already created). Mail attachments and visit photos use the R2 binding `MAIL_FILES` (bucket `crm-libertario-mail`, already created). Visit photos are objects under the `visits/` prefix. Both buckets share one 10 GB cap. D1 keeps the counter in `storage_usage`. Uploads that would pass 10 GB are rejected. An admin can rebuild the counter from an R2 listing at `/ajustes/almacen`.

`MAIL_MODE` is `gmail_api` and `SHEETS_SYNC_ENABLED` is `false`. Secrets stay out of `wrangler.jsonc`. There is no new secret for contracts or the quota. `MAIL_TEST_MODE` is unchanged.

Set a secret from a trusted machine. Wrangler prompts for the value.

```bash
npx wrangler secret put SESSION_SECRET
npx wrangler secret put BOOTSTRAP_ADMIN_PASSWORD
```

The first request after deploy advances a single D1 batch and creates the bootstrap admin. Later requests keep advancing one batch until the snapshot is complete; the Worker does not remember a finished setup promise. Finish it as an admin by repeating `POST /api/admin/seed` until the JSON `complete` field is true, or run `npm run seed` against a local database. Each call is idempotent. A partial equipment load inserts the missing serials and leaves existing leads in place. The bundled snapshot has 699 leads, 72 activities, 32 teams, and 224 equipment. A bad `BOOTSTRAP_ADMIN_PASSWORD` returns only "No se pudo preparar el acceso inicial."

If nobody can sign in, recover without editing SQL. The command sets a temporary password, forces a change on `/cuenta`, and revokes existing sessions. It does not print the password. Point `CRM_DB_PATH` at the database file when it is not `data/crm.sqlite`.

```bash
npm run reset-password -- lidertransformacion@libertariocoffee.com 'temporary-password'
```

On the live Worker, a signed-in admin uses Ajustes or `POST /api/users/reset` instead. Rotating the `BOOTSTRAP_ADMIN_PASSWORD` secret does not change an admin that already exists.

### Secrets and vars

| Name | Kind | Required for this release | Notes |
| --- | --- | --- | --- |
| `SESSION_SECRET` | secret | yes | HMAC cookie key, minimum 16 characters |
| `BOOTSTRAP_ADMIN_PASSWORD` | secret | yes | Initial password for `lidertransformacion@libertariocoffee.com`, minimum 12 characters |
| `MAIL_MODE` | var | no | Committed as `gmail_api`. `log` only queues |
| `MAIL_FROM_ADDRESS` | var | no | `lidertransformacion@libertariocoffee.com` |
| `MAIL_FROM_NAME` | var | no | `Comercial Libertario` |
| `SHEETS_SYNC_ENABLED` | var | no | Committed as `false`. Dry-run only until `true` |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | var | no | `1mrb-s2PbDOEvNwdAs2zMyT7czMxx1tqcYGuwk4FQks4` |
| `GOOGLE_SHEETS_TAB` | var | no | `Listado Equipos` |
| `BOOTSTRAP_ADMIN_EMAIL` | var | no | Documented only. The address is fixed in code |
| `GOOGLE_SHEETS_CLIENT_EMAIL` | secret | when sync is on | Service account. PKCS8 private key |
| `GOOGLE_SHEETS_PRIVATE_KEY` | secret | when sync is on | Not used while sync is off |
| `GMAIL_TOKEN_JSON` | secret | when mail is `gmail_api` | Fallback sender when the user has no connected Gmail. JSON: `client_id`, `client_secret`, `refresh_token` |
| `GOOGLE_CLIENT_ID` | secret | to connect Gmail | OAuth web client id. Already set on the Worker |
| `GOOGLE_CLIENT_SECRET` | secret | to connect Gmail | OAuth web client secret. Already set on the Worker |
| `TOKEN_ENC_KEY` | secret | to connect Gmail | AES-GCM key for refresh tokens. `openssl rand -base64 32`. Do not commit a value |
| `MAIL_TEST_MODE` | secret | no | Unset keeps test mode: customers are not mailed. Set to `false` to deliver to the real recipient |
| `ODOO_AGENT_TOKEN` | secret | for the browser agent | Bearer token, minimum 16 characters |
| `CRM_DB_PATH` | local env | no | SQLite path for `next dev` only |

Binding: D1 database `crm-pay-line` as `DB`.

## What is on screen

- **Comités** — Comité Out of Stores. History, filters, and a summary you can send or copy. See [docs/committee-mail.md](docs/committee-mail.md).
- **Pay Line** — Kanban of the Odoo lead export. Cards with no expected revenue say “Sin ingreso”.
- **KPIs** — Open, won, and lost follow Odoo `active` and won/lost status, not the stage alone. On the 15 Oct 2026 export: 169 open, 182 won, 309 lost, 39 recurrente.
- **Comodatos** — 224 machines. **Ver diff** plans against the bundled CSV while sync is off. **Traer de la hoja** and **Enviar cambios** write only when `SHEETS_SYNC_ENABLED=true`. The sheet is the source on pull. Rows are matched by serial and never deleted.
- **Clientes** — Timeline of opportunities, activities, committee items, and comodatos.
- **Correos** — Spanish drafts with a rich editor, inline images, and attachments. **Procesar bandeja** follows `MAIL_MODE`. A user with Gmail connected on **Cuenta** sends as that account. Otherwise production `gmail_api` uses the shared mailbox. Test mode (the default) does not deliver to the customer. `log` leaves the message queued. See [docs/rich-mail.md](docs/rich-mail.md).
- **Visitas** — Hospitality visit reports, weekly coverage, PDF, and `LIBV1.` import. See [docs/visits.md](docs/visits.md).
- **Contratos** — In-CRM folders and contract records linked to deals and equipment.
- **Gerencia** — Placeholder dashboard for admin and gerencia.
- **Ajustes** — Admins create users, choose a role, and can remove someone from the team. Storage usage is on **Almacen**.
- **Cuenta** — Password change and **Conectar Gmail**.

Rules and the sheet adapter are in [docs/process.md](docs/process.md).

## Mail, Sheets, and the Odoo agent

These routes are in the app. They stay quiet until the matching secret is set. Nothing in this repository calls the Odoo API.

| Route | Auth | What it does |
| --- | --- | --- |
| `GET` / `POST /api/correos/outbox` | session | List or enqueue a message |
| `POST /api/correos/outbox/process` | session | Drain the queue with `MAIL_MODE` |
| `POST /api/correos/outbox/:id` | session | Requeue a failed message |
| `POST /api/comodatos/sync` | session | `{ "direction": "pull" }` or `"push"`. Refuses to write while sync is off |
| `POST /api/agent/ingest` | `Authorization: Bearer` | Snapshot batch. `mode` is `full` or `incremental`. `snapshotId` defers archive until commit. `dryRun` does not write |
| `POST /api/agent/ingest/commit` | bearer | `{ "snapshotId" }` archives leads missing from that snapshot |
| `GET /api/agent/outbound` | bearer | Pending creates and updates |
| `POST /api/agent/outbound/:id` | bearer | `{ "odooId" }` or `{ "error" }` |

`GMAIL_TOKEN_JSON` is `{"client_id","client_secret","refresh_token"}`. Per-user Gmail is documented in [docs/gmail-per-user.md](docs/gmail-per-user.md). The live sheet id is `1mrb-s2PbDOEvNwdAs2zMyT7czMxx1tqcYGuwk4FQks4`, tab `Listado Equipos`. The service-account key must be PKCS8 (`BEGIN PRIVATE KEY`). `OdooSyncAdapter` still throws and does not fetch.
