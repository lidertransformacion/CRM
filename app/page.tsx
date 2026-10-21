import type { Metadata } from "next";
import { Plus } from "lucide-react";
import Link from "next/link";
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
import { requirePageUser } from "@/lib/auth/page-session";
import type { SessionPayload } from "@/lib/auth/session";
import { pendingForUser } from "@/lib/legal/signatures";
import { getDb } from "@/lib/db";
import { LegalSummary } from "@/components/legal/LegalSummary";
import { GerenciaDashboard } from "@/components/gerencia/Dashboard";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Inicio" };

/** Inicio: cada rol ve su resumen. Comercial y administración ven el día comercial. */
export default async function HomePage() {
  const session = await requirePageUser("/");
  if (session.role === "legal") return <LegalSummary session={session} />;
  if (session.role === "gerencia") return <GerenciaDashboard session={session} />;
  return <CommercialHome session={session} />;
}

async function CommercialHome({ session }: { session: SessionPayload }) {
  const data = await homeData();
  const pending = await pendingForUser(await getDb(), session.uid, session.email);
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

      <Card className="mt-4">
        <CardHeader title="Pendiente de mi firma" description="Contratos en los que eres el firmante en turno." actions={<Link href="/firmas" className="text-sm text-navy-2 underline">Ver firmas</Link>} />
        {pending.length === 0 ? (
          <EmptyState compact title="Nada por firmar" description="Cuando te toque un contrato, aparecerá aquí y en tu correo." />
        ) : (
          <ul className="divide-y divide-line-2">
            {pending.map((item) => (
              <li key={item.requestId}>
                <Link href={`/firmas/${item.requestId}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-accent-soft">
                  <span className="text-sm font-medium">{item.title}</span>
                  <span className="text-xs text-ink-3">{item.code ?? "Contrato"} · paso {item.stepOrder}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

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
