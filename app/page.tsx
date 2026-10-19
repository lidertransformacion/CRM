import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { AttentionStats } from "@/components/home/AttentionStats";
import { CommitteeCard } from "@/components/home/CommitteeCard";
import { EquipmentCard } from "@/components/home/EquipmentCard";
import { LeadsCard } from "@/components/home/LeadsCard";
import { LinkButton } from "@/components/home/LinkButton";
import { PendientesCard } from "@/components/home/PendientesCard";
import { SearchShortcut } from "@/components/home/SearchShortcut";
import { PageHeader } from "@/components/ui/page-header";
import { weekdayLongDate } from "@/lib/home/format";
import { homeData, summaryLine } from "@/lib/home/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Inicio" };

/** Inicio: responde "¿qué requiere mi atención hoy?" con indicadores y listas que llevan a donde se resuelve cada cosa. */
export default async function HomePage() {
  const data = await homeData();
  return (
    <div className="page">
      <PageHeader
        eyebrow="Comercial"
        title="Hoy"
        description={`${weekdayLongDate(data.asOf)}. ${summaryLine(data)}`}
        // En móvil el bloque de acciones ocupa toda la fila para que los dos accesos se repartan el ancho.
        className="max-sm:[&>div:first-child>div:last-child]:w-full"
        actions={
          <>
            <SearchShortcut className="max-sm:flex-1" />
            <LinkButton href="/comodatos?nuevo=1" variant="secondary" className="max-sm:flex-1">
              <Plus />
              Nuevo equipo
            </LinkButton>
          </>
        }
      />

      <AttentionStats data={data} />

      <section className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3" aria-label="Comité en curso">
        <div className="min-w-0 lg:col-span-2">
          <PendientesCard rows={data.pendientes.rows} total={data.pendientes.total} committeeNumber={data.committee.number} />
        </div>
        <CommitteeCard committee={data.committee} asOf={data.asOf} />
      </section>

      <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2" aria-label="Pipeline y equipos">
        <LeadsCard rows={data.leads.rows} total={data.leads.total} />
        <EquipmentCard summary={data.equipment} />
      </section>
    </div>
  );
}
