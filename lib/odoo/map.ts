import { createHash } from "node:crypto";
import { excelSerialToIso } from "@/lib/odoo/xlsx";
import type { OdooActivity, OdooLead, OdooTeam } from "@/lib/odoo/adapter";

function num(value: string | undefined): number | null {
  if (!value || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateCell(value: string | undefined): string | null {
  if (!value || !value.trim()) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  return excelSerialToIso(parsed).slice(0, 19);
}

function boolCell(value: string | undefined): boolean {
  const text = (value ?? "").trim().toLowerCase();
  return text === "true" || text === "1" || text === "sí" || text === "si";
}

export function mapLeadRow(row: Record<string, string>): OdooLead {
  return {
    name: row["Oportunidad"] ?? "",
    type: row["Tipo"] ?? "",
    stage: row["Etapa"] ?? "",
    team: row["Equipo de ventas"] ?? "",
    salesperson: row["Vendedor"] ?? "",
    customer: row["Cliente"] ?? "",
    expectedRevenue: num(row["Ingreso esperado"]),
    probability: num(row["Probabilidad"]),
    createdAt: dateCell(row["Creado"]),
    expectedClose: dateCell(row["Cierre esperado"]),
    closedAt: dateCell(row["Fecha de cierre"]),
    wonStatus: row["Ganado"] ?? "",
    active: boolCell(row["Activo"]),
    lossReason: row["Motivo de pérdida"] ?? "",
    tags: row["Etiquetas"] ?? "",
    nextActivityType: row["Tipo de la siguiente actividad"] ?? "",
    nextActivitySummary: row["Resumen de la siguiente actividad"] ?? "",
    nextActivityDeadline: dateCell(row["Fecha límite de la siguiente actividad"])?.slice(0, 10) ?? null,
    odooId: row["ID"] || row["id"] || null,
  };
}

export function mapActivityRow(row: Record<string, string>): OdooActivity {
  return {
    documentName: row["Nombre del documento"] ?? "",
    model: row["Modelo de documento relacionado"] ?? "",
    odooLeadId: row["ID del documento relacionado"] || null,
    summary: row["Resumen"] ?? "",
    activityType: row["Tipo de actividad"] ?? "",
    deadline: dateCell(row["Fecha de vencimiento"])?.slice(0, 10) ?? null,
    state: row["Estado"] ?? "",
    createdAt: dateCell(row["Creado"]),
    note: row["Nota"] ?? "",
    assignee: row["Asignada a"] ?? "",
  };
}

export function mapTeamRows(rows: Record<string, string>[]): OdooTeam[] {
  const teams: OdooTeam[] = [];
  let current: OdooTeam | null = null;
  for (const row of rows) {
    const name = (row["Equipo de Ventas"] ?? "").trim();
    const member = (row["Miembros del equipo de ventas"] ?? "").trim();
    if (name) {
      current = {
        name,
        leader: (row["Líder del Equipo"] ?? "").trim(),
        active: boolCell(row["Activo(a)"]),
        company: (row["Compañía"] ?? "").trim(),
        members: member ? [member] : [],
      };
      teams.push(current);
    } else if (current && member) current.members.push(member);
  }
  return teams;
}

export function leadImportKey(lead: OdooLead, duplicateIndex: number): string {
  const hash = createHash("sha1");
  hash.update(
    [lead.name, lead.customer, lead.salesperson, lead.createdAt ?? "", lead.team, String(lead.expectedRevenue ?? ""), String(lead.probability ?? ""), String(duplicateIndex)].join(
      "\u001f",
    ),
  );
  return hash.digest("hex").slice(0, 20);
}

export function assignLeadKeys(leads: OdooLead[]): { lead: OdooLead; importKey: string }[] {
  const seen = new Map<string, number>();
  return leads.map((lead) => {
    const identity = [lead.name, lead.customer, lead.salesperson, lead.createdAt ?? "", lead.team, String(lead.expectedRevenue ?? ""), String(lead.probability ?? "")].join("\u001f");
    const index = seen.get(identity) ?? 0;
    seen.set(identity, index + 1);
    return { lead, importKey: leadImportKey(lead, index) };
  });
}
