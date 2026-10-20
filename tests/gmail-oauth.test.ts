import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as startGoogle } from "@/app/api/auth/google/route";
import { GET as googleCallback } from "@/app/api/auth/google/callback/route";
import { POST as disconnectGoogle } from "@/app/api/auth/google/disconnect/route";
import { BOOTSTRAP_ADMIN_EMAIL } from "@/lib/auth/email";
import { SESSION_COOKIE, signSession } from "@/lib/auth/session";
import { openDatabase } from "@/lib/db";
import { decryptToken, encryptToken } from "@/lib/google/crypto";
import { connectGoogleAccount, GoogleConnectError, buildGoogleAuthorizeUrl, GOOGLE_OAUTH_SCOPE, GMAIL_SEND_SCOPE } from "@/lib/google/oauth";
import { GOOGLE_STATE_COOKIE, signGoogleState, verifyGoogleState } from "@/lib/google/state";
import { saveGmailConnection } from "@/lib/google/tokens";
import { deliverMail } from "@/lib/mail/deliver";
import { encodeSubject, rfc822 } from "@/lib/mail/message";
import { enqueueEmail, processOutbox } from "@/lib/mail/outbox";
import { resetSqlCache } from "@/lib/sql";
import { wrapDatabaseSync } from "@/lib/sql/node";

const SECRET = "test-session-secret-value";
const ENC_KEY = Buffer.alloc(32, 7).toString("base64");
const CLIENT_ID = "crm-client.apps.googleusercontent.com";
const CLIENT_SECRET = "crm-client-secret";
const USER_EMAIL = "ventas@libertariocoffee.com";

const created: string[] = [];

