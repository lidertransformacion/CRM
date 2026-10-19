import { getDb } from "@/lib/db";
import type { SqlDb } from "@/lib/sql/types";

export type KpiTargetRow = { id: number; salesperson: string; metric: string; period: string; target_value: number };

/** Devuelve la meta guardada para esa combinación (vendedor vacío = equipo), o null si no existe. */
export async function findTarget(input: { salesperson: string; metric: string; period: string }, db?: SqlDb): Promise<KpiTargetRow | null> {
  const row = await (db ?? (await getDb())).get<KpiTargetRow>(
    "SELECT id, salesperson, metric, period, target_value FROM kpi_targets WHERE salesperson = ? AND metric = ? AND period = ?",
    [input.salesperson, input.metric, input.period],
  );
  return row ? { ...row } : null;
}
