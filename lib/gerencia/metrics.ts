import { classifyLead, kpiRevenue, type LeadFact } from "@/lib/kpi/compute";
import { expiringContracts } from "@/lib/legal/contracts";
import type { Actor } from "@/lib/legal/access";
import { pendingForUser, type PendingSignature } from "@/lib/legal/signatures";
import type { SqlDb } from "@/lib/sql/types";

export type StatusCount = { status: string; count: number };

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
};

type LeadRow = {
  stage: string;
  active: number;
  won_status: string | null;
  expected_revenue: number | null;
};

export async function gerenciaSnapshot(db: SqlDb, actor: Actor, today = new Date()): Promise<GerenciaSnapshot> {
  const leads = await db.all<LeadRow>("SELECT stage, active, won_status, expected_revenue FROM leads");
  let openDeals = 0;
  let pipelineValue = 0;
  let won = 0;
  let lost = 0;
  for (const lead of leads) {
    const fact: LeadFact = {
      importKey: "",
      name: "",
      stage: lead.stage,
      salesperson: "",
      customer: "",
      expectedRevenue: lead.expected_revenue,
      probability: null,
      createdAt: null,
      active: lead.active === 1,
      wonStatus: lead.won_status ?? undefined,
    };
    const kind = classifyLead(fact);
    if (kind === "open") {
      openDeals += 1;
      pipelineValue += kpiRevenue(fact) ?? 0;
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
  };
}
