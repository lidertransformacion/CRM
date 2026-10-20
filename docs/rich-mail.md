# Rich mail

Templates, the Correos draft, and the committee summary use the same editor: bold, italic, underline, lists, links, headings, text color, tables, and inline images. Compose screens can also attach images, PDF, DOCX, and XLSX.

The interface is Spanish. HTML is sanitized on the server before it is stored or sent. `MAIL_TEST_MODE` is unchanged and stays on unless the secret is exactly `false`, `0`, `off`, or `live`. In test mode the Gmail call still goes to the sending account, with the original recipients only in the body. Attachments travel with that test message.

## Apply the SQL

Database: D1 `crm-pay-line`, binding `DB`.

```bash
npx wrangler d1 migrations apply crm-pay-line --remote
```

`migrations/0006_rich_mail.sql`:

```sql
ALTER TABLE email_outbox ADD COLUMN attachment_ids TEXT;

CREATE TABLE IF NOT EXISTS mail_files (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  r2_key TEXT,
  data_base64 TEXT,
  content_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS mail_files_user ON mail_files(user_id);
```

The Worker also creates these objects on boot (schema version 6). `CREATE TABLE IF NOT EXISTS` can run twice. The `ALTER TABLE` fails if `attachment_ids` is already present. If that happens, run only the `CREATE` statements.

`attachment_ids` is a JSON array of `mail_files.id`. Inline images are also discovered from `src="/api/mail/files/<id>"` in the HTML.

## R2 binding

`wrangler.jsonc` binds `MAIL_FILES` to the bucket `crm-libertario-mail`. Create the bucket before deploying, or the Worker deploy fails:

```bash
npx wrangler r2 bucket create crm-libertario-mail
```

```jsonc
"r2_buckets": [
  { "binding": "MAIL_FILES", "bucket_name": "crm-libertario-mail" }
]
```

Objects are stored at `mail/<user id>/<file id>`. No new secret.

If the binding is missing at runtime (local tests), a file of at most 400 KB is stored in `mail_files.data_base64`. Larger files are rejected until R2 is bound. Do not put multi-megabyte files in D1.

## Size

The raw total of inline images plus attachments is capped at 20 MB so the base64 MIME message stays under Gmail's limit of about 25 MB.

## MIME

`rfc822` builds:

- `text/plain` when there is no HTML
- `multipart/alternative` for HTML without files
- `multipart/related` when the HTML references inline images (`Content-ID`, `cid:`)
- `multipart/mixed` when there is at least one attachment

The same bytes go out through the sender's connected Gmail and through the shared mailbox fallback.
