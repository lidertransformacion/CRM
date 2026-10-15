"use client";

import { useState } from "react";
import { renderTemplate, type EmailTemplate } from "@/lib/emails/templates";
import { cop, displaySeller } from "@/lib/utils";

type Lead = { import_key: string; name: string; customer: string; salesperson: string; stage: string; expected_revenue: number | null };

export function Drafts({ templates }: { templates: EmailTemplate[] }) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [q, setQ] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [lead, setLead] = useState<Lead | null>(null);
  const template = templates.find((item) => item.id === templateId) ?? templates[0];
  const draft = template
    ? renderTemplate(template, {
        cliente: lead?.customer || "el cliente",
        oportunidad: lead?.name || "la oportunidad",
        vendedor: displaySeller(lead?.salesperson),
        ingreso: lead?.expected_revenue ? cop(lead.expected_revenue) : "por confirmar",
        etapa: lead?.stage || "la etapa actual",
        fecha: "",
      })
    : { subject: "", body: "" };
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [copied, setCopied] = useState(false);
  const shownSubject = subject || draft.subject;
  const shownBody = body || draft.body;

  return (
    <main className="mx-auto grid max-w-5xl gap-4 px-4 py-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <section>
        <p className="text-xs tracking-[0.16em] text-[#98a2b3]">COMERCIAL</p>
        <h1 className="font-serif text-4xl">Correos</h1>
        <p className="mt-2 text-sm text-[#667085]">Solo se copia un borrador. Este módulo no envía correos.</p>
        <div className="mt-3 space-y-2">
          {templates.map((item) => (
            <button key={item.id} onClick={() => { setTemplateId(item.id); setSubject(""); setBody(""); }} className={`block w-full rounded-2xl px-3 py-2 text-left text-sm ${item.id === template?.id ? "bg-[var(--navy)] text-white" : "bg-white"}`}>
              {item.name}
            </button>
          ))}
        </div>
      </section>
      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <input className="h-10 w-full rounded-xl border px-3 text-sm" placeholder="Buscar oportunidad" value={q} onChange={async (event) => {
          setQ(event.target.value);
          const response = await fetch(`/api/leads?q=${encodeURIComponent(event.target.value)}`);
          const payload = (await response.json()) as { leads: Lead[] };
          setLeads(payload.leads);
        }} />
        {leads.length > 0 && (
          <div className="mt-2 max-h-36 overflow-auto">
            {leads.map((item) => (
              <button key={item.import_key} className="block w-full py-1 text-left text-sm" onClick={() => { setLead(item); setSubject(""); setBody(""); setLeads([]); }}>
                {item.customer || item.name}
              </button>
            ))}
          </div>
        )}
        <label className="mt-4 block text-xs text-[#667085]">Asunto
          <input className="mt-1 h-10 w-full rounded-xl border px-3 text-sm text-[var(--ink)]" value={shownSubject} onChange={(event) => setSubject(event.target.value)} />
        </label>
        <textarea className="mt-3 min-h-72 w-full rounded-2xl border p-3 text-sm" value={shownBody} onChange={(event) => setBody(event.target.value)} />
        <button className="mt-3 rounded-full bg-[var(--blue)] px-4 py-2 text-sm text-white" onClick={async () => {
          await navigator.clipboard.writeText(`Asunto: ${shownSubject}\n\n${shownBody}`);
          setCopied(true);
        }}>{copied ? "Copiado" : "Copiar borrador"}</button>
      </section>
    </main>
  );
}
