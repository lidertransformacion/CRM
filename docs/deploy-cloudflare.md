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
| `MAIL_MODE` | `log` |
| `SHEETS_SYNC_ENABLED` | `false` |

These plain vars are also committed: `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME`, `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SHEETS_TAB`, and `BOOTSTRAP_ADMIN_EMAIL`.

These stay secrets. They are not in `wrangler.jsonc`, `.env.example` values, or Git:

- `SESSION_SECRET`
- `BOOTSTRAP_ADMIN_PASSWORD`
- `GMAIL_TOKEN_JSON`
- `GOOGLE_SHEETS_CLIENT_EMAIL`
- `GOOGLE_SHEETS_PRIVATE_KEY`
- `ODOO_AGENT_TOKEN`

Set or rotate one with `npx wrangler secret put <NAME>` from a trusted machine. The command prompts for the value.

## Check a build without publishing

From a clean checkout on Node 22:

```bash
npm ci
npm test
npm run build
npx wrangler deploy --dry-run
```

`--dry-run` bundles the Worker and does not upload it.
