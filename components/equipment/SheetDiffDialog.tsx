"use client";

import * as React from "react";
import { Copy, FileSpreadsheet, LoaderCircle } from "lucide-react";
import type { PullPlan, PushPlan } from "@/lib/sheets/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";

type Plan = { enabled: boolean; mode: "live" | "dry-run"; push: PushPlan; pull: PullPlan };

function summaryText(plan: Plan): string {
  const lines = [
    `Comparación con la hoja "Listado Equipos" · modo ${plan.mode === "live" ? "en vivo" : "simulación"}.`,
    plan.enabled ? "La hoja es la fuente al traer. Enviar escribe solo las celdas distintas, por serial." : "La sincronización está apagada: este resumen no escribe.",
    `Hacia la hoja: ${plan.push.updates.length} actualizaciones · ${plan.push.inserts.length} altas · ${plan.push.deletes.length} bajas (nunca se borran filas)`,
    `Desde la hoja: ${plan.pull.updates.length} equipos distintos · ${plan.pull.inserts.length} seriales que faltan aquí · ${plan.pull.localOnly.length} solo en el CRM`,
  ];
  for (const update of plan.push.updates) {
    for (const change of update.changes) lines.push(`${update.serial} · fila ${update.rowNumber} · ${change.column}: "${change.from}" → "${change.to}"`);
  }
  if (plan.push.inserts.length) lines.push(`Altas (filas nuevas): ${plan.push.inserts.map((insert) => insert.serial).join(", ")}`);
  for (const note of plan.push.formulaNotes) lines.push(`${note.serial} · ${note.column} es fórmula en la hoja; el valor local es ${note.localValue} (no se escribe)`);
  return lines.join("\n");
}

