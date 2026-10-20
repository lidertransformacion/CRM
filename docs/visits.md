# Visits

Hospitality field visits live in the CRM at `/visitas`. The flow matches the single-file report the team already uses on phones: visit data, calibration with tolerances, sensory scores, equipment checklist, technical service, four-level training, outcome, action plan, next visit, photos, signatures, a client PDF, the commercial's email, a WhatsApp `LIBV1.` code, CSV export, and a weekly coverage board.

The interface is Spanish. This note is the operator guide for the database and for photos.

## Apply the SQL

Database: D1 `crm-pay-line` (`ded1c012-2e0a-4b1b-9339-24047b32a99e`), binding `DB`.

From a trusted machine, after this branch is on `main` or from a checkout of it:

```bash
npx wrangler d1 migrations apply crm-pay-line --remote
```

That runs, in order:

1. `migrations/0003_users_soft_delete.sql`
2. `migrations/0004_visits.sql`

The Worker also creates the same tables and the two user columns on boot (`lib/schema.ts`, schema version 5). `CREATE TABLE IF NOT EXISTS` is safe to run twice. The two `ALTER TABLE` statements fail if `active` and `deleted_at` are already present. If the migration stops on that error, run only `migrations/0004_visits.sql` in the D1 console.

### 0003 — users

```sql
ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN deleted_at TEXT;

CREATE TABLE IF NOT EXISTS user_events (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  actor_user_id INTEGER,
  action TEXT NOT NULL,
  target_user_id INTEGER,
  detail TEXT
);
```

### 0004 — visits

```sql
CREATE TABLE IF NOT EXISTS visit_points (
  id TEXT PRIMARY KEY,
  legal_name TEXT NOT NULL,
  trade_name TEXT NOT NULL,
  point_name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  locality TEXT,
  zone TEXT,
  visit_frequency TEXT,
  commercial TEXT,
  visit_barista TEXT,
  training_frequency TEXT,
  training_barista TEXT,
  lead_import_key TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS visits (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  point_id TEXT,
  fecha TEXT,
  cliente TEXT,
  sede TEXT,
  resultado_final TEXT,
  created_by INTEGER,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS visit_photos (
  id INTEGER PRIMARY KEY,
  visit_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  tag TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  r2_key TEXT,
  data_url TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS visit_points_trade ON visit_points(trade_name);
CREATE INDEX IF NOT EXISTS visits_fecha ON visits(fecha);
CREATE INDEX IF NOT EXISTS visits_point ON visits(point_id);
CREATE INDEX IF NOT EXISTS visit_photos_visit ON visit_photos(visit_id);
```

## Seed

The 71 client points are in `lib/visits/points-seed.ts` (trade name, legal name, point, address, city, frequency, commercial, training frequency). The first request to `/visitas` inserts any missing point. It does not overwrite a point that already exists. A lead is linked when `leads.customer` or `leads.name` matches the trade name or the legal name.

Manual run against the local SQLite file:

```bash
npm run seed:visits
```

There is no remote seed command. Opening Visitas on the Worker after the migration inserts the catalog.

## Photos

Each photo is compressed in the browser (JPEG, longest edge 720px, at most 4). Signatures are JPEG data URLs from the canvas.

Storage:

- If the Worker env has an R2 binding named `VISIT_PHOTOS`, the object is stored under `visits/<visit id>/<kind>-<index>.jpg` and `visit_photos.r2_key` is set. `data_url` stays null.
- Otherwise the data URL is stored in `visit_photos.data_url`. That is the path this release uses. A single value must stay under 200,000 characters so the D1 row stays small. The app rejects anything larger.

The binding is **not** in `wrangler.jsonc`. Adding it before the bucket exists would make the production deploy fail. To turn R2 on later, create the bucket and add the binding, then redeploy:

```bash
npx wrangler r2 bucket create crm-libertario-visits
```

```jsonc
"r2_buckets": [
  { "binding": "VISIT_PHOTOS", "bucket_name": "crm-libertario-visits" }
]
```

No new secret is required for visits. Mail keeps using the existing outbox.

## Mail

**Encolar envío** on a report calls `enqueueEmail` with the signed-in user as `sender_user_id`. `MAIL_TEST_MODE` is unchanged and stays on unless the secret is exactly `false`, `0`, `off`, or `live`. In test mode the customer is not the recipient. The screen says so before the button is used.

Copying the email or the WhatsApp text does not send anything. The WhatsApp text includes a `LIBV1.` code (deflate-raw, base64url, photos removed, signatures reduced to a flag) so a visit already stored on a phone can be pasted into **Pegar registro LIBV1**.

## Removing a person

`DELETE /api/users/:id` is admin-only. It sets `users.active = 0` and `users.deleted_at`, increments `session_version` so existing cookies stop working, and deletes that user's `gmail_tokens` row. It refuses the signed-in admin and the last active admin. Ajustes asks for confirmation before calling it. Inactive users disappear from the list and cannot sign in.
