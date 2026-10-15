import { Kanban } from "@/components/pipeline/Kanban";
import { listLeads } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function PipelinePage() {
  return <Kanban initial={listLeads()} />;
}
