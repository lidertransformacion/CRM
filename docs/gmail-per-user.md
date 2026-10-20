# Per-user Gmail

Each signed-in user (`@libertariocoffee.com` only) can connect their own Gmail account. The CRM then sends that user's queued mail with the Gmail API as that account. A user with no connection still uses the shared mailbox (`GMAIL_TOKEN_JSON`) when `MAIL_MODE=gmail_api`.

The Google OAuth client is an internal web client. The registered redirect URI is:

`https://crm-libertario.libertario.workers.dev/api/auth/google/callback`

The send scope is `https://www.googleapis.com/auth/gmail.send`. The authorize request also asks for `openid` and `email`, only so the callback can prove the Google account is the same address as the CRM user. The send call is still `users.messages.send`. It does not read the mailbox.

## Secrets

Set these on the Worker `crm-libertario`. Do not commit values.

| Secret | Status | Value |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | Already set | OAuth web client id |
| `GOOGLE_CLIENT_SECRET` | Already set | OAuth web client secret |
| `TOKEN_ENC_KEY` | Required before anyone connects | AES-GCM key for refresh tokens. Generate with `openssl rand -base64 32`. Any other string of at least 16 characters is hashed with SHA-256 and used as the key. |
| `MAIL_TEST_MODE` | Optional | Unset means test mode. Set the secret to `false` to deliver to the real recipient. |

`GOOGLE_REDIRECT_URI` is optional. When it is empty, the redirect URI is the request origin plus `/api/auth/google/callback`.

```bash
openssl rand -base64 32
npx wrangler secret put TOKEN_ENC_KEY
```

Rotating `TOKEN_ENC_KEY` makes stored refresh tokens unreadable. Users connect again. Disconnect still deletes a row it cannot decrypt.

`npx wrangler deploy` replaces plain vars from `wrangler.jsonc` and does not delete secrets. Keep `MAIL_TEST_MODE` and `TOKEN_ENC_KEY` as secrets so a later deploy does not drop them.

## Database

Migration file: `migrations/0002_gmail_tokens.sql`.

```bash
npx wrangler d1 migrations apply crm-pay-line --remote
```

The table is `gmail_tokens`:

| Column | Meaning |
| --- | --- |
| `user_id` | CRM user. Unique. |
| `google_email` | Account that granted access. Must equal the CRM user's email. |
| `refresh_token` | AES-GCM ciphertext (`v1.` plus base64 of the 12-byte IV and the ciphertext). Not the raw token. |
| `connected_at` | ISO timestamp of the last successful connect. |
| `status` | `connected` or `disconnected`. |

There is no `d1_migrations` history on the live database today. Wrangler may also offer `0001_init.sql`. That file uses `CREATE TABLE IF NOT EXISTS` and is safe to apply.

The app schema version is `4`. The first request after deploy adds `email_outbox.sender_user_id` so a queued message remembers who sent it. That column is not in the migration file, so applying the migration after the Worker has already booted does not fail on a duplicate column.

## Connect and disconnect

1. `GET /api/auth/google` requires a session. It redirects to Google with `access_type=offline`, `prompt=consent`, `hd=libertariocoffee.com`, `login_hint` set to the user's email, and a random HMAC-signed `state`. The same state is stored in the `crm_google_state` cookie (HttpOnly, SameSite=Lax, 10 minutes).
2. `GET /api/auth/google/callback` checks that the query state matches the cookie and the signature, exchanges the code, and reads the Google account email from the ID token (`tokeninfo`). The email must be verified, must be `@libertariocoffee.com`, and must equal the signed-in user. The refresh token is encrypted and stored. The browser returns to `/cuenta`.
3. A mismatched Google account is revoked and not stored.
4. `POST /api/auth/google/disconnect` revokes the refresh token and deletes the row.

`/cuenta` shows **Conectar Gmail**, the connected or disconnected state, and the connected address. The interface text is Spanish.

## Sending

`deliverMail` looks up `gmail_tokens` for `email_outbox.sender_user_id`.

- Status `connected`: refresh an access token with `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and the decrypted refresh token, then `POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send`. The body is RFC 2822. Non-ASCII subjects use UTF-8 Base64 encoded-words (`=?UTF-8?B?...?=`). The body is `multipart/alternative` with a plain part and an HTML part.
- No connected row: the existing path runs. `MAIL_MODE=gmail_api` uses `GMAIL_TOKEN_JSON`. `log` only records the message. `smtp` is Node-only.
- `invalid_grant` sets that row's status to `disconnected` and the same attempt falls back to the shared mailbox.

## Test mode

Test mode is the default. `MAIL_TEST_MODE` unset, empty, or any value other than `false`, `0`, `off`, or `live` keeps it on.

In test mode the Gmail API is still called, but the recipient is the sender (the connected Gmail address, or `MAIL_FROM_ADDRESS` for the shared mailbox). The subject is prefixed with `[PRUEBA]`. The original customer address is only in the body. Customers do not receive the message.

Santiago turns real delivery on with:

```bash
npx wrangler secret put MAIL_TEST_MODE
# value: false
```

`MAIL_MODE=log` still does not call Gmail, in test mode or not.
