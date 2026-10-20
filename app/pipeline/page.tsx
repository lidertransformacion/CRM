import { Suspense } from "react";
import { PipelineBoard } from "@/components/pipeline/PipelineBoard";
import { Skeleton } from "@/components/ui/skeleton";
import { can } from "@/lib/auth/permissions";
import { requirePageUser } from "@/lib/auth/page-session";
import { listLeads } from "@/lib/db";
import { todayIso } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const [leads, session] = await Promise.all([listLeads(), requirePageUser("/pipeline")]);
  return (
    <Suspense fallback={<PipelineSkeleton />}>
      <PipelineBoard initial={leads} today={todayIso()} canUploadContract={can(session.role, "upload_contract")} />
    </Suspense>
  );
}

function PipelineSkeleton() {
  return (
    <div className="page page-wide space-y-4" aria-busy>
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-9 w-full max-w-3xl" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-20" />)}
      </div>
      <Skeleton className="h-[60vh]" />
    </div>
  );
}
