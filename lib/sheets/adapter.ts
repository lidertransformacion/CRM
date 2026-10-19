import fs from "node:fs";
import path from "node:path";
import { readEnv } from "@/lib/env";
import { snapshotFromCsv } from "@/lib/sheets/csv";
import { planPull, planPush } from "@/lib/sheets/diff";
import type { ApplyResult, EquipmentSyncRow, PullPlan, PushPlan, SheetSnapshot } from "@/lib/sheets/types";

export interface SheetsAdapter {
  readonly mode: "dry-run" | "live";
  pull(): Promise<SheetSnapshot>;
  planPush(local: EquipmentSyncRow[]): PushPlan;
  planPull(local: EquipmentSyncRow[]): PullPlan;
  apply(plan: PushPlan): Promise<ApplyResult>;
}

const DISABLED_REASON =
  "La sincronización está apagada. Nada se escribió en Google Sheets. Para activarla más adelante: SHEETS_SYNC_ENABLED=true y las variables de credenciales.";

export class DryRunSheetsAdapter implements SheetsAdapter {
  readonly mode = "dry-run" as const;

  constructor(private readonly snapshot: SheetSnapshot) {}

  async pull(): Promise<SheetSnapshot> {
    return this.snapshot;
  }

  planPush(local: EquipmentSyncRow[]): PushPlan {
    return planPush(local, this.snapshot);
  }

  planPull(local: EquipmentSyncRow[]): PullPlan {
    return planPull(local, this.snapshot);
  }

  async apply(): Promise<ApplyResult> {
    return { written: false, reason: DISABLED_REASON, updates: 0, inserts: 0 };
  }
}

export function bundledSnapshotPath(): string {
  return path.join(process.cwd(), "data", "imports", "listado_equipos.csv");
}

export function loadBundledSnapshot(): SheetSnapshot {
  const text = fs.readFileSync(bundledSnapshotPath(), "utf8");
  return snapshotFromCsv(text);
}

/**
 * Default adapter is always dry-run. The live client is constructed only when
 * SHEETS_SYNC_ENABLED=true, and even then it reads credentials from the environment.
 */
export async function getSheetsAdapter(): Promise<SheetsAdapter> {
  if ((await readEnv("SHEETS_SYNC_ENABLED")) !== "true") return new DryRunSheetsAdapter(loadBundledSnapshot());
  const { LiveGoogleSheetsAdapter } = await import("@/lib/sheets/live");
  return new LiveGoogleSheetsAdapter();
}