async function tempSql() {
  const file = path.join(os.tmpdir(), `crm-gmail-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
  created.push(file);
  const raw = await openDatabase(file);
  return { file, db: wrapDatabaseSync(raw) };
}

async function insertUser(db: Awaited<ReturnType<typeof tempSql>>["db"], email = USER_EMAIL) {
  const now = new Date().toISOString();
  const inserted = await db.run(
    `INSERT INTO users (email, password_hash, role, must_change_password, email_opt_out, session_version, created_at, updated_at)
     VALUES (?, 'x', 'user', 0, 0, 1, ?, ?)`,
    [email, now, now],
  );
  return inserted.lastInsertRowid;
}

function sessionRequest(url: string, token: string, extraCookie = ""): Request {
  const cookie = extraCookie ? `${SESSION_COOKIE}=${encodeURIComponent(token)}; ${extraCookie}` : `${SESSION_COOKIE}=${encodeURIComponent(token)}`;
  return new Request(url, { headers: { cookie } });
}

function decodeRaw(body: string): string {
  const json = JSON.parse(body) as { raw: string };
  return Buffer.from(json.raw, "base64url").toString("utf8");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetSqlCache();
  for (const file of created.splice(0)) fs.rmSync(file, { force: true });
});

describe("gmail token encryption", () => {
  it("round-trips a refresh token and does not store the plaintext", async () => {
    vi.stubEnv("TOKEN_ENC_KEY", ENC_KEY);
    const stored = await encryptToken("refresh-secret-value");
    expect(stored.startsWith("v1.")).toBe(true);
    expect(stored).not.toContain("refresh-secret-value");
    expect(await decryptToken(stored)).toBe("refresh-secret-value");
    vi.stubEnv("TOKEN_ENC_KEY", Buffer.alloc(32, 9).toString("base64"));
    await expect(decryptToken(stored)).rejects.toThrow(/no se puede leer/);
  });

  it("accepts a passphrase of at least 16 characters", async () => {
    vi.stubEnv("TOKEN_ENC_KEY", "test-token-key-value");
    const stored = await encryptToken("abc");
    expect(await decryptToken(stored)).toBe("abc");
    vi.stubEnv("TOKEN_ENC_KEY", "short");
    await expect(encryptToken("abc")).rejects.toThrow(/TOKEN_ENC_KEY/);
  });
});

describe("google oauth state", () => {
  it("signs a random state and rejects a tampered or expired value", async () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    const state = await signGoogleState({ uid: 4, email: USER_EMAIL });
    const again = await signGoogleState({ uid: 4, email: USER_EMAIL });
    expect(state).not.toBe(again);
    expect(await verifyGoogleState(state)).toMatchObject({ uid: 4, email: USER_EMAIL });
    expect(await verifyGoogleState(`${state}x`)).toBeNull();
    const future = Date.now() + 11 * 60 * 1000;
    vi.spyOn(Date, "now").mockReturnValue(future);
    expect(await verifyGoogleState(state)).toBeNull();
  });
});

describe("google authorize url", () => {
  it("asks for offline consent on the company domain and the send scope", () => {
    const url = new URL(
      buildGoogleAuthorizeUrl({
        clientId: CLIENT_ID,
        redirectUri: "https://crm-libertario.libertario.workers.dev/api/auth/google/callback",
        state: "signed-state",
        loginHint: USER_EMAIL,
      }),
    );
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("hd")).toBe("libertariocoffee.com");
    expect(url.searchParams.get("login_hint")).toBe(USER_EMAIL);
    expect(url.searchParams.get("state")).toBe("signed-state");
    expect(url.searchParams.get("scope")).toContain(GMAIL_SEND_SCOPE);
    expect(GOOGLE_OAUTH_SCOPE).toContain("openid");
    expect(url.searchParams.get("client_id")).toBe(CLIENT_ID);
    const source = fs.readFileSync(path.join(process.cwd(), "lib/google/oauth.ts"), "utf8");
    expect(source).not.toContain("apps.googleusercontent.com");
    expect(source).not.toContain(CLIENT_SECRET);
  });
});

describe("google callback", () => {
  it("stores an encrypted refresh token only when the Google account is the CRM user", async () => {
    vi.stubEnv("TOKEN_ENC_KEY", ENC_KEY);
    vi.stubEnv("GOOGLE_CLIENT_ID", CLIENT_ID);
    vi.stubEnv("GOOGLE_CLIENT_SECRET", CLIENT_SECRET);
    const { db } = await tempSql();
    const userId = await insertUser(db);
    const fetchImpl = vi.fn(async (url: string, init?: { body?: unknown }) => {
      void init;
      const target = String(url);
      if (target.includes("tokeninfo")) {
        return new Response(
          JSON.stringify({ email: USER_EMAIL, email_verified: true, aud: CLIENT_ID, hd: "libertariocoffee.com" }),
          { status: 200 },
        );
      }
      if (target.includes("oauth2.googleapis.com/token")) {
        return new Response(
          JSON.stringify({
            access_token: "access",
            refresh_token: "user-refresh",
            id_token: "id-token",
            scope: GOOGLE_OAUTH_SCOPE,
          }),
          { status: 200 },
        );
      }
      return new Response("revoked", { status: 200 });
    });
    const connected = await connectGoogleAccount(db, { uid: userId, email: USER_EMAIL }, "code", "https://crm.example/callback", fetchImpl as unknown as typeof fetch);
    expect(connected.googleEmail).toBe(USER_EMAIL);
    const row = await db.get<{ refresh_token: string; status: string }>("SELECT refresh_token, status FROM gmail_tokens WHERE user_id = ?", [userId]);
    expect(row?.status).toBe("connected");
    expect(row?.refresh_token).not.toContain("user-refresh");
    expect(await decryptToken(row?.refresh_token ?? "")).toBe("user-refresh");

    fetchImpl.mockImplementation(async (url: string) => {
      if (String(url).includes("tokeninfo")) {
        return new Response(JSON.stringify({ email: "otra@libertariocoffee.com", email_verified: true, aud: CLIENT_ID, hd: "libertariocoffee.com" }), { status: 200 });
      }
      if (String(url).includes("/token")) {
        return new Response(JSON.stringify({ access_token: "access", refresh_token: "other-refresh", id_token: "id", scope: GMAIL_SEND_SCOPE }), { status: 200 });
      }
      return new Response("revoked", { status: 200 });
    });
    await expect(
      connectGoogleAccount(db, { uid: userId, email: USER_EMAIL }, "code-2", "https://crm.example/callback", fetchImpl as unknown as typeof fetch),
    ).rejects.toBeInstanceOf(GoogleConnectError);
    const urls = fetchImpl.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes("/revoke"))).toBe(true);
    const still = await db.get<{ refresh_token: string }>("SELECT refresh_token FROM gmail_tokens WHERE user_id = ?", [userId]);
    expect(await decryptToken(still?.refresh_token ?? "")).toBe("user-refresh");
  });

  it("redirects to the profile and rejects a state cookie that does not match", async () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    vi.stubEnv("TOKEN_ENC_KEY", ENC_KEY);
    vi.stubEnv("GOOGLE_CLIENT_ID", CLIENT_ID);
    vi.stubEnv("GOOGLE_CLIENT_SECRET", CLIENT_SECRET);
    const { file, db } = await tempSql();
    const userId = await insertUser(db, BOOTSTRAP_ADMIN_EMAIL);
    vi.stubEnv("CRM_DB_PATH", file);
    resetSqlCache();
    const token = await signSession({ uid: userId, email: BOOTSTRAP_ADMIN_EMAIL, role: "admin", mustChangePassword: false, sv: 1 });
    const start = await startGoogle(sessionRequest("https://crm-libertario.libertario.workers.dev/api/auth/google", token));
    expect(start.status).toBe(307);
    const location = new URL(start.headers.get("location") || "");
    expect(location.searchParams.get("hd")).toBe("libertariocoffee.com");
    expect(location.searchParams.get("login_hint")).toBe(BOOTSTRAP_ADMIN_EMAIL);
    const setCookie = start.headers.get("set-cookie") || "";
    expect(setCookie).toContain(GOOGLE_STATE_COOKIE);
    const state = location.searchParams.get("state") || "";
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes("tokeninfo")) {
        return new Response(JSON.stringify({ email: BOOTSTRAP_ADMIN_EMAIL, email_verified: "true", aud: CLIENT_ID, hd: "libertariocoffee.com" }), { status: 200 });
      }
      return new Response(JSON.stringify({ access_token: "access", refresh_token: "fresh", id_token: "id", scope: GMAIL_SEND_SCOPE }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchImpl);
    const mismatch = await googleCallback(
      sessionRequest(`https://crm-libertario.libertario.workers.dev/api/auth/google/callback?code=abc&state=${encodeURIComponent(state)}`, token, `${GOOGLE_STATE_COOKIE}=different`),
    );
    expect(new URL(mismatch.headers.get("location") || "").searchParams.get("motivo")).toBe("state");
    expect(await db.get("SELECT user_id FROM gmail_tokens")).toBeUndefined();

    const ok = await googleCallback(
      sessionRequest(
        `https://crm-libertario.libertario.workers.dev/api/auth/google/callback?code=abc&state=${encodeURIComponent(state)}`,
        token,
        `${GOOGLE_STATE_COOKIE}=${encodeURIComponent(state)}`,
      ),
    );
    expect(new URL(ok.headers.get("location") || "").searchParams.get("gmail")).toBe("conectado");
    expect(await db.get<{ status: string }>("SELECT status FROM gmail_tokens WHERE user_id = ?", [userId])).toMatchObject({ status: "connected" });

    const disconnectFetch = vi.fn(async (url: string, init?: { body?: unknown }) => {
      return new Response(String(init?.body ?? url), { status: 200 });
    });
    vi.stubGlobal("fetch", disconnectFetch);
    const disconnected = await disconnectGoogle(sessionRequest("https://crm-libertario.libertario.workers.dev/api/auth/google/disconnect", token));
    expect(disconnected.status).toBe(200);
    expect(disconnectFetch.mock.calls.map((call) => String(call[0]))).toContain("https://oauth2.googleapis.com/revoke");
    expect(await db.get("SELECT user_id FROM gmail_tokens")).toBeUndefined();
  });
});

