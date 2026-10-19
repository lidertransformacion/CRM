import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { ArrowLeft, ClipboardList, Pencil, Wrench } from "lucide-react";
import { costFor, equipmentHistory, getEquipment, hourlyRate, maintenanceLogs } from "@/lib/db";
import { siteById, statusLabel } from "@/lib/equipment/catalog";
import { nextMaintenanceFor } from "@/lib/equipment/queries";
import type { WarrantyState } from "@/lib/equipment/warranty";
import { cop, displaySeller, todayIso } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { MaintenanceDialog } from "@/components/equipment/MaintenanceDialog";
import { CONDITION_TONE, HISTORY_FIELD_LABELS, MAINTENANCE_KIND_TONE, STATUS_TONE, dateLabel, maintenanceBadge, warrantyBadge } from "@/components/equipment/model";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ serial: string }> }): Promise<Metadata> {
  const { serial } = await params;
  const equipment = getEquipment(decodeURIComponent(serial));
  return { title: equipment ? `${equipment.store_code} · ${equipment.name}` : "Equipo" };
}

export default async function LifeSheet({ params }: { params: Promise<{ serial: string }> }) {
  const { serial } = await params;
  const decoded = decodeURIComponent(serial);
  const equipment = getEquipment(decoded);
  if (!equipment) notFound();

  const today = todayIso();
  const history = equipmentHistory(decoded);
  const logs = maintenanceLogs(decoded);
  const rate = hourlyRate();
  const cost = costFor(equipment, rate);
  const next = nextMaintenanceFor(equipment);
  const maintenance = maintenanceBadge(next, today);
  const warranty = warrantyBadge(equipment.warranty_until, equipment.warranty_state as WarrantyState, today);

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") || headerList.get("host") || "127.0.0.1";
  const proto = headerList.get("x-forwarded-proto") || "http";
  const url = `${proto}://${host}/comodatos/${encodeURIComponent(equipment.serial)}`;
  const qr = await QRCode.toString(url, { type: "svg", margin: 1, width: 180 });

  const editHref = `/comodatos?editar=${encodeURIComponent(equipment.serial)}`;

  return (
    <div className="page">
      <PageHeader
        eyebrow={`Hoja de vida · ${equipment.store_code} · ${equipment.asset_number}`}
        title={equipment.name}
        description={`Serial ${equipment.serial} · ${equipment.category}`}
        actions={
          <>
            <Link href="/comodatos" className={buttonVariants({ variant: "secondary" })}>
              <ArrowLeft /> Volver a equipos
            </Link>
            <Link href={editHref} className={buttonVariants({ variant: "secondary" })}>
              <Pencil /> Editar equipo
            </Link>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_TONE[equipment.status] ?? "neutral"} dot>
            {statusLabel(equipment.status)}
          </Badge>
          <Badge tone={warranty.tone}>Garantía: {warranty.label.toLowerCase()}</Badge>
          {maintenance.tone !== "neutral" && <Badge tone={maintenance.tone}>Mantenimiento: {maintenance.label.toLowerCase()}</Badge>}
        </div>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <Card>
          <CardHeader title="Datos del equipo" description="Lo que figura en la hoja de Google más lo registrado aquí." />
          <CardBody>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <Info label="Sede" value={siteById(equipment.site_id)?.name ?? equipment.site_id} />
              <Info label="Cliente" value={equipment.client_name || "Sin cliente"} muted={!equipment.client_name} />
              <Info label="Dirección" value={[equipment.address, equipment.city].filter(Boolean).join(", ") || "—"} muted={!equipment.address} />
              <Info label="Entrega" value={equipment.delivered_on ? dateLabel(equipment.delivered_on, today) : "Sin fecha"} muted={!equipment.delivered_on} />
              <Info label="Vendedor" value={displaySeller(equipment.salesperson)} muted={!equipment.salesperson} />
              <Info label="Proveedor" value={[equipment.supplier, equipment.supplier_reference].filter(Boolean).join(" · ") || "—"} muted={!equipment.supplier} />
              <Info label="Modelo" value={equipment.model || "—"} muted={!equipment.model} />
              <Info label="Garantía" value={<Badge tone={warranty.tone}>{warranty.label}</Badge>} />
              <Info
                label="Próximo mantenimiento"
                value={
                  <span className="inline-flex flex-wrap items-center gap-2">
                    {next && <span className="num">{dateLabel(next, today)}</span>}
                    {maintenance.tone !== "neutral" && <Badge tone={maintenance.tone}>{maintenance.label}</Badge>}
                  </span>
                }
                hint={
                  equipment.maintenance_every_days
                    ? next
                      ? `Cada ${equipment.maintenance_every_days} días desde ${logs[0] ? "el último mantenimiento" : "la entrega"}`
                      : `Cada ${equipment.maintenance_every_days} días; registra un mantenimiento o la fecha de entrega para calcularlo`
                    : "Sin frecuencia definida"
                }
              />
              <Info
                label="Costo anual estimado"
                value={cost ? <span className="num">{cop(cost.annualCost)}</span> : "—"}
                hint={cost ? `${cost.visitsPerYear.toFixed(1)} visitas de ${cost.hours} h a ${cop(rate)}/hora` : "Falta frecuencia u horas"}
              />
              {equipment.notes && <Info label="Notas" value={<span className="whitespace-pre-wrap">{equipment.notes}</span>} className="sm:col-span-2" />}
            </dl>
          </CardBody>
        </Card>

        <Card className="h-max">
          <CardBody className="flex flex-col items-center text-center">
            <div className="w-full max-w-[180px] rounded-lg border border-line-2 bg-white p-2 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} />
            <p className="mt-3 text-sm font-medium text-ink">Escanea para abrir esta hoja</p>
            <p className="mt-1 break-all text-xs text-ink-3">{url}</p>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Mantenimientos"
          description={logs.length ? `${logs.length} ${logs.length === 1 ? "visita registrada" : "visitas registradas"} · costo de visita = horas × tarifa + repuestos` : "Cada visita suma a la hoja de vida y mueve el próximo mantenimiento."}
          actions={<MaintenanceDialog serial={equipment.serial} today={today} rate={rate} />}
        />
        {logs.length === 0 ? (
          <EmptyState compact icon={<Wrench />} title="Sin mantenimientos registrados" description="Usa “Registrar mantenimiento” después de cada visita preventiva o correctiva." />
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[820px]">
              <THead>
                <tr>
                  <TH>Fecha</TH>
                  <TH>Tipo</TH>
                  <TH align="right">Horas</TH>
                  <TH align="right">Costo</TH>
                  <TH>Técnico</TH>
                  <TH>Estado posterior</TH>
                  <TH>Notas</TH>
                </tr>
              </THead>
              <TBody>
                {logs.map((log) => (
                  <TR key={log.id}>
                    <TD className="num whitespace-nowrap">{dateLabel(log.performed_on, today)}</TD>
                    <TD>
                      <Badge tone={MAINTENANCE_KIND_TONE[log.kind] ?? "neutral"}>{log.kind === "preventivo" ? "Preventivo" : log.kind === "correctivo" ? "Correctivo" : log.kind}</Badge>
                    </TD>
                    <TD align="right">{log.hours} h</TD>
                    <TD align="right">{cop(log.visit_cost)}</TD>
                    <TD className="text-ink-2">{log.technician || "—"}</TD>
                    <TD>{log.condition_after ? <Badge tone={CONDITION_TONE[log.condition_after] ?? "neutral"}>{log.condition_after}</Badge> : "—"}</TD>
                    <TD className="max-w-[320px] text-ink-2">{log.notes || "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader title="Historial de cambios" description="Sede, cliente, estado, vendedor, entrega, código de tienda y mantenimientos, en orden del más reciente." />
        <CardBody>
          {history.length === 0 ? (
            <EmptyState compact icon={<ClipboardList />} title="Sin cambios registrados" description="Cuando edites la sede, el cliente o el estado, o registres un mantenimiento, quedará aquí." />
          ) : (
            <ol className="timeline space-y-4">
              {history.map((event) => (
                <li key={event.id} className="relative text-sm">
                  <span className="timeline-dot" aria-hidden />
                  <p className="font-medium text-ink">{HISTORY_FIELD_LABELS[event.field] ?? event.field}</p>
                  <p className="text-ink-2">
                    {event.field === "alta" || event.field === "mantenimiento" ? (
                      <span>{event.to_value || "—"}</span>
                    ) : (
                      <>
                        <span className={event.from_value ? "" : "italic text-ink-3"}>{event.from_value || "vacío"}</span>
                        <span className="mx-1.5 text-ink-3">→</span>
                        <span className={event.to_value ? "font-medium" : "italic text-ink-3"}>{event.to_value || "vacío"}</span>
                      </>
                    )}
                  </p>
                  <p className="text-xs text-ink-3">{historyMoment(event.at, today)}</p>
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

/** "14 oct · 09:35" en la hora local del servidor (los eventos se guardan en UTC). */
function historyMoment(at: string, today: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return at;
  return `${dateLabel(todayIso(date), today)} · ${date.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
}

function Info({ label, value, hint, muted, className }: { label: string; value: React.ReactNode; hint?: string; muted?: boolean; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium text-ink-3">{label}</dt>
      <dd className={muted ? "text-ink-3" : "text-ink"}>{value}</dd>
      {hint && <dd className="mt-0.5 text-xs text-ink-3">{hint}</dd>}
    </div>
  );
}
