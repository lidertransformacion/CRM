import { Kanban } from "@/components/pipeline/Kanban";
import { listLeads } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  return <Kanban initial={await listLeads()} />;
}
