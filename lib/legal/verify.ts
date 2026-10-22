import { auditCanonical } from "@/lib/legal/audit";
import { sha256Hex, sha256Text } from "@/lib/legal/storage";
import { AUDIT_COLUMNS } from "@/lib/sql/columns";
import { readThrough } from "@/lib/sql/read-cache";
import type { SqlDb } from "@/lib/sql/types";

export type HashMatch = {
  kind: "final" | "source" | "step" | "none";
  publicId: string | null;
  status: string | null;
  title: string | null;
  sha256: string;
};

type AuditRow = {
  id: number;
  action: string;
  actor_email: string | null;
  actor_user_id: number | null;
  created_at: string;
  data_json: string | null;
  entity_id: number;
  entity_type: string;
  ip: string | null;
  prev_hash: string;
  user_agent: string | null;
  hash: string;
};

/** True when every audit row still hashes to the stored chain. */
export async function auditChainIntact(db: SqlDb): Promise<boolean> {
  const rows = await readThrough(db, "legal:audit", ["legal"], () => db.all<AuditRow>(`SELECT ${AUDIT_COLUMNS} FROM audit_events ORDER BY id`));
  let previous = "";
  for (const row of rows) {
    if ((row.prev_hash ?? "") !== previous) return false;
    const hash = await sha256Text(auditCanonical(row));
    if (hash !== row.hash) return false;
    previous = row.hash;
  }
  return true;
}

export async function lookupSha256(db: SqlDb, sha256: string): Promise<HashMatch> {
  const hash = sha256.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    return { kind: "none", publicId: null, status: null, title: null, sha256: hash };
  }
  const finalHit = await db.get<{ public_id: string; status: string; title: string }>(
    `SELECT r.public_id, r.status, c.title
     FROM signature_requests r JOIN contracts c ON c.id = r.contract_id
     WHERE lower(r.final_sha256) = ?`,
    [hash],
  );
  if (finalHit) return { kind: "final", publicId: finalHit.public_id, status: finalHit.status, title: finalHit.title, sha256: hash };
  const sourceHit = await db.get<{ public_id: string; status: string; title: string }>(
    `SELECT r.public_id, r.status, c.title
     FROM signature_requests r JOIN contracts c ON c.id = r.contract_id
     WHERE lower(r.source_sha256) = ? ORDER BY r.id DESC LIMIT 1`,
    [hash],
  );
  if (sourceHit) return { kind: "source", publicId: sourceHit.public_id, status: sourceHit.status, title: sourceHit.title, sha256: hash };
  const stepHit = await db.get<{ public_id: string; status: string; title: string }>(
    `SELECT r.public_id, r.status, c.title
     FROM signature_steps s
     JOIN signature_requests r ON r.id = s.request_id
     JOIN contracts c ON c.id = r.contract_id
     WHERE lower(s.output_sha256) = ? LIMIT 1`,
    [hash],
  );
  if (stepHit) return { kind: "step", publicId: stepHit.public_id, status: stepHit.status, title: stepHit.title, sha256: hash };
  return { kind: "none", publicId: null, status: null, title: null, sha256: hash };
}

export async function lookupPdf(db: SqlDb, bytes: Uint8Array): Promise<HashMatch> {
  return lookupSha256(db, await sha256Hex(bytes));
}

export async function publicVerification(db: SqlDb, publicId: string) {
  const request = await db.get<{
    id: number;
    public_id: string;
    status: string;
    source_sha256: string;
    final_sha256: string | null;
    completed_at: string | null;
    created_at: string;
    title: string;
    code: string | null;
  }>(
    `SELECT r.id, r.public_id, r.status, r.source_sha256, r.final_sha256, r.completed_at, r.created_at, c.title, c.code
     FROM signature_requests r JOIN contracts c ON c.id = r.contract_id
     WHERE r.public_id = ?`,
    [publicId],
  );
  if (!request) return null;
  const steps = await db.all<{ step_order: number; role: string; signer_name: string | null; signer_email: string; status: string; signed_at: string | null }>(
    "SELECT step_order, role, signer_name, signer_email, status, signed_at FROM signature_steps WHERE request_id = ? ORDER BY step_order",
    [request.id],
  );
  const events = await db.all<{ id: number; action: string; created_at: string; hash: string }>(
    "SELECT id, action, created_at, hash FROM audit_events WHERE entity_type = 'signature_request' AND entity_id = ? ORDER BY id",
    [request.id],
  );
  return {
    publicId: request.public_id,
    title: request.title,
    code: request.code,
    status: request.status,
    sourceSha256: request.source_sha256,
    finalSha256: request.final_sha256,
    completedAt: request.completed_at,
    createdAt: request.created_at,
    chainIntact: await auditChainIntact(db),
    steps: steps.map((step) => ({
      order: step.step_order,
      role: step.role,
      name: step.signer_name || step.signer_email,
      status: step.status,
      signedAt: step.signed_at,
    })),
    events,
  };
}
