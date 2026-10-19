import { getDb } from "@/lib/db";

export type KpiTargetRow = { id: number; salesperson: string; metric: string; period: string; target_value: number };

/** Devuelve la meta guardada para esa combinación (vendedor vacío = equipo), o null si no existe. */
export function findTarget(input: { salesperson: string; metric: string; period: string }, db = getDb()): KpiTargetRow | null {
  const row = db
    .prepare("SELECT id, salesperson, metric, period, target_value FROM kpi_targets WHERE salesperson = ? AND metric = ? AND period = ?")
    .get(input.salesperson, input.metric, input.period) as KpiTargetRow | undefined;
  return row ? { ...row } : null;
}
