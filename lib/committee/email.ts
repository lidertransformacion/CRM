import { longDate, shortDate, topicShortName } from "@/lib/utils";
import type { CommitteeDoc } from "@/lib/committee/types";
import { boardStats, carryCount, closedItemLabel, flatten, isOpen, isOverdue } from "@/lib/committee/metrics";

export type EmailRow = {
  topic: string;
  punto: string;
  title: string;
  coOwners: string;
  dateLabel: string;
  overdue: boolean;
  status: string;
  committees: string;
  carry: number;
};

export type EmailSection = {
  name: string;
  count: number;
  rows: EmailRow[];
};

export type CommitteeEmail = {
  subject: string;
  text: string;
  html: string;
  sections: EmailSection[];
};

const STATUS_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  en_curso: "En curso",
  cerrado: "Cerrado",
};

function committeeWord(carry: number): string {
  if (carry <= 0) return "Nuevo";
  return String(carry);
}

function rowsFor(doc: CommitteeDoc, owner: string | null, asOf: string): EmailRow[] {
  const items = flatten(doc).filter((row) => {
    if (!isOpen(row.pendiente)) return false;
    if (owner == null) return row.pendiente.owners.length === 0;
    return row.pendiente.owners.includes(owner);
  });
  const mapped = items.map((row) => {
    const carry = carryCount(doc, row.pendiente);
    const others = row.pendiente.owners.filter((name) => name !== owner);
    return {
      sortDue: row.pendiente.dueOn ?? "9999-99-99",
      sortTopic: row.topic.number,
      row,
      email: {
        topic: topicShortName(row.topic.title),
        punto: row.punto.title,
        title: row.pendiente.title.trim() || `(${row.punto.title})`,
        coOwners: others.length ? `Con ${others.join(", ")}` : "",
        dateLabel: row.pendiente.dueOn ? shortDate(row.pendiente.dueOn) : "Sin fecha",
        overdue: isOverdue(row.pendiente, asOf),
        status: STATUS_LABEL[row.pendiente.status] ?? row.pendiente.status,
        committees: committeeWord(carry),
        carry,
      } satisfies EmailRow,
    };
  });
  mapped.sort((a, b) => b.email.carry - a.email.carry || a.sortDue.localeCompare(b.sortDue) || a.sortTopic - b.sortTopic);
  return mapped.map((item) => item.email);
}

