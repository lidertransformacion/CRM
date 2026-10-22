import { listLeads } from "@/lib/db";
import { classifyLead, kpiRevenue, type LeadFact } from "@/lib/kpi/compute";
import { expiringContracts } from "@/lib/legal/contracts";
import type { Actor } from "@/lib/legal/access";
import { pendingForUser, type PendingSignature } from "@/lib/legal/signatures";
import { readThrough } from "@/lib/sql/read-cache";
import type { SqlDb } from "@/lib/sql/types";

export type StatusCount = { status: string; count: number };

export type StageValue = { stage: string; count: number; value: number };

export type PipelineProjection = {
  weighted: number;
  missingProbability: number;
  closingSoon: number;
  closingSoonValue: number;
  byStage: StageValue[];
};

export type GerenciaSnapshot = {
  openDeals: number;
  pipelineValue: number;
  won: number;
  lost: number;
  visits: number;
  contractsByStatus: StatusCount[];
  signedThisMonth: number;
  expiring: number;
  pending: PendingSignature[];
  projection: PipelineProjection;
};

function dayOffset(today: Date, days: number): string {
  const date = new Date(today.getTime());
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function gerenciaSnapshot(db: SqlDb, actor: Actor, today = new Date()): Promise<GerenciaSnapshot> {
  const todayKey = today.toISOString().slice(0, 10);
  return readThrough(db, `gerencia:${todayKey}:${actor.uid}:${actor.email.toLowerCase()}`, ["leads", "visits", "legal"], () =>
    gerenciaFresh(db, actor, today),
  );
}

async function gerenciaFresh(db: SqlDb, actor: Actor, today: Date): Promise<GerenciaSnapshot> {
  const leads = await listLeads(db);
  let openDeals = 0;
  let pipelineValue = 0;
  let won = 0;
  let lost = 0;
  let weighted = 0;
  let missingProbability = 0;
  let closingSoon = 0;
  let closingSoonValue = 0;
  const horizon = dayOffset(today, 30);
  const todayKey = today.toISOString().slice(0, 10);
  const stages = new Map<string, StageValue>();
  for (const lead of leads) {
    const fact: LeadFact = {
      importKey: lead.import_key,
      name: lead.name,
      stage: lead.stage,
      salesperson: lead.salesperson,
      customer: lead.customer,
      expectedRevenue: lead.expected_revenue,
      probability: lead.probability,
      createdAt: lead.created_at,
      active: lead.active === 1,
      wonStatus: lead.won_status ?? undefined,
    };
    const kind = classifyLead(fact);
    if (kind === "open") {
      const amount = kpiRevenue(fact) ?? 0;
      openDeals += 1;
      pipelineValue += amount;
      const probability = lead.probability;
      if (probability == null) missingProbability += 1;
      else weighted += amount * (probability / 100);
      const close = lead.expected_close?.slice(0, 10) ?? "";
      if (close && close >= todayKey && close <= horizon) {
        closingSoon += 1;
        closingSoonValue += amount;
      }
      const bucket = stages.get(lead.stage) ?? { stage: lead.stage, count: 0, value: 0 };
      bucket.count += 1;
      bucket.value += amount;
      stages.set(lead.stage, bucket);
    } else if (kind === "won") won += 1;
    else if (kind === "lost") lost += 1;
  }
  const visitRow = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM visits");
  const contractsByStatus = await db.all<StatusCount>("SELECT status, COUNT(*) AS count FROM contracts GROUP BY status ORDER BY status");
  const month = today.toISOString().slice(0, 7);
  const signed = await db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM signature_requests WHERE status = 'completed' AND completed_at LIKE ?",
    [`${month}%`],
  );
  const expiring = await expiringContracts(db, actor);
  const pending = await pendingForUser(db, actor.uid, actor.email);
  return {
    openDeals,
    pipelineValue,
    won,
    lost,
    visits: Number(visitRow?.n ?? 0),
    contractsByStatus,
    signedThisMonth: Number(signed?.n ?? 0),
    expiring: expiring.length,
    pending,
    projection: {
      weighted,
      missingProbability,
      closingSoon,
      closingSoonValue,
      byStage: [...stages.values()].sort((a, b) => b.value - a.value),
    },
  };
}
