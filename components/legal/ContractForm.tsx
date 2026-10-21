"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FieldGrid } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { NOVEDAD_OPTIONS, SIGNER_OPTIONS, STATUS_OPTIONS, TYPE_OPTIONS, formatBytes, novedadLabel, signerLabel, statusLabel, statusTone } from "@/components/legal/labels";

type LinkDraft = { target_type: "lead" | "equipment"; target_key: string; label: string };
type SignerDraft = { role: string; signer_email: string; signer_name: string; signer_user_id: number | null };
type DirectoryUser = { id: number; email: string; role: string };
type TargetHit = { target_type: "lead" | "equipment"; target_key: string; label: string };

export type ContractInitial = {
  id: number;
  code: string | null;
  title: string;
  type: string;
  status: string;
  counterparty_name: string | null;
  counterparty_nit: string | null;
  country: string;
  start_date: string | null;
  end_date: string | null;
  renewal_notice_days: number | null;
  value_cop: number | null;
  file: { id: number; name: string; size_bytes: number } | null;
  links: LinkDraft[];
  signers: SignerDraft[];
  novedades: { id: number; kind: string; body: string; due_date: string | null; created_at: string; author_email: string | null }[];
};

export function ContractForm({
  mode,
  canEdit,
  initial,
  presetLinks = [],
}: {
  mode: "create" | "edit";
  canEdit: boolean;
  initial?: ContractInitial;
  presetLinks?: LinkDraft[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [type, setType] = useState(initial?.type ?? "comodato");
  const [status, setStatus] = useState(initial?.status ?? "draft");
  const [counterparty, setCounterparty] = useState(initial?.counterparty_name ?? "");
  const [nit, setNit] = useState(initial?.counterparty_nit ?? "");
  const [country, setCountry] = useState(initial?.country ?? "CO");
  const [startDate, setStartDate] = useState(initial?.start_date ?? "");
  const [endDate, setEndDate] = useState(initial?.end_date ?? "");
  const [notice, setNotice] = useState(initial?.renewal_notice_days?.toString() ?? "");
  const [value, setValue] = useState(initial?.value_cop?.toString() ?? "");
  const [links, setLinks] = useState<LinkDraft[]>(initial?.links ?? presetLinks);
  const [signers, setSigners] = useState<SignerDraft[]>(initial?.signers ?? []);
  const [file, setFile] = useState<File | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<{ leads: TargetHit[]; equipment: TargetHit[] }>({ leads: [], equipment: [] });
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [pending, setPending] = useState(false);
  const [noteKind, setNoteKind] = useState("nota");
  const [noteBody, setNoteBody] = useState("");
  const [noteDate, setNoteDate] = useState("");

  useEffect(() => {
    if (!canEdit) return;
    void fetch("/api/legal/targets?directory=1")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { users?: DirectoryUser[] } | null) => setUsers(body?.users ?? []));
  }, [canEdit]);

  useEffect(() => {
    if (!canEdit) return;
    const timer = window.setTimeout(() => {
      void fetch(`/api/legal/targets?q=${encodeURIComponent(query)}`)
        .then((response) => (response.ok ? response.json() : null))
        .then((body: { leads: TargetHit[]; equipment: TargetHit[] } | null) => {
          if (body) setHits(body);
        });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query, canEdit]);

  function addLink(hit: TargetHit) {
    setLinks((current) => {
      if (current.some((link) => link.target_type === hit.target_type && link.target_key === hit.target_key)) return current;
      return [...current, hit];
    });
  }

  function payload() {
    return {
      title,
      type,
      status,
      counterparty_name: counterparty,
      counterparty_nit: nit,
      country,
      start_date: startDate,
      end_date: endDate,
      renewal_notice_days: notice.trim() ? Number(notice) : null,
      value_cop: value.trim() ? Number(value) : null,
      links: links.map(({ target_type, target_key }) => ({ target_type, target_key })),
      signers: signers.map((signer) => ({
        role: signer.role,
        signer_email: signer.signer_email,
        signer_name: signer.signer_name,
        signer_user_id: signer.signer_user_id,
      })),
    };
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    setPending(true);
    try {
      if (mode === "create") {
        if (!file) {
          toast({ title: "Falta el PDF", description: "Adjunta el contrato, firmado o sin firmar.", tone: "danger" });
          return;
        }
        const form = new FormData();
        form.set("file", file);
        form.set("name", file.name);
        const data = payload();
        for (const [key, field] of Object.entries(data)) {
          if (key === "links" || key === "signers") form.set(key, JSON.stringify(field));
          else if (field != null) form.set(key, String(field));
        }
        const response = await fetch("/api/legal/contracts", { method: "POST", body: form });
        const body = (await response.json()) as { id?: number; error?: string };
        if (!response.ok || !body.id) {
          toast({ title: "No se guardó", description: body.error, tone: "danger" });
          return;
        }
        toast({ title: "Contrato guardado", tone: "ok" });
        router.push(`/legal/contratos/${body.id}`);
        router.refresh();
        return;
      }
      const response = await fetch(`/api/legal/contracts/${initial?.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast({ title: "No se guardó", description: body.error, tone: "danger" });
        return;
      }
      if (file && initial) {
        const form = new FormData();
        form.set("file", file);
        const uploaded = await fetch(`/api/legal/contracts/${initial.id}`, { method: "POST", body: form });
        const uploadedBody = (await uploaded.json()) as { error?: string };
        if (!uploaded.ok) {
          toast({ title: "Los datos se guardaron, el PDF no", description: uploadedBody.error, tone: "danger" });
          return;
        }
      }
      toast({ title: "Contrato actualizado", tone: "ok" });
      setFile(null);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function addNote() {
    if (!initial) return;
    setPending(true);
    try {
      const response = await fetch(`/api/legal/contracts/${initial.id}/novedades`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: noteKind, body: noteBody, due_date: noteDate || null }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast({ title: "No se anotó", description: body.error, tone: "danger" });
        return;
      }
      setNoteBody("");
      setNoteDate("");
      toast({ title: "Novedad anotada", tone: "ok" });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const readOnly = !canEdit;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Card>
        <CardHeader
          title={mode === "create" ? "Nuevo contrato" : initial?.code || "Contrato"}
          description="Sube el PDF a mano, también si ya está firmado. La firma dentro del CRM llega después: aquí solo se deja el orden de los firmantes."
          actions={mode === "edit" && initial ? <Badge tone={statusTone(initial.status)}>{statusLabel(initial.status)}</Badge> : undefined}
        />
        <CardBody className="space-y-4">
          <Field label="Título" htmlFor="contract-title" required>
            <Input id="contract-title" value={title} onChange={(event) => setTitle(event.target.value)} required disabled={readOnly} />
          </Field>
          <FieldGrid>
            <Field label="Tipo" htmlFor="contract-type">
              <Select id="contract-type" value={type} onChange={(event) => setType(event.target.value)} disabled={readOnly}>
                {TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
            </Field>
            <Field label="Estado" htmlFor="contract-status">
              <Select id="contract-status" value={status} onChange={(event) => setStatus(event.target.value)} disabled={readOnly}>
                {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
            </Field>
            <Field label="Cliente" htmlFor="contract-client">
              <Input id="contract-client" value={counterparty} onChange={(event) => setCounterparty(event.target.value)} disabled={readOnly} />
            </Field>
            <Field label="NIT" htmlFor="contract-nit">
              <Input id="contract-nit" value={nit} onChange={(event) => setNit(event.target.value)} disabled={readOnly} />
            </Field>
            <Field label="País" htmlFor="contract-country">
              <Select id="contract-country" value={country} onChange={(event) => setCountry(event.target.value)} disabled={readOnly}>
                {["CO", "CL", "MX", "CR"].map((code) => <option key={code} value={code}>{code}</option>)}
              </Select>
            </Field>
            <Field label="Valor (COP)" htmlFor="contract-value">
              <Input id="contract-value" inputMode="numeric" value={value} onChange={(event) => setValue(event.target.value)} disabled={readOnly} />
            </Field>
            <Field label="Inicio" htmlFor="contract-start">
              <Input id="contract-start" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} disabled={readOnly} />
            </Field>
            <Field label="Fin" htmlFor="contract-end">
              <Input id="contract-end" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} disabled={readOnly} />
            </Field>
            <Field label="Aviso de renovación (días)" htmlFor="contract-notice" hint="Si se deja vacío, el aviso es a 30 días.">
              <Input id="contract-notice" inputMode="numeric" value={notice} onChange={(event) => setNotice(event.target.value)} disabled={readOnly} />
            </Field>
          </FieldGrid>
          <Field label="PDF" htmlFor="contract-file" hint={initial?.file ? `${initial.file.name} · ${formatBytes(initial.file.size_bytes)}` : "PDF de hasta 25 MB."}>
            {readOnly && initial?.file ? (
              <a className="text-sm text-navy-2 underline" href={`/api/legal/files/${initial.file.id}`}>Ver PDF</a>
            ) : (
              <Input id="contract-file" type="file" accept="application/pdf,.pdf" disabled={readOnly} onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            )}
          </Field>
          {initial?.file && (
            <iframe title="Vista previa del contrato" src={`/api/legal/files/${initial.file.id}`} className="h-[480px] w-full rounded-lg border border-line-2 bg-surface-2" />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Vínculos" description="Un contrato puede colgar de varios negocios y equipos." />
        <CardBody className="space-y-3">
          <ul className="flex flex-wrap gap-2">
            {links.length === 0 && <li className="text-sm text-ink-3">Sin vínculos.</li>}
            {links.map((link) => (
              <li key={`${link.target_type}:${link.target_key}`}>
                <Badge tone="outline">
                  {link.target_type === "lead" ? "Negocio" : "Equipo"} · {link.label}
                  {canEdit && (
                    <button type="button" className="ml-1 text-ink-3" aria-label="Quitar vínculo" onClick={() => setLinks((current) => current.filter((item) => item !== link))}>
                      ×
                    </button>
                  )}
                </Badge>
              </li>
            ))}
          </ul>
          {canEdit && (
            <>
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar negocio o equipo" aria-label="Buscar negocio o equipo" />
              <ul className="max-h-48 space-y-1 overflow-auto">
                {[...hits.leads, ...hits.equipment].map((hit) => (
                  <li key={`${hit.target_type}:${hit.target_key}`}>
                    <button type="button" className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent-soft" onClick={() => addLink(hit)}>
                      <span className="truncate">{hit.label}</span>
                      <span className="text-xs text-ink-3">{hit.target_type === "lead" ? "Negocio" : "Equipo"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Firmantes" description="Orden sugerido: comercial, legal y gerencia. Puedes cambiarlo y agregar al cliente. Se firma en ese orden." />
        <CardBody className="space-y-3">
          {signers.map((signer, index) => (
            <div key={`${signer.role}-${index}`} className="grid gap-2 rounded-lg border border-line-2 p-3 sm:grid-cols-[120px_1fr_1fr_auto]">
              <Select
                aria-label={`Rol del firmante ${index + 1}`}
                value={signer.role}
                disabled={readOnly}
                onChange={(event) => updateSigner(index, { role: event.target.value, signer_user_id: event.target.value === "externo" ? null : signer.signer_user_id })}
              >
                {SIGNER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
              {signer.role === "externo" || readOnly ? (
                <Input aria-label="Correo del firmante" value={signer.signer_email} disabled={readOnly} onChange={(event) => updateSigner(index, { signer_email: event.target.value })} placeholder="correo@cliente.com" />
              ) : (
                <Select
                  aria-label="Usuario firmante"
                  value={signer.signer_user_id?.toString() ?? ""}
                  onChange={(event) => {
                    const user = users.find((item) => String(item.id) === event.target.value);
                    updateSigner(index, { signer_user_id: user ? user.id : null, signer_email: user?.email ?? signer.signer_email, signer_name: signer.signer_name || user?.email.split("@")[0] || "" });
                  }}
                >
                  <option value="">Elige un usuario</option>
                  {users.map((user) => <option key={user.id} value={user.id}>{user.email}</option>)}
                </Select>
              )}
              <Input aria-label="Nombre del firmante" value={signer.signer_name} disabled={readOnly} onChange={(event) => updateSigner(index, { signer_name: event.target.value })} placeholder="Nombre" />
              {canEdit && (
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Subir" onClick={() => moveSigner(index, -1)}><ArrowUp /></Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Bajar" onClick={() => moveSigner(index, 1)}><ArrowDown /></Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Quitar firmante" onClick={() => setSigners((current) => current.filter((_, item) => item !== index))}><Trash2 /></Button>
                </div>
              )}
              {readOnly && <span className="text-xs text-ink-3">{index + 1}. {signerLabel(signer.role)}</span>}
            </div>
          ))}
          {canEdit && (
            <Button type="button" variant="secondary" onClick={() => setSigners((current) => [...current, { role: "legal", signer_email: "", signer_name: "", signer_user_id: null }])}>
              <Plus /> Agregar firmante
            </Button>
          )}
        </CardBody>
      </Card>

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={pending}>{mode === "create" ? "Guardar contrato" : "Guardar cambios"}</Button>
          <Button type="button" variant="secondary" asChild><Link href="/legal">Volver</Link></Button>
        </div>
      )}

      {mode === "edit" && initial && (
        <Card>
          <CardHeader title="Novedades" description="Notas, otrosíes y avisos de este contrato." />
          <CardBody className="space-y-4">
            {initial.novedades.length === 0 && <p className="text-sm text-ink-3">Todavía no hay novedades.</p>}
            <ol className="space-y-3">
              {initial.novedades.map((note) => (
                <li key={note.id} className="rounded-lg border border-line-2 px-3 py-2">
                  <p className="text-xs text-ink-3">{novedadLabel(note.kind)} · {note.created_at.slice(0, 10)} · {note.author_email || "Equipo"}{note.due_date ? ` · vence ${note.due_date}` : ""}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{note.body}</p>
                </li>
              ))}
            </ol>
            {canEdit && (
              <div className="space-y-3 border-t border-line-2 pt-3">
                <FieldGrid>
                  <Field label="Tipo" htmlFor="note-kind">
                    <Select id="note-kind" value={noteKind} onChange={(event) => setNoteKind(event.target.value)}>
                      {NOVEDAD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </Select>
                  </Field>
                  <Field label="Fecha" htmlFor="note-date">
                    <Input id="note-date" type="date" value={noteDate} onChange={(event) => setNoteDate(event.target.value)} />
                  </Field>
                </FieldGrid>
                <Field label="Nota" htmlFor="note-body">
                  <Textarea id="note-body" value={noteBody} onChange={(event) => setNoteBody(event.target.value)} rows={3} />
                </Field>
                <Button type="button" variant="secondary" onClick={addNote} loading={pending}>Anotar novedad</Button>
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </form>
  );

  function updateSigner(index: number, patch: Partial<SignerDraft>) {
    setSigners((current) => current.map((signer, item) => (item === index ? { ...signer, ...patch } : signer)));
  }

  function moveSigner(index: number, direction: -1 | 1) {
    setSigners((current) => {
      const next = index + direction;
      if (next < 0 || next >= current.length) return current;
      const copy = [...current];
      const [row] = copy.splice(index, 1);
      copy.splice(next, 0, row);
      return copy;
    });
  }
}