/** Muestra qué celdas cambiarían en la hoja de Google. Solo lee: nunca escribe. */
export function SheetDiffDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const [plan, setPlan] = React.useState<Plan | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [syncing, setSyncing] = React.useState<"pull" | "push" | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch("/api/comodatos?view=sync", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("El servidor no pudo calcular la comparación.");
        setPlan((await response.json()) as Plan);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "No se pudo calcular la comparación.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open]);

  async function copy() {
    if (!plan) return;
    try {
      await navigator.clipboard.writeText(summaryText(plan));
      toast({ title: "Resumen copiado", description: "Nada se escribió en la hoja." });
    } catch {
      toast({ tone: "danger", title: "No se pudo copiar", description: "El navegador bloqueó el portapapeles." });
    }
  }

  const changes = plan ? plan.push.updates.flatMap((update) => update.changes.map((change) => ({ ...change, serial: update.serial, rowNumber: update.rowNumber }))) : [];
  const nothing = plan && changes.length === 0 && plan.push.inserts.length === 0 && plan.pull.updates.length === 0 && plan.pull.inserts.length === 0;

  async function sync(direction: "pull" | "push") {
    setSyncing(direction);
    try {
      const response = await fetch("/api/comodatos/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
      });
      const body = (await response.json()) as { error?: string; written?: boolean; reason?: string };
      if (!response.ok) throw new Error(body.error || "No se pudo sincronizar.");
      toast({
        title: body.written ? (direction === "pull" ? "Hoja aplicada" : "Hoja actualizada") : "Sin escritura",
        description: body.reason,
        tone: body.written ? "ok" : "info",
      });
      if (body.written) onOpenChange(false);
    } catch (cause) {
      toast({ title: "No se pudo sincronizar", description: cause instanceof Error ? cause.message : "Error", tone: "danger" });
    } finally {
      setSyncing(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="xl"
        title="Comparar con la hoja de Google"
        description="Compara “Listado Equipos” por serial. Traer aplica la hoja al CRM. Enviar escribe solo las celdas distintas y nunca borra filas ni toca las fórmulas (Codigo Tienda, idnum). Con la sincronización apagada no hay escritura."
      >
        <DialogBody className="space-y-4">
          {loading && (
            <p className="flex items-center gap-2 py-8 text-sm text-ink-3">
              <LoaderCircle className="size-4 animate-spin" /> Comparando con la hoja…
            </p>
          )}
          {error && (
            <EmptyState compact title="No se pudo comparar" description={error} action={<Button variant="secondary" onClick={() => onOpenChange(false)}>Cerrar</Button>} />
          )}
          {plan && !loading && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge tone={plan.mode === "live" ? "info" : "neutral"} dot>
                  {plan.mode === "live" ? "Sincronización en vivo" : "Simulación · sincronización apagada"}
                </Badge>
                <Badge tone={plan.push.updates.length ? "warn" : "ok"}>
                  {plan.push.updates.length} {plan.push.updates.length === 1 ? "actualización" : "actualizaciones"}
                </Badge>
                <Badge tone={plan.push.inserts.length ? "info" : "neutral"}>
                  {plan.push.inserts.length} {plan.push.inserts.length === 1 ? "alta" : "altas"}
                </Badge>
                <Badge tone="neutral">0 bajas · nunca se borran filas</Badge>
                <Badge tone={plan.pull.updates.length || plan.pull.inserts.length ? "warn" : "neutral"}>
                  {plan.pull.updates.length + plan.pull.inserts.length} desde la hoja
                </Badge>
              </div>

              {nothing ? (
                <EmptyState compact icon={<FileSpreadsheet />} title="Sin diferencias" description="La hoja y el CRM dicen lo mismo. Al editar un equipo aquí, aparecerá qué celda cambiaría." />
              ) : (
                <>
                  {changes.length > 0 && (
                    <TableWrap className="shadow-none">
                      <Table className="min-w-[640px]">
                        <THead>
                          <tr>
                            <TH>Serial</TH>
                            <TH align="right">Fila</TH>
                            <TH>Columna</TH>
                            <TH>De</TH>
                            <TH>A</TH>
                          </tr>
                        </THead>
                        <TBody>
                          {changes.map((change, index) => (
                            <TR key={`${change.serial}-${change.column}-${index}`}>
                              <TD className="num font-medium text-ink">{change.serial}</TD>
                              <TD align="right">{change.rowNumber}</TD>
                              <TD className="text-ink-2">{change.column}</TD>
                              <TD className="max-w-[220px] truncate text-ink-3" title={change.from}>
                                {change.from || <span className="italic">vacío</span>}
                              </TD>
                              <TD className="max-w-[220px] truncate" title={change.to}>
                                {change.to || <span className="italic text-ink-3">vacío</span>}
                              </TD>
                            </TR>
                          ))}
                        </TBody>
                      </Table>
                    </TableWrap>
                  )}
                  {plan.push.inserts.length > 0 && (
                    <div className="text-sm">
                      <p className="font-medium text-ink">Filas nuevas (equipos creados aquí que no están en la hoja)</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {plan.push.inserts.map((insert) => (
                          <Badge key={insert.serial} tone="info">
                            {insert.serial}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {plan.push.formulaNotes.length > 0 && (
                <div className="rounded-lg bg-amarillo/60 px-3.5 py-2.5 text-xs text-hl-ink">
                  <p className="font-medium">Columnas de fórmula que no se escriben</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {plan.push.formulaNotes.slice(0, 20).map((note, index) => (
                      <li key={`${note.serial}-${note.column}-${index}`}>
                        {note.serial} · {note.column}: el valor local es <span className="num">{note.localValue}</span>; la hoja lo recalcula sola.
                      </li>
                    ))}
                    {plan.push.formulaNotes.length > 20 && <li>y {plan.push.formulaNotes.length - 20} más.</li>}
                  </ul>
                </div>
              )}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button variant="secondary" onClick={() => void sync("pull")} disabled={!plan || loading || syncing != null} loading={syncing === "pull"}>
            Traer de la hoja
          </Button>
          <Button variant="secondary" onClick={() => void sync("push")} disabled={!plan || loading || syncing != null} loading={syncing === "push"}>
            Enviar cambios
          </Button>
          <Button onClick={() => void copy()} disabled={!plan || loading}>
            <Copy /> Copiar resumen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
