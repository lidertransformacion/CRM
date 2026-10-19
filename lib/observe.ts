import { AsyncLocalStorage } from "node:async_hooks";

type Mark = { name: string; dur: number };
type Store = { marks: Mark[] };

const storage = new AsyncLocalStorage<Store>();

export function runWithTimings<T>(fn: () => Promise<T>): Promise<T> {
  return storage.run({ marks: [] }, fn);
}

export function recordTiming(name: string, dur: number) {
  const store = storage.getStore();
  if (!store || !Number.isFinite(dur)) return;
  store.marks.push({ name, dur });
}

export function serverTimingHeader(totalMs: number): string {
  const marks = storage.getStore()?.marks ?? [];
  const parts = [`app;dur=${totalMs.toFixed(1)}`];
  const summed = new Map<string, number>();
  for (const mark of marks) summed.set(mark.name, (summed.get(mark.name) ?? 0) + mark.dur);
  for (const [name, dur] of summed) parts.push(`${name};dur=${dur.toFixed(1)}`);
  return parts.join(", ");
}
