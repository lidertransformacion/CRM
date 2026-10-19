"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Target } from "lucide-react";
import type { SalesKpi } from "@/lib/kpi/compute";
import { compactCop } from "@/lib/home/format";
import { cop, displaySeller, longDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Field } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Stat, StatGrid } from "@/components/ui/stat";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { SellerDetail } from "@/components/kpi/SellerDetail";
import { TargetDialog, type TargetDraft } from "@/components/kpi/TargetDialog";
import { TargetsCard } from "@/components/kpi/TargetsCard";
import { TeamTable } from "@/components/kpi/TeamTable";
import { TEAM, formatMetricValue, formatRate, kpiFor, metricById, monthLabel, periodOf, type KpiTarget, type MetricId } from "@/components/kpi/targets";

/** Pantalla de KPIs: resumen del equipo, tabla comparativa, detalle del vendedor elegido y sus metas del mes. */
export function KpiBoard({ team, people, targets: initialTargets, asOf }: { team: SalesKpi; people: SalesKpi[]; targets: KpiTarget[]; asOf: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [selected, setSelected] = useState<string>(TEAM);
  const [month, setMonth] = useState(periodOf(asOf));
  const [targets, setTargets] = useState(initialTargets);
  const [dialog, setDialog] = useState<TargetDraft | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const targetsRef = useRef<HTMLDivElement>(null);

  const kpi = kpiFor(selected, team, people);
  const isTeam = selected === TEAM || kpi === team;
  const displayName = isTeam ? "Equipo" : displaySeller(kpi.salesperson);

  function select(salesperson: string, scroll = false) {
    setSelected(salesperson);
    if (scroll) window.requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function openDialog(metric: MetricId = "expected_revenue", existing?: KpiTarget) {
    setDialog({
      salesperson: existing?.salesperson ?? selected,
      metric,
      period: existing?.period ?? month,
      targetValue: existing ? String(existing.target_value) : "",
    });
  }

  function handleSaved(target: KpiTarget) {
    setTargets((current) => [...current.filter((item) => !(item.salesperson === target.salesperson && item.metric === target.metric && item.period === target.period)), target]);
    setDialog(null);
    setSelected(target.salesperson);
    setMonth(target.period);
    const metric = metricById(target.metric);
    toast({
      title: "Meta guardada",
      description: `${metric?.label ?? target.metric} · ${target.salesperson === TEAM ? "Equipo" : displaySeller(target.salesperson)} · ${monthLabel(target.period)} · ${metric ? formatMetricValue(metric, target.target_value) : target.target_value}`,
    });
    window.requestAnimationFrame(() => targetsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
    router.refresh();
  }

  function handleDeleted(id: number) {
    setTargets((current) => current.filter((item) => item.id !== id));
    router.refresh();
  }

  const overdueTone = team.overdueActivities > 0 ? "danger" : "ok";
  const overdueHint = team.overdueActivities > 0 ? "Por asignado: estado «Vencidas» o fecha límite pasada" : "Nada vencido hoy";

  return (
    <div className="page">
      <PageHeader
        eyebrow={`Comercial · corte ${longDate(asOf)} de ${asOf.slice(0, 4)}`}
        title="KPIs por vendedor"
        description={
          <span className="inline-flex flex-wrap items-center gap-1.5">
            Resultados del pipeline por persona, comparados con sus metas del mes.
            <Tooltip content="La antigüedad se cuenta desde la creación de la oportunidad porque el export de Odoo no trae la fecha de entrada a la etapa.">
              <button type="button" className="inline-flex items-center gap-1 rounded-full text-ink-3 hover:text-ink" aria-label="Cómo se calcula la antigüedad">
                <Info className="size-4" />
              </button>
            </Tooltip>
          </span>
        }
        actions={
          <Button onClick={() => openDialog()}>
            <Target /> Definir meta
          </Button>
        }
      />

      {/* Escritorio: los siete indicadores en rejilla. */}
      <StatGrid className="max-sm:hidden xl:grid-cols-4">
        <Stat label="Abiertas" value={team.open} hint="Etapas 1 a 6 del pipeline" />
        <Stat label="Ganadas" value={team.won} hint="Etapa Cierre / Ganado" tone={team.won > 0 ? "ok" : "neutral"} />
        <Stat label="Perdidas" value={team.lost} hint="Etapa Oportunidad perdida" />
        <Stat label="Tasa de cierre" value={formatRate(team.winRate)} hint="Ganadas ÷ (ganadas + perdidas); las recurrentes no cuentan" />
        <Stat label="Ingreso esperado" value={cop(team.expectedRevenue)} hint="Suma de las oportunidades abiertas" />
        <Stat label="Pronóstico ponderado" value={cop(team.weightedRevenue)} hint="Ingreso esperado × probabilidad de cada una" />
        <Stat label="Actividades vencidas" value={team.overdueActivities} tone={overdueTone} hint={overdueHint} />
      </StatGrid>

      {/* Móvil: los cuatro que más importan en 2 × 2 y los otros tres en una fila desplazable. */}
      <div className="sm:hidden">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Abiertas" value={team.open} hint="Etapas 1 a 6 del pipeline" />
          <Stat label="Tasa de cierre" value={formatRate(team.winRate)} hint={`${team.won} ganadas · ${team.lost} perdidas`} />
          <Stat label="Ingreso esperado" value={compactCop(team.expectedRevenue)} hint={cop(team.expectedRevenue)} />
          <Stat label="Actividades vencidas" value={team.overdueActivities} tone={overdueTone} hint={overdueHint} />
        </div>
        <div className="-mx-4 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Más indicadores del equipo">
          <Stat className="w-[62%] shrink-0 snap-start" label="Ganadas" value={team.won} hint="Etapa Cierre / Ganado" tone={team.won > 0 ? "ok" : "neutral"} />
          <Stat className="w-[62%] shrink-0 snap-start" label="Perdidas" value={team.lost} hint="Etapa Oportunidad perdida" />
          <Stat className="w-[62%] shrink-0 snap-start" label="Pronóstico ponderado" value={compactCop(team.weightedRevenue)} hint={`${cop(team.weightedRevenue)} · ingreso × probabilidad`} />
        </div>
      </div>

      <div className="mt-5 space-y-5">
        <TeamTable team={team} people={people} selected={selected} onSelect={(salesperson) => select(salesperson, true)} />

        <section ref={detailRef} className="scroll-mt-20 space-y-4" aria-label="Detalle del vendedor">
          {/* Móvil: un selector nativo en vez de quince chips (la lista de arriba también elige). */}
          <div className="sm:hidden">
            <Field label="Detalle de" htmlFor="kpi-detail-of">
              <Select id="kpi-detail-of" value={selected} onChange={(event) => select(event.target.value)}>
                <option value={TEAM}>Equipo (total)</option>
                {people.map((person) => (
                  <option key={person.salesperson} value={person.salesperson}>
                    {displaySeller(person.salesperson)}
                    {person.overdueActivities > 0 ? ` · ${person.overdueActivities} ${person.overdueActivities === 1 ? "vencida" : "vencidas"}` : ""}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-2 max-sm:hidden">
            <span className="mr-1 text-xs font-medium text-ink-3">Detalle de</span>
            <Chip active={selected === TEAM} onClick={() => select(TEAM)}>Equipo</Chip>
            {people.map((person) => (
              <Chip key={person.salesperson} active={selected === person.salesperson} onClick={() => select(person.salesperson)} alert={person.overdueActivities > 0}>
                {displaySeller(person.salesperson)}
              </Chip>
            ))}
            {people.some((person) => person.overdueActivities > 0) && <span className="text-[11px] text-ink-3">en rojo: con actividades vencidas</span>}
          </div>
          <SellerDetail kpi={kpi} displayName={displayName} isTeam={isTeam} />
          <TargetsCard
            cardRef={targetsRef}
            kpi={kpi}
            selected={isTeam ? TEAM : kpi.salesperson}
            displayName={displayName}
            month={month}
            onMonthChange={setMonth}
            targets={targets}
            onDefine={openDialog}
            onDeleted={handleDeleted}
          />
        </section>
      </div>

      {dialog && <TargetDialog initial={dialog} team={team} people={people} onClose={() => setDialog(null)} onSaved={handleSaved} />}
    </div>
  );
}
