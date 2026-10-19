import { CommitteeBoard } from "@/components/committee/CommitteeBoard";
import { committeeHistory, currentCommittee } from "@/lib/db";
import { todayIso } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * Tablero de comités. Deep links:
 * `?persona=<nombre>` filtra por responsable, `?vista=persona` abre la vista por persona,
 * `?correo=1` abre el correo resumen y `?comite=N` muestra una cohorte o acta archivada.
 */
export default async function ComitesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const { doc } = currentCommittee();
  const history = committeeHistory().map((item) => ({
    number: item.number,
    held_on: item.held_on,
    is_current: item.is_current,
    snapshot: item.snapshot,
  }));
  const committee = Number(first(params.comite));
  return (
    <CommitteeBoard
      initialDoc={doc}
      history={history}
      asOf={todayIso()}
      initialPerson={first(params.persona) ?? null}
      initialView={first(params.vista) === "persona" ? "person" : "topic"}
      openEmail={first(params.correo) === "1"}
      initialCommittee={Number.isFinite(committee) && committee > 0 ? committee : null}
    />
  );
}
