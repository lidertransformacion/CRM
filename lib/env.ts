/**
 * Wrangler secrets and vars are on the Workers `env` binding.
 * nodejs_compat often mirrors them onto process.env; this reads either.
 */
export async function readEnv(name: string): Promise<string> {
  const fromProcess = process.env[name];
  if (fromProcess != null && fromProcess !== "") return fromProcess;
  try {
    const { env } = await import("cloudflare:workers");
    const value = (env as Record<string, unknown>)[name];
    if (typeof value === "string") return value;
  } catch {
    // Node, Vitest, and next dev have no cloudflare:workers module.
  }
  return "";
}

export async function hydrateProcessEnv(): Promise<void> {
  try {
    const { env } = await import("cloudflare:workers");
    for (const [key, value] of Object.entries(env as Record<string, unknown>)) {
      if (typeof value === "string" && (process.env[key] == null || process.env[key] === "")) {
        process.env[key] = value;
      }
    }
  } catch {
    // Outside workerd.
  }
}
