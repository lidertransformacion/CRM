import type { SqlDb } from "@/lib/sql/types";
import { sha256Text } from "@/lib/legal/storage";

export type AuditInput = {
  entityType: string;
  entityId: number;
  action: string;
  actorUserId: number | null;
  actorEmail: string | null;
  ip: string | null;
  userAgent: string | null;
  data?: unknown;
};

export function auditCanonical(event: {
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
}): string {
  return JSON.stringify({
    action: event.action,
    actor_email: event.actor_email,
    actor_user_id: event.actor_user_id,
    created_at: event.created_at,
    data_json: event.data_json,
    entity_id: event.entity_id,
    entity_type: event.entity_type,
    ip: event.ip,
    prev_hash: event.prev_hash,
    user_agent: event.user_agent,
  });
}

/** Append-only hash chain. The previous row's hash is the next row's prev_hash. */
export async function recordAudit(db: SqlDb, input: AuditInput, at = new Date().toISOString()): Promise<{ id: number; hash: string; prevHash: string }> {
  const previous = await db.get<{ hash: string }>("SELECT hash FROM audit_events ORDER BY id DESC LIMIT 1");
  const prevHash = previous?.hash ?? "";
  const dataJson = input.data === undefined ? null : JSON.stringify(input.data);
  const canonical = auditCanonical({
    action: input.action,
    actor_email: input.actorEmail,
    actor_user_id: input.actorUserId,
    created_at: at,
    data_json: dataJson,
    entity_id: input.entityId,
    entity_type: input.entityType,
    ip: input.ip,
    prev_hash: prevHash,
    user_agent: input.userAgent,
  });
  const hash = await sha256Text(canonical);
  const result = await db.run(
    `INSERT INTO audit_events (entity_type, entity_id, action, actor_user_id, actor_email, ip, user_agent, data_json, prev_hash, hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.entityType, input.entityId, input.action, input.actorUserId, input.actorEmail, input.ip, input.userAgent, dataJson, prevHash, hash, at],
  );
  return { id: result.lastInsertRowid, hash, prevHash };
}
