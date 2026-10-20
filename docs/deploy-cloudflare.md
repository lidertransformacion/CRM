# Deploy from main with Workers Builds

Production updates come from a push to `main`. Cloudflare Workers Builds runs the build in its own environment and deploys Worker `crm-libertario`. The Git integration creates and stores the API token in the Cloudflare dashboard. Do not add a GitHub Actions workflow, and do not put `CLOUDFLARE_API_TOKEN` in the repository or in GitHub secrets.

The Worker name in the dashboard must be `crm-libertario`. That is the `name` in `wrangler.jsonc`. A different name makes the build fail.

## Dashboard settings

Open the Worker **crm-libertario**, then **Settings** → **Builds** → **Connect**, and choose the GitHub repository `lidertransformacion/CRM`.

| Field | Value |
| --- | --- |
| Production branch | `main` |
| Root directory | `/` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| API token | The token Cloudflare creates for this Worker |
| Preview builds | Off |

Leave the root directory as `/` (the repository root). The project is not a monorepo.

Leave **Preview builds** off. A push to a branch other than `main` must not publish this Worker.

Workers Builds installs dependencies from `package-lock.json` before the build command. Do not set `SKIP_DEPENDENCY_INSTALL`.

The build image defaults to Node.js 24. This repository's `.nvmrc` is `22.14.0`, and Workers Builds uses that file, so the build runs on Node 22. Do not set `NODE_VERSION` unless you intend to override `.nvmrc`.

## What the commands do

`npm run build` runs `vite build` and writes the Worker and assets under `dist/`. `npx wrangler deploy` publishes that build. It uses the Wrangler version in `package.json`.

`npx wrangler deploy` replaces plain vars with the `vars` block in `wrangler.jsonc`. It does not delete secrets. Keep runtime secrets in **Settings** → **Variables and Secrets**, not in the file.

## Config that ships in the repo

| Setting | Value |
| --- | --- |
| Worker name | `crm-libertario` |
| D1 binding | `DB` |
| D1 database name | `crm-pay-line` |
| D1 database id | `ded1c012-2e0a-4b1b-9339-24047b32a99e` |
| `MAIL_MODE` | `gmail_api` |
| `SHEETS_SYNC_ENABLED` | `false` |
| Cron | `*/5 * * * *` |

These plain vars are also committed: `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME`, `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SHEETS_TAB`, and `BOOTSTRAP_ADMIN_EMAIL`.

The committed `MAIL_MODE` is `gmail_api`, so the cron and each request drain the outbox through the Gmail API. The sender calls `users/me/messages/send` only. That needs the `gmail.send` scope. It does not call `users/me/profile`. Setting the var back to `log` leaves mail queued and skips the drain.

## Secrets to set

Set these in the Worker **crm-libertario**, **Settings** → **Variables and Secrets**. They are not in `wrangler.jsonc` or Git.

Sending and per-user Gmail use these secrets. `MAIL_MODE` is already the plain var `gmail_api`:

| Secret | Required when | Value |
| --- | --- | --- |
| `GMAIL_TOKEN_JSON` | Sending mail when the user has no connected Gmail (`MAIL_MODE=gmail_api`) | JSON with `client_id`, `client_secret`, and `refresh_token`. Fallback sender. The From address is the var `MAIL_FROM_ADDRESS` (`lidertransformacion@libertariocoffee.com`) and the display name is the var `MAIL_FROM_NAME` (`Comercial Libertario`). |
| `GOOGLE_CLIENT_ID` | Per-user Gmail connect | OAuth web client id. Already set. |
| `GOOGLE_CLIENT_SECRET` | Per-user Gmail connect | OAuth web client secret. Already set. |
| `TOKEN_ENC_KEY` | Per-user Gmail connect | AES-GCM key. `openssl rand -base64 32`. Not committed. Required before **Conectar Gmail** works. |
| `MAIL_TEST_MODE` | Leave unset until real delivery | Unset keeps test mode (the customer is not the recipient). Set the secret to `false` to send to the queued address. |

With `MAIL_MODE=gmail_api`, `POST /api/correos/outbox/process` sends due rows through the Gmail API. A failed attempt is requeued with backoff (1 minute, 5 minutes, 15 minutes, 1 hour) and marked failed after 5 attempts. The cron `*/5 * * * *` drains the outbox, and each request also schedules a drain with `waitUntil` after the response. `MAIL_MODE=log` does neither.

These secrets are already required for sign-in. Rotating `BOOTSTRAP_ADMIN_PASSWORD` does not change an admin that already exists.

| Secret | Required when | Value |
| --- | --- | --- |
| `SESSION_SECRET` | Always | HMAC key for the session cookie, at least 16 characters |
| `BOOTSTRAP_ADMIN_PASSWORD` | First boot, if the admin user is missing | Initial password, at least 12 characters |

Set these only when the matching feature is turned on:

| Secret | Required when | Value |
| --- | --- | --- |
| `GOOGLE_SHEETS_CLIENT_EMAIL` | `SHEETS_SYNC_ENABLED=true` | Service account email |
| `GOOGLE_SHEETS_PRIVATE_KEY` | `SHEETS_SYNC_ENABLED=true` | PKCS8 private key |
| `ODOO_AGENT_TOKEN` | The browser agent calls `/api/agent/*` | Bearer token, at least 16 characters |

Set or rotate one with `npx wrangler secret put <NAME>` from a trusted machine. The command prompts for the value.

Per-user Gmail also needs the D1 migration `migrations/0002_gmail_tokens.sql` on `crm-pay-line` before connect is used. Visits and removing a team member need `migrations/0003_users_soft_delete.sql` and `migrations/0004_visits.sql`. The exact statements and the optional `VISIT_PHOTOS` R2 binding are in [visits.md](visits.md). There is no new secret. `MAIL_TEST_MODE` stays as it is.

```bash
npx wrangler d1 migrations apply crm-pay-line --remote
```

Setup, the OAuth redirect, test mode, and `TOKEN_ENC_KEY` are in [gmail-per-user.md](gmail-per-user.md).

## Check a build without publishing

From a clean checkout on Node 22:

```bash
npm ci
npm test
npm run build
npx wrangler deploy --dry-run
```

`--dry-run` bundles the Worker and does not upload it.
