import type { Actor } from "@/lib/legal/access";
import { expiringContracts, todayBogota, type ContractRow } from "@/lib/legal/contracts";
import { pendingForUser, type PendingSignature } from "@/lib/legal/signatures";
import { readThrough } from "@/lib/sql/read-cache";
import type { SqlDb } from "@/lib/sql/types";

export type RecentContract = Pick<ContractRow, "id" | "code" | "title" | "status" | "updated_at" | "end_date">;

export type RecentNote = {
  id: number;
  kind: string;
  body: string;
  created_at: string;
  contract_id: number;
  title: string;
};

export async function legalSummary(db: SqlDb, actor: Actor) {
  return readThrough(db, `legal:summary:${todayBogota()}:${actor.uid}:${actor.email.toLowerCase()}`, ["legal"], async () => {
    const [expiring, pending, recentContracts, recentNotes] = await Promise.all([
      expiringContracts(db, actor),
      pendingForUser(db, actor.uid, actor.email),
      db.all<RecentContract>("SELECT id, code, title, status, updated_at, end_date FROM contracts ORDER BY updated_at DESC LIMIT 8"),
      db.all<RecentNote>(
        `SELECT n.id, n.kind, n.body, n.created_at, c.id AS contract_id, c.title
         FROM contract_novedades n JOIN contracts c ON c.id = n.contract_id
         ORDER BY n.created_at DESC LIMIT 8`,
      ),
    ]);
    return { expiring, pending, recentContracts, recentNotes };
  });
}

export type LegalSummaryData = {
  expiring: Awaited<ReturnType<typeof expiringContracts>>;
  pending: PendingSignature[];
  recentContracts: RecentContract[];
  recentNotes: RecentNote[];
};
