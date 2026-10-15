import { CommitteeBoard } from "@/components/committee/CommitteeBoard";
import { committeeHistory, currentCommittee } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function ComitesPage() {
  const { doc } = currentCommittee();
  const history = committeeHistory().map((item) => ({
    number: item.number,
    held_on: item.held_on,
    is_current: item.is_current,
    snapshot: item.snapshot,
  }));
  return <CommitteeBoard initialDoc={doc} history={history} />;
}
