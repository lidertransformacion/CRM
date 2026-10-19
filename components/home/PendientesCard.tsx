import { CircleCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Tooltip } from "@/components/ui/tooltip";
import { LinkList, LinkRow, SeeAll } from "@/components/home/LinkList";
import { carryTone } from "@/lib/committee/metrics";
import { plural } from "@/lib/home/format";
import type { PendienteAlert } from "@/lib/home/queries";
import { cn, shortDate } from "@/lib/utils";

/** Pendientes del comité actual que ya vencieron o llevan 2 o más comités. Cada fila filtra Comités por responsable. */
export function PendientesCard({ rows, total, committeeNumber }: { rows: PendienteAlert[]; total: number; committeeNumber: number }) {
  return (
    <Card className="min-w-0">
      <CardHeader
        title="Pendientes vencidos y arrastrados"
        description={`Del comité ${committeeNumber}: ya pasaron su fecha o llevan 2 o más comités sin cerrarse`}
        actions={<SeeAll href="/comites" count={total} />}
      />
      {rows.length === 0 ? (
        <EmptyState compact icon={<CircleCheck />} title="Nada vencido ni arrastrado" description="Todos los pendientes abiertos del comité están dentro de su fecha." />
      ) : (
        <LinkList>
          {rows.map((row) => (
            <LinkRow
              key={row.id}
              href={row.href}
              title={row.title}
              meta={`${row.owners.length ? row.owners.join(", ") : "Sin responsable"} · ${row.topic}`}
              aside={
                <>
                  <CarryBadge row={row} />
                  <DueLabel row={row} />
                </>
              }
            />
          ))}
        </LinkList>
      )}
    </Card>
  );
}

const CARRY_TONE = { red: "danger", amber: "warn", new: "neutral" } as const;

function CarryBadge({ row }: { row: PendienteAlert }) {
  const label = row.carry === 0 ? "Nuevo" : plural(row.carry, "comité");
  const explain = row.carry === 0 ? "Nació en este comité" : `Nació en el comité ${row.bornCommitteeNumber} y lleva ${plural(row.carry, "comité")} sin cerrarse`;
  return (
    <Tooltip content={explain}>
      <Badge tone={CARRY_TONE[carryTone(row.carry)]} size="sm">
        {label}
      </Badge>
    </Tooltip>
  );
}

/** Fecha de vencimiento: columna fija alineada a la derecha en escritorio; texto corrido en móvil. */
function DueLabel({ row }: { row: PendienteAlert }) {
  if (!row.dueOn) return <span className="text-xs text-ink-3 sm:w-[88px] sm:text-right">Sin fecha</span>;
  return (
    <span className={cn("num text-xs sm:w-[88px] sm:text-right", row.overdue ? "font-medium text-danger" : "text-ink-3")}>
      {row.overdue ? "Venció" : "Vence"} {shortDate(row.dueOn)}
    </span>
  );
}
