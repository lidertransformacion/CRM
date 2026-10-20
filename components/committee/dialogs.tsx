"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Copy, Link2, Send, Unlink } from "lucide-react";
import { buildCommitteeEmail } from "@/lib/committee/email";
import { RecipientFields, type MailFavorite } from "@/components/committee/RecipientFields";
import { boardStats } from "@/lib/committee/metrics";
import type { CommitteeDoc } from "@/lib/committee/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { longDate, shortDate } from "@/lib/utils";
import { plural } from "@/components/committee/helpers";

/* ── Correo resumen ─────────────────────────────────────────────────────── */

export function EmailDialog({ open, onOpenChange, doc, asOf }: { open: boolean; onOpenChange: (open: boolean) => void; doc: CommitteeDoc; asOf: string }) {
  const { toast } = useToast();
  const email = useMemo(() => buildCommitteeEmail(doc, asOf), [doc, asOf]);
  const [copied, setCopied] = useState<"subject" | "body" | null>(null);
  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [users, setUsers] = useState<{ email: string }[]>([]);
  const [favorites, setFavorites] = useState<MailFavorite[]>([]);
  const [testMode, setTestMode] = useState(true);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [savingFavorite, setSavingFavorite] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);

  useEffect(() => {
    if (!open) {
      setCopied(null);
      setNotice(null);
      return;
    }
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/mail/favorites", { signal: controller.signal });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          favorites: MailFavorite[];
          users: { email: string }[];
          testMode: boolean;
          gmailConnected: boolean;
        };
        setFavorites(payload.favorites);
        setUsers(payload.users);
        setTestMode(payload.testMode !== false);
        setGmailConnected(payload.gmailConnected === true);
      } catch {
        /* el diálogo sigue permitiendo escribir correos a mano */
      }
    })();
    return () => controller.abort();
  }, [open]);

  async function copy(kind: "subject" | "body") {
    try {
      if (kind === "subject") {
        await navigator.clipboard.writeText(email.subject);
      } else if (typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([email.html], { type: "text/html" }),
            "text/plain": new Blob([email.text], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(email.text);
      }
      setCopied(kind);
      toast({ title: kind === "subject" ? "Asunto copiado" : "Correo copiado con la tabla" });
    } catch {
      toast({ title: "No se pudo copiar", description: "El navegador bloqueó el portapapeles. Selecciona el texto del correo y cópialo a mano.", tone: "danger" });
    }
  }

  async function saveFavorite(name: string) {
    setSavingFavorite(true);
    try {
      const response = await fetch("/api/mail/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, to, cc }),
      });
      const payload = (await response.json()) as { favorite?: MailFavorite; error?: string };
      if (!response.ok || !payload.favorite) throw new Error(payload.error || "No se pudo guardar.");
      const favorite = payload.favorite;
      setFavorites((current) => [...current.filter((item) => item.id !== favorite.id), favorite].sort((a, b) => a.name.localeCompare(b.name, "es")));
      toast({ title: "Favorito guardado", description: favorite.name });
    } catch (error) {
      toast({ title: "No se pudo guardar el favorito", description: error instanceof Error ? error.message : undefined, tone: "danger" });
      throw error;
    } finally {
      setSavingFavorite(false);
    }
  }

  async function deleteFavorite(id: number) {
    const previous = favorites;
    setFavorites((current) => current.filter((item) => item.id !== id));
    try {
      const response = await fetch(`/api/mail/favorites/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "No se pudo quitar.");
      }
      toast({ title: "Favorito quitado" });
    } catch (error) {
      setFavorites(previous);
      toast({ title: "No se pudo quitar el favorito", description: error instanceof Error ? error.message : undefined, tone: "danger" });
    }
  }

  async function send() {
    setSending(true);
    setNotice(null);
    try {
      const response = await fetch("/api/committee/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ committeeNumber: doc.committee.number, to, cc, asOf }),
      });
      const payload = (await response.json()) as { status?: string; testMode?: boolean; mode?: string; error?: string | null };
      if (!response.ok) throw new Error(payload.error || "No se pudo enviar.");
      if (payload.status === "sent") {
        const text = payload.testMode !== false ? "Enviado en modo de prueba. Llegó a la cuenta que envía, no a los destinatarios." : "Enviado a los destinatarios.";
        setNotice({ tone: "ok", text });
        toast({ title: "Resumen enviado", description: text });
      } else if (payload.status === "queued" && !payload.error) {
        const text = payload.mode === "log" ? "Quedó en la bandeja. El modo registro no entrega el correo." : "Quedó en la bandeja y se enviará en el siguiente proceso.";
        setNotice({ tone: "ok", text });
        toast({ title: "Resumen encolado", description: text });
      } else {
        throw new Error(payload.error || "No se pudo enviar.");
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : "No se pudo enviar.";
      setNotice({ tone: "danger", text });
      toast({ title: "No se pudo enviar", description: text, tone: "danger" });
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" title="Correo resumen del comité" description="Se envía desde tu Gmail. Si no está conectado, sale del buzón compartido. La tabla y las filas en rojo se mantienen.">
        <DialogBody className="space-y-4">
          {testMode && (
            <p className="rounded-md bg-amarillo px-3 py-2 text-sm text-ink">Modo de prueba activo. El resumen no llega a los destinatarios: llega a la cuenta que envía.</p>
          )}
          {!gmailConnected && <p className="text-xs text-ink-3">Gmail no está conectado en esta cuenta. El envío usa el buzón compartido.</p>}
          {notice && (
            <p className={notice.tone === "ok" ? "rounded-md bg-ok-soft px-3 py-2 text-sm text-ok" : "rounded-md bg-danger-soft px-3 py-2 text-sm text-danger"} role="status">
              {notice.text}
            </p>
          )}
          <Field label="Asunto" htmlFor="email-subject">
            <div className="flex gap-2">
              <Input id="email-subject" readOnly value={email.subject} onFocus={(event) => event.currentTarget.select()} />
              <Button variant="secondary" onClick={() => copy("subject")}>
                <Copy /> {copied === "subject" ? "Copiado" : "Copiar"}
              </Button>
            </div>
          </Field>
          <RecipientFields
            to={to}
            cc={cc}
            onToChange={setTo}
            onCcChange={setCc}
            users={users}
            favorites={favorites}
            savingFavorite={savingFavorite}
            onApplyFavorite={(favorite) => {
              setTo(favorite.to);
              setCc(favorite.cc);
            }}
            onSaveFavorite={saveFavorite}
            onDeleteFavorite={deleteFavorite}
          />
          <Field label="Cuerpo del correo" hint="Vista previa de lo que se envía. Las filas en rojo son pendientes con 2 o más comités.">
            <div className="email-preview max-h-[36vh] overflow-auto rounded-lg border border-line bg-surface p-4 max-sm:max-h-none max-sm:p-3" dangerouslySetInnerHTML={{ __html: email.html }} />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cerrar</Button>
          <Button variant="secondary" onClick={() => copy("body")}>
            <Copy /> {copied === "body" ? "Copiado" : "Copiar correo con tabla"}
          </Button>
          <Button onClick={() => void send()} disabled={!to.length} loading={sending}>
            <Send /> Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Nuevo comité ───────────────────────────────────────────────────────── */

export function NewCommitteeDialog({
  open,
  onOpenChange,
  doc,
  asOf,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doc: CommitteeDoc;
  asOf: string;
  onCreate: (heldOn: string) => void;
}) {
  const [heldOn, setHeldOn] = useState(asOf);
  const stats = boardStats(doc, asOf);
  const next = doc.committee.number + 1;
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(heldOn);

  useEffect(() => {
    if (open) setHeldOn(asOf);
  }, [open, asOf]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" title={`Crear comité #${next}`} description={`El comité #${doc.committee.number} del ${longDate(doc.committee.heldOn)} queda archivado tal como está.`}>
        <DialogBody className="space-y-4">
          <Field label="Fecha del comité" htmlFor="next-held-on" required>
            <Input id="next-held-on" type="date" value={heldOn} onChange={(event) => setHeldOn(event.target.value)} aria-invalid={!valid} />
          </Field>
          <ul className="space-y-1.5 rounded-lg bg-surface-2 px-3 py-2.5 text-xs text-ink-2">
            <li className="flex items-center gap-2"><Badge tone="info" size="sm">{stats.open}</Badge> pendientes abiertos pasan al comité nuevo y suman un comité de arrastre</li>
            <li className="flex items-center gap-2"><Badge tone="ok" size="sm">{stats.closed}</Badge> pendientes cerrados quedan en el historial del comité #{doc.committee.number}</li>
          </ul>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={!valid}
            onClick={() => {
              onCreate(heldOn);
              onOpenChange(false);
            }}
          >
            Crear comité #{next}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Vincular oportunidad del pipeline ──────────────────────────────────── */

type LeadRow = { import_key: string; name: string; customer: string; stage: string; salesperson?: string };

export function LeadLinkDialog({
  open,
  onOpenChange,
  current,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: string | null;
  onPick: (key: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setRows([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const term = query.trim();
    if (!term) {
      setRows([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/leads?q=${encodeURIComponent(term)}`, { signal: controller.signal });
        const payload = (await response.json()) as { leads: LeadRow[] };
        setRows(payload.leads);
      } catch {
        /* búsqueda cancelada o sin red: se deja la lista anterior */
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" title="Vincular oportunidad" description="Busca por cliente, oportunidad o vendedor del pipeline Pay Line.">
        <DialogBody className="space-y-3">
          <SearchInput value={query} onChange={setQuery} placeholder="Cliente u oportunidad" autoFocus aria-label="Buscar oportunidad" />
          {current && (
            <p className="flex items-center gap-2 text-xs text-ink-2">
              <Badge tone="info"><Link2 className="size-3" /> Vinculado</Badge> Al elegir otra, se reemplaza el vínculo.
            </p>
          )}
          <div className="max-h-72 space-y-1 overflow-auto max-sm:max-h-none" role="listbox" aria-label="Resultados">
            {rows.map((row) => (
              <button
                key={row.import_key}
                type="button"
                role="option"
                aria-selected={row.import_key === current}
                className="block w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent-soft focus-visible:bg-accent-soft max-sm:py-3"
                onClick={() => onPick(row.import_key)}
              >
                <span className="block font-medium text-ink">{row.customer || row.name}</span>
                <span className="block text-xs text-ink-3">{row.name} · {row.stage}</span>
              </button>
            ))}
            {!rows.length && (
              <EmptyState
                compact
                icon={<Link2 />}
                title={loading ? "Buscando…" : query.trim() ? "Sin resultados" : "Escribe para buscar"}
                description={query.trim() && !loading ? "Prueba con otra palabra del nombre del cliente." : "El vínculo lleva al detalle de la oportunidad en el pipeline."}
              />
            )}
          </div>
        </DialogBody>
        <DialogFooter className="justify-between">
          {current ? (
            <Button variant="danger-soft" onClick={() => onPick(null)}>
              <Unlink /> Quitar vínculo
            </Button>
          ) : (
            <span />
          )}
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Anexar enlace a un punto ───────────────────────────────────────────── */

export function AttachLinkDialog({ open, onOpenChange, onAdd }: { open: boolean; onOpenChange: (open: boolean) => void; onAdd: (label: string, url: string) => void }) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (!open) {
      setLabel("");
      setUrl("");
    }
  }, [open]);

  const canAdd = label.trim().length > 0 || url.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" title="Anexar enlace" description="Un documento, cronograma o carpeta relacionado con este punto.">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!canAdd) return;
            onAdd(label, url);
            onOpenChange(false);
          }}
        >
          <DialogBody className="space-y-3">
            <Field label="Nombre" htmlFor="link-label" required>
              <Input id="link-label" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Cronograma de implementación" autoFocus />
            </Field>
            <Field label="Dirección (URL)" htmlFor="link-url" hint="Opcional: si no hay enlace, queda solo el nombre.">
              <Input id="link-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://" />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={!canAdd}>Anexar enlace</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Cambiar comité de origen ───────────────────────────────────────────── */

export function OriginDialog({
  open,
  onOpenChange,
  doc,
  current,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doc: CommitteeDoc;
  current: number;
  onSave: (number: number) => void;
}) {
  const [value, setValue] = useState(current);
  useEffect(() => {
    if (open) setValue(current);
  }, [open, current]);

  const options = doc.calendar.filter((entry) => entry.number <= doc.committee.number).sort((a, b) => b.number - a.number);
  const carry = doc.committee.number - value;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" title="Cambiar comité de origen" description="El arrastre se calcula como comité actual menos comité de origen. Úsalo para corregir pendientes que vienen de antes.">
        <DialogBody className="space-y-3">
          <Field label="Comité en el que nació" htmlFor="origin-select">
            <Select id="origin-select" value={value} onChange={(event) => setValue(Number(event.target.value))}>
              {options.map((entry) => (
                <option key={entry.number} value={entry.number}>
                  Comité #{entry.number} · {shortDate(entry.heldOn)}
                </option>
              ))}
            </Select>
          </Field>
          <p className="text-xs text-ink-2">
            Quedará con{" "}
            <Badge tone={carry >= 2 ? "danger" : carry === 1 ? "warn" : "neutral"} size="sm">{carry <= 0 ? "Nuevo" : plural(carry, "comité", "comités")}</Badge>{" "}
            de arrastre.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => {
              onSave(value);
              onOpenChange(false);
            }}
          >
            Guardar origen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Confirmación genérica (eliminar) ───────────────────────────────────── */

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" title={title} description={description}>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            variant="danger"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
