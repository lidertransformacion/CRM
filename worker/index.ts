import handler from "vinext/server/fetch-handler";
import { drainOutbox } from "@/lib/mail/drain";
import { runWithTimings, serverTimingHeader } from "@/lib/observe";

type FetchHandler = (request: Request, env: unknown, ctx: unknown) => Response | Promise<Response>;

type CronEnv = { MAIL_MODE?: string };

type WaitCtx = { waitUntil(promise: Promise<unknown>): void };

function asFetch(value: unknown): FetchHandler {
  if (typeof value === "function") return value as FetchHandler;
  if (value && typeof value === "object" && "fetch" in value && typeof value.fetch === "function") {
    return value.fetch as FetchHandler;
  }
  throw new Error("vinext fetch handler missing");
}

const fetchApp = asFetch(handler);

function withTiming(response: Response, totalMs: number): Response {
  const headers = new Headers(response.headers);
  const timing = serverTimingHeader(totalMs);
  const previous = headers.get("Server-Timing");
  headers.set("Server-Timing", previous ? `${previous}, ${timing}` : timing);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request: Request, env: CronEnv, ctx: WaitCtx): Promise<Response> {
    const started = performance.now();
    const response = await runWithTimings(() => Promise.resolve(fetchApp(request, env, ctx)));
    if (env.MAIL_MODE === "gmail_api") ctx.waitUntil(drainOutbox());
    return withTiming(response, performance.now() - started);
  },
  async scheduled(_event: unknown, env: CronEnv, ctx: WaitCtx): Promise<void> {
    if (env.MAIL_MODE !== "gmail_api") return;
    ctx.waitUntil(drainOutbox());
  },
};