describe("per-user gmail send", () => {
  it("sends HTML from the connected account and keeps customers out of test mode", async () => {
    vi.stubEnv("TOKEN_ENC_KEY", ENC_KEY);
    vi.stubEnv("GOOGLE_CLIENT_ID", CLIENT_ID);
    vi.stubEnv("GOOGLE_CLIENT_SECRET", CLIENT_SECRET);
    vi.stubEnv("MAIL_MODE", "gmail_api");
    vi.stubEnv("MAIL_TEST_MODE", "");
    vi.stubEnv("GMAIL_TOKEN_JSON", JSON.stringify({ client_id: "shared-id", client_secret: "shared-secret", refresh_token: "shared-refresh" }));
    const { db } = await tempSql();
    const userId = await insertUser(db);
    await saveGmailConnection(db, { userId, googleEmail: USER_EMAIL, refreshToken: "user-refresh" });
    const fetchImpl = vi.fn(async (url: string, init?: { body?: unknown }) => {
      void init;
      if (String(url).includes("oauth2.googleapis.com")) return new Response(JSON.stringify({ access_token: "token" }), { status: 200 });
      return new Response(JSON.stringify({ id: "gmail-user" }), { status: 200 });
    });
    const id = await deliverMail(
      { to: "cliente@hotel.com", subject: "Café", text: "Hola cliente", senderUserId: userId, db },
      fetchImpl as unknown as typeof fetch,
    );
    expect(id).toBe("gmail-user");
    const tokenBody = String((fetchImpl.mock.calls[0]?.[1] as { body?: unknown } | undefined)?.body);
    expect(tokenBody).toContain("user-refresh");
    expect(tokenBody).not.toContain("shared-refresh");
    const raw = decodeRaw(String((fetchImpl.mock.calls[1]?.[1] as { body?: unknown } | undefined)?.body));
    expect(raw).toContain(`To: ${USER_EMAIL}`);
    expect(raw).not.toContain("To: cliente@hotel.com");
    expect(raw).toContain("Destinatario original: cliente@hotel.com");
    expect(raw).toContain("Content-Type: text/html; charset=utf-8");
    expect(raw).toContain("From: Comercial Libertario <ventas@libertariocoffee.com>");
    expect(raw).toContain(encodeSubject("[PRUEBA] Café"));
    expect(raw).not.toContain("Subject: [PRUEBA] Café");
  });

  it("sends to the customer only when test mode is off, and marks invalid_grant disconnected", async () => {
    vi.stubEnv("TOKEN_ENC_KEY", ENC_KEY);
    vi.stubEnv("GOOGLE_CLIENT_ID", CLIENT_ID);
    vi.stubEnv("GOOGLE_CLIENT_SECRET", CLIENT_SECRET);
    vi.stubEnv("MAIL_MODE", "gmail_api");
    vi.stubEnv("MAIL_TEST_MODE", "false");
    vi.stubEnv("MAIL_FROM_ADDRESS", "lidertransformacion@libertariocoffee.com");
    vi.stubEnv("GMAIL_TOKEN_JSON", JSON.stringify({ client_id: "shared-id", client_secret: "shared-secret", refresh_token: "shared-refresh" }));
    const { db } = await tempSql();
    const userId = await insertUser(db);
    await saveGmailConnection(db, { userId, googleEmail: USER_EMAIL, refreshToken: "user-refresh" });
    const liveFetch = vi.fn(async (url: string, init?: { body?: unknown }) => {
      void init;
      if (String(url).includes("oauth2.googleapis.com")) return new Response(JSON.stringify({ access_token: "token" }), { status: 200 });
      return new Response(JSON.stringify({ id: "live-1" }), { status: 200 });
    });
    await deliverMail({ to: "cliente@hotel.com", subject: "Oferta", text: "Hola", senderUserId: userId, db }, liveFetch as unknown as typeof fetch);
    const liveRaw = decodeRaw(String((liveFetch.mock.calls[1]?.[1] as { body?: unknown } | undefined)?.body));
    expect(liveRaw).toContain("To: cliente@hotel.com");
    expect(liveRaw).not.toContain("[PRUEBA]");

    const deadFetch = vi.fn(async (url: string, init?: { body?: unknown }) => {
      const body = String(init?.body ?? "");
      if (String(url).includes("oauth2.googleapis.com") && body.includes("user-refresh")) {
        return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
      }
      if (String(url).includes("oauth2.googleapis.com")) return new Response(JSON.stringify({ access_token: "shared" }), { status: 200 });
      return new Response(JSON.stringify({ id: "shared-1" }), { status: 200 });
    });
    const fallback = await deliverMail(
      { to: "cliente@hotel.com", subject: "Oferta", text: "Hola", senderUserId: userId, db },
      deadFetch as unknown as typeof fetch,
    );
    expect(fallback).toBe("shared-1");
    expect(await db.get<{ status: string }>("SELECT status FROM gmail_tokens WHERE user_id = ?", [userId])).toMatchObject({ status: "disconnected" });
    const sharedBody = String((deadFetch.mock.calls.find((call) => String(call[1]?.body ?? "").includes("shared-refresh"))?.[1] as { body?: unknown } | undefined)?.body);
    expect(sharedBody).toContain("shared-refresh");

    vi.stubEnv("MAIL_TEST_MODE", "true");
    await enqueueEmail(db, { to: "cliente@hotel.com", subject: "Cola", body: "Hola", senderUserId: userId });
    const queuedFetch = vi.fn(async (url: string, init?: { body?: unknown }) => {
      void init;
      if (String(url).includes("oauth2.googleapis.com")) return new Response(JSON.stringify({ access_token: "shared" }), { status: 200 });
      return new Response(JSON.stringify({ id: "queued-1" }), { status: 200 });
    });
    vi.stubGlobal("fetch", queuedFetch);
    const summary = await processOutbox(db);
    expect(summary.sent).toBe(1);
    const queuedRaw = decodeRaw(String((queuedFetch.mock.calls.find((call) => String(call[0]).includes("messages/send"))?.[1] as { body?: unknown } | undefined)?.body));
    expect(queuedRaw).not.toContain("To: cliente@hotel.com");
    const message = rfc822({
      to: USER_EMAIL,
      subject: "Café",
      text: "Hola",
      html: "<p>Hola</p>",
      fromAddress: USER_EMAIL,
      fromName: "Comercial Libertario",
    });
    expect(message).toContain("Content-Type: text/html; charset=utf-8");
    expect(message).toContain("Content-Type: text/plain; charset=utf-8");
  });
});
