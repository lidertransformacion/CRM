"use client";

import { Clock, Hourglass, Users } from "lucide-react";
import type { CommitteeAction, CommitteeDoc, FlatPendiente } from "@/lib/committee/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PendienteRow } from "@/components/committee/PendienteRow";
import { groupRowsByOwner, plural, type BoardDialog } from "@/components/committee/helpers";

/** Lista plana de pendientes agrupada por responsable: la vista "mis pendientes". */
export function PersonView({
  doc,
  rows,
  asOf,
  readOnly,
  freshId,
  onAction,
  onDialog,
  onClearFilters,
}: {
  doc: CommitteeDoc;
  rows: FlatPendiente[];
  asOf: string;
  readOnly: boolean;
  freshId: string | null;
  onAction: (action: CommitteeAction) => void;
  onDialog: (dialog: BoardDialog) => void;
  onClearFilters: () => void;
}) {
  const groups = groupRowsByOwner(doc, rows, asOf);
  if (!groups.length) {
    return (
      <Card>
        <EmptyState
          icon={<Users />}
          title="Nada que mostrar con estos filtros"
          description="Prueba con «Todos» o quita el filtro de persona para ver el resto de pendientes."
          action={<Button variant="secondary" onClick={onClearFilters}>Quitar filtros</Button>}
        />
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <Card key={group.key} id={`persona-${group.key}`}>
          <CardHeader
            title={group.name}
            description={`${plural(group.summary.open, "pendiente abierto", "pendientes abiertos")}${group.summary.closed ? ` · ${plural(group.summary.closed, "cerrado", "cerrados")}` : ""}`}
            actions={
              <>
                {group.summary.overdue > 0 && (
                  <Badge tone="danger"><Clock className="size-3" /> {plural(group.summary.overdue, "vencido", "vencidos")}</Badge>
                )}
                {group.summary.carried > 0 && (
                  <Badge tone="danger"><Hourglass className="size-3" /> {plural(group.summary.carried, "arrastrado", "arrastrados")}</Badge>
                )}
              </>
            }
          />
          <CardBody className="space-y-2 px-3 sm:px-5">
            {group.rows.map((row) => (
              <PendienteRow
                key={`${group.key}-${row.pendiente.id}`}
                doc={doc}
                topic={row.topic}
                punto={row.punto}
                item={row.pendiente}
                asOf={asOf}
                readOnly={readOnly}
                showContext
                fresh={freshId === row.pendiente.id}
                onAction={onAction}
                onDialog={onDialog}
              />
            ))}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
