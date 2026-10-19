import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  env: {
    SESSION_SECRET: "binding-session-secret",
    BOOTSTRAP_ADMIN_PASSWORD: "binding-admin-password",
    EMPTY_SECRET: "",
  },
}));

import { hydrateProcessEnv, readEnv, readEnvSync } from "@/lib/env";

describe("workers env binding", () => {
  const previous = {
    SESSION_SECRET: process.env.SESSION_SECRET,
    BOOTSTRAP_ADMIN_PASSWORD: process.env.BOOTSTRAP_ADMIN_PASSWORD,
    EMPTY_SECRET: process.env.EMPTY_SECRET,
    CRM_DB_PATH: process.env.CRM_DB_PATH,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("prefers the binding over a stale process.env value", async () => {
    process.env.SESSION_SECRET = "stale-session-secret";
    process.env.BOOTSTRAP_ADMIN_PASSWORD = "stale-admin-password";
    process.env.EMPTY_SECRET = "stale-empty-secret";
    expect(await readEnv("SESSION_SECRET")).toBe("binding-session-secret");
    expect(await readEnv("BOOTSTRAP_ADMIN_PASSWORD")).toBe("binding-admin-password");
    expect(await readEnv("EMPTY_SECRET")).toBe("");
    expect(readEnvSync("SESSION_SECRET")).toBe("binding-session-secret");
  });

  it("overwrites process.env from the binding and still falls back when the binding has no key", async () => {
    process.env.SESSION_SECRET = "stale-session-secret";
    process.env.CRM_DB_PATH = "/tmp/crm-local.sqlite";
    await hydrateProcessEnv();
    expect(process.env.SESSION_SECRET).toBe("binding-session-secret");
    expect(await readEnv("CRM_DB_PATH")).toBe("/tmp/crm-local.sqlite");
  });
});