function sectionOrder(doc: CommitteeDoc, asOf: string): EmailSection[] {
  const counts = new Map<string, number>();
  for (const row of flatten(doc)) {
    if (!isOpen(row.pendiente)) continue;
    if (row.pendiente.owners.length === 0) {
      counts.set("__none__", (counts.get("__none__") ?? 0) + 1);
    } else {
      for (const owner of row.pendiente.owners) counts.set(owner, (counts.get(owner) ?? 0) + 1);
    }
  }
  const named = doc.people
    .filter((person) => (counts.get(person.name) ?? 0) > 0)
    .map((person) => ({ name: person.name, count: counts.get(person.name) ?? 0, sortOrder: person.sortOrder }));
  named.sort((a, b) => b.count - a.count || a.sortOrder - b.sortOrder);
  const sections: EmailSection[] = named.map((person) => ({
    name: person.name,
    count: person.count,
    rows: rowsFor(doc, person.name, asOf),
  }));
  const none = counts.get("__none__") ?? 0;
  if (none > 0) {
    sections.push({ name: "Sin responsable", count: none, rows: rowsFor(doc, null, asOf) });
  }
  return sections;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function closedLines(doc: CommitteeDoc): string[] {
  return flatten(doc)
    .filter((row) => row.pendiente.closedInCommitteeNumber === doc.committee.number && row.pendiente.status === "cerrado")
    .map((row) => {
      const label = closedItemLabel(row);
      const punto = row.punto.title.trim();
      if (!row.pendiente.title.trim() || label === punto) return `- ${label}`;
      return `- ${label} (${punto})`;
    });
}

export function buildCommitteeEmail(doc: CommitteeDoc, asOf: string): CommitteeEmail {
  const stats = boardStats(doc, asOf);
  const subject = `${doc.committee.title} · ${shortDate(doc.committee.heldOn)} · Decisiones y pendientes`;
  const intro = [
    "Equipo,",
    `Este es el resumen del ${doc.committee.title} del ${longDate(doc.committee.heldOn)}. Quedan ${stats.open} pendientes abiertos; ${stats.carried} llevan dos o más comités sin resolver y van marcados en rojo, y ${stats.overdue} tienen la fecha vencida. Esos son prioridad esta semana.`,
  ];
  const decisions = doc.topics.flatMap((topic) => topic.decisions.map((decision) => ({ topic: topic.title, body: decision.body })));
  const closed = closedLines(doc);
  const sections = sectionOrder(doc, asOf);

  const textParts = [...intro, "", "Cerrado desde el último comité", ...(closed.length ? closed : ["- Ninguno."])];
  if (decisions.length) {
    textParts.push("", "Decisiones");
    for (const decision of decisions) textParts.push(`- ${decision.body} (${topicShortName(decision.topic)})`);
  }
  for (const section of sections) {
    textParts.push("", `${section.name} · ${section.count} pendiente${section.count === 1 ? "" : "s"}`);
    for (const row of section.rows) {
      const who = row.coOwners ? ` (${row.coOwners})` : "";
      const vencido = row.overdue ? " Vencido" : "";
      textParts.push(`${row.topic} / ${row.punto} | ${row.title}${who} | ${row.dateLabel}${vencido} | ${row.status} | ${row.committees}`);
    }
  }
  textParts.push("", "Si algo cambia antes del próximo comité, actualícenlo en el tablero.", "Gracias,", doc.committee.signatureName);

  const htmlSections = sections
    .map((section) => {
      const body = section.rows
        .map((row) => {
          const bg = row.carry >= 2 ? "background:#fde8e8;" : "";
          const title = escapeHtml(row.title) + (row.coOwners ? ` <span style="color:#6b7280">(${escapeHtml(row.coOwners)})</span>` : "");
          const date = escapeHtml(row.dateLabel) + (row.overdue ? `<br><span style="color:#e11d48;font-weight:600">Vencido</span>` : "");
          return `<tr style="${bg}"><td style="padding:6px 8px;border-bottom:1px solid #f1f1f4">${escapeHtml(row.topic)}<br><span style="color:#6b7280">${escapeHtml(row.punto)}</span></td><td style="padding:6px 8px;border-bottom:1px solid #f1f1f4">${title}</td><td style="padding:6px 8px;border-bottom:1px solid #f1f1f4">${date}</td><td style="padding:6px 8px;border-bottom:1px solid #f1f1f4">${escapeHtml(row.status)}</td><td style="padding:6px 8px;border-bottom:1px solid #f1f1f4">${escapeHtml(row.committees)}</td></tr>`;
        })
        .join("");
      return `<h3 style="margin:22px 0 8px;font-family:Arial,sans-serif">${escapeHtml(section.name)} · ${section.count} pendiente${section.count === 1 ? "" : "s"}</h3><table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:14px"><thead><tr><th align="left">Tema</th><th align="left">Pendiente</th><th align="left">Fecha</th><th align="left">Estado</th><th align="left">Comités</th></tr></thead><tbody>${body}</tbody></table>`;
    })
    .join("");

  const html = `<div style="font-family:Arial,sans-serif;color:#1c2434;font-size:14px;line-height:1.45"><p>${escapeHtml(intro[0])}</p><p>${escapeHtml(intro[1])}</p><p><strong>Cerrado desde el último comité</strong></p><ul>${(closed.length ? closed : ["- Ninguno."]).map((line) => `<li>${escapeHtml(line.replace(/^- /, ""))}</li>`).join("")}</ul>${decisions.length ? `<p><strong>Decisiones</strong></p><ul>${decisions.map((decision) => `<li>${escapeHtml(decision.body)}</li>`).join("")}</ul>` : ""}${htmlSections}<p>Si algo cambia antes del próximo comité, actualícenlo en el tablero.</p><p>Gracias,<br>${escapeHtml(doc.committee.signatureName)}</p></div>`;

  return { subject, text: textParts.join("\n"), html, sections };
}

export function committeeCsv(doc: CommitteeDoc, asOf: string): string {
  const header = ["Tema", "Punto", "Pendiente", "Estado", "Responsables", "Fecha", "Comités", "Nació", "Vencido", "Oportunidad"];
  const lines = [header.join(",")];
  for (const row of flatten(doc)) {
    const cells = [
      row.topic.title,
      row.punto.title,
      row.pendiente.title,
      STATUS_LABEL[row.pendiente.status] ?? row.pendiente.status,
      row.pendiente.owners.join(" | "),
      row.pendiente.dueOn ?? "",
      String(carryCount(doc, row.pendiente)),
      row.pendiente.bornOn,
      isOverdue(row.pendiente, asOf) ? "sí" : "",
      row.pendiente.leadImportKey ?? row.punto.leadImportKey ?? "",
    ];
    lines.push(cells.map(csvCell).join(","));
  }
  return lines.join("\n");
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
