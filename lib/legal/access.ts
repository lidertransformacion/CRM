import { can } from "@/lib/auth/permissions";
import type { Role } from "@/lib/auth/session";
import type { SqlDb } from "@/lib/sql/types";

export type Actor = {
  uid: number;
  email: string;
  role: Role;
  ip: string | null;
  userAgent: string | null;
};

export type TargetType = "lead" | "equipment";

/**
 * A commercial user owns a deal when the salesperson field is their email
 * or the words of their mailbox match the salesperson name.
 */
export function sellerMatchesUser(salesperson: string | null | undefined, email: string): boolean {
  if (!salesperson) return false;
  const seller = salesperson.trim().toLowerCase().replace(/,/g, " ").replace(/[._-]+/g, " ").replace(/\s+/g, " ");
  const mail = email.trim().toLowerCase();
  if (!seller || !mail) return false;
  if (seller === mail) return true;
  const local = (mail.split("@")[0] ?? "").replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!local) return false;
  if (seller === local) return true;
  if (local.includes(" ") && seller.includes(local)) return true;
  const words = new Set(seller.split(" ").filter(Boolean));
  const tokens = local.split(" ").filter((token) => token.length > 2);
  return tokens.length > 0 && tokens.every((token) => words.has(token));
}

export async function ownsLead(db: SqlDb, email: string, importKey: string): Promise<boolean> {
  const lead = await db.get<{ salesperson: string | null }>("SELECT salesperson FROM leads WHERE import_key = ?", [importKey]);
  return !!lead && sellerMatchesUser(lead.salesperson, email);
}

export async function ownsEquipment(db: SqlDb, email: string, serial: string): Promise<boolean> {
  const row = await db.get<{ salesperson: string | null; lead_import_key: string | null }>(
    "SELECT salesperson, lead_import_key FROM equipment WHERE serial = ?",
    [serial],
  );
  if (!row) return false;
  if (sellerMatchesUser(row.salesperson, email)) return true;
  if (row.lead_import_key) return ownsLead(db, email, row.lead_import_key);
  return false;
}

export async function actorOwnsTarget(db: SqlDb, actor: Actor, type: TargetType, key: string): Promise<boolean> {
  if (can(actor.role, "link_any")) return targetExists(db, type, key);
  if (type === "lead") return ownsLead(db, actor.email, key);
  return ownsEquipment(db, actor.email, key);
}

export async function targetExists(db: SqlDb, type: TargetType, key: string): Promise<boolean> {
  if (type === "lead") {
    const row = await db.get<{ import_key: string }>("SELECT import_key FROM leads WHERE import_key = ?", [key]);
    return !!row;
  }
  const row = await db.get<{ serial: string }>("SELECT serial FROM equipment WHERE serial = ?", [key]);
  return !!row;
}

export async function canEditContract(db: SqlDb, actor: Actor, contractId: number): Promise<boolean> {
  if (!can(actor.role, "upload_contract")) return false;
  if (can(actor.role, "link_any")) return true;
  const contract = await db.get<{ owner_id: number }>("SELECT owner_id FROM contracts WHERE id = ?", [contractId]);
  if (!contract) return false;
  if (contract.owner_id === actor.uid) return true;
  const links = await db.all<{ target_type: TargetType; target_key: string }>(
    "SELECT target_type, target_key FROM contract_links WHERE contract_id = ?",
    [contractId],
  );
  for (const link of links) {
    if (await actorOwnsTarget(db, actor, link.target_type, link.target_key)) return true;
  }
  return false;
}
