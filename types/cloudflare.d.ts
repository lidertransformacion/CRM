declare module "cloudflare:workers" {
  export const env: {
    DB?: D1Database;
    /** Mail attachments, inline images, and visit photos under visits/. Bucket crm-libertario-mail. */
    MAIL_FILES?: MailObjectBucket;
    APP_KV?: KVNamespace;
    /** Private contract PDFs. Bucket `crm-legal-files`. Create it before deploy. */
    LEGAL_FILES?: LegalObjectBucket;
    /** OAuth web client id. Worker secret. Never commit a value. */
    GOOGLE_CLIENT_ID?: string;
    /** OAuth web client secret. Worker secret. Never commit a value. */
    GOOGLE_CLIENT_SECRET?: string;
    /**
     * AES-GCM key for gmail_tokens.refresh_token.
     * Prefer 32 bytes, base64-encoded (`openssl rand -base64 32`). Any other
     * string of at least 16 characters is hashed with SHA-256. Worker secret.
     */
    TOKEN_ENC_KEY?: string;
    /** Optional exact redirect URI. Defaults to the request origin + /api/auth/google/callback. */
    GOOGLE_REDIRECT_URI?: string;
    /**
     * Email safety switch. Unset or any value other than "false" keeps test mode:
     * mail is not delivered to the customer. Set the secret to "false" to send for real.
     */
    MAIL_TEST_MODE?: string;
  } & Record<string, unknown>;
}

interface D1Result<T = Record<string, unknown>> {
  results?: T[];
  meta?: { changes?: number; last_row_id?: number; rows_read?: number; rows_written?: number };
}

interface D1Prepared {
  bind(...values: unknown[]): D1Prepared;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

interface D1Database {
  prepare(sql: string): D1Prepared;
  batch(statements: D1Prepared[]): Promise<D1Result[]>;
  exec(sql: string): Promise<unknown>;
}

interface MailObjectBucket {
  put(key: string, value: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  delete(key: string): Promise<void>;
}

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

interface LegalObjectBucket {
  put(
    key: string,
    value: ArrayBuffer | Uint8Array | string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  get(key: string): Promise<LegalStoredObject | null>;
  delete(key: string): Promise<void>;
  list(options?: { limit?: number; cursor?: string; prefix?: string }): Promise<{
    objects: { key: string; size: number }[];
    truncated?: boolean;
    cursor?: string;
  }>;
}

interface LegalStoredObject {
  body: ReadableStream;
  size?: number;
  httpMetadata?: { contentType?: string };
  arrayBuffer(): Promise<ArrayBuffer>;
}
