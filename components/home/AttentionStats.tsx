import { Stat, StatGrid } from "@/components/ui/stat";
import { compactCop, plural } from "@/lib/home/format";
import { SOON_DAYS, type HomeData } from "@/lib/home/queries";

/**
 * Los cinco indicadores de Inicio. Cada uno lleva a la pantalla donde se resuelve.
 * En móvil los cuatro urgentes van en 2 × 2 y el ingreso esperado ocupa una fila ancha debajo.
 */
export function AttentionStats({ data }: { data: HomeData }) {
  const { committee, leads, equipment, revenue } = data;
  const warranties = equipment.warrantyExpired + equipment.warrantyExpiring;
  return (
    <StatGrid>
      <Stat
        label="Pendientes vencidos"
        value={committee.overdue}
        tone={committee.overdue ? "danger" : "ok"}
        hint={`Comité ${committee.number} · ${plural(committee.open, "abierto")}`}
        href="/comites"
      />
      <Stat
        label="Pendientes arrastrados"
        value={committee.carried}
        tone={committee.carried ? "danger" : "ok"}
        hint="Llevan 2 o más comités sin cerrarse"
        href="/comites"
      />
      <Stat
        label="Oportunidades con actividad vencida"
        value={leads.total}
        tone={leads.total ? "danger" : "ok"}
        hint="En etapas abiertas del pipeline"
        href="/pipeline"
      />
      <Stat
        label="Garantías vencidas o por vencer"
        value={warranties}
        tone={equipment.warrantyExpired ? "danger" : equipment.warrantyExpiring ? "warn" : "ok"}
        hint={`${plural(equipment.warrantyExpired, "vencida")} · ${equipment.warrantyExpiring} vencen en ${SOON_DAYS} días`}
        href="/comodatos"
      />
      <Stat
        label="Ingreso esperado abierto"
        value={compactCop(revenue.expected)}
        tone="info"
        hint={`${plural(revenue.openCount, "oportunidad abierta", "oportunidades abiertas")} · ponderado ${compactCop(revenue.weighted)}`}
        href="/kpis"
        className="max-sm:col-span-2"
      />
    </StatGrid>
  );
}
