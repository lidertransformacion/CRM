/**
 * Secrets and vars live on the Workers env binding.
 * Read that binding on every call. process.env is only the fallback for Node,
 * Vitest, and next dev, and it must not hide a newer binding.
 */

let workersEnv: Record<string, unknown> | null = null;

async function loadWorkersEnv(): Promise<Record<string, unknown> | null> {
  try {
    const { env } = await import("cloudflare:workers");
    if (env && typeof env === "object") {
      workersEnv = env as Record<string, unknown>;
      return workersEnv;
    }
  } catch {
    // Node, Vitest, and next dev have no cloudflare:workers module.
  }
  workersEnv = null;
  return null;
}

function fromSources(name: string, binding: Record<string, unknown> | null, fallback: NodeJS.ProcessEnv): string {
  if (binding) {
    const value = binding[name];
    if (typeof value === "string") return value;
  }
  return fallback[name] ?? "";
}

/** Binding first, then process.env. Safe for code that cannot await. */
export function readEnvSync(name: string): string {
  return fromSources(name, workersEnv, process.env);
}

export async function readEnv(name: string): Promise<string> {
  return fromSources(name, await loadWorkersEnv(), process.env);
}

/** Copy the current binding onto process.env, replacing any stale values. */
export async function hydrateProcessEnv(): Promise<void> {
  const binding = await loadWorkersEnv();
  if (!binding) return;
  for (const [key, value] of Object.entries(binding)) {
    if (typeof value === "string") process.env[key] = value;
  }
}
