import { Suspense } from "react";
import { ClientExplorer } from "@/components/clients/ClientExplorer";
import { Skeleton } from "@/components/ui/skeleton";
import { clientDirectory } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function ClientesPage() {
  return (
    <Suspense fallback={<ClientsSkeleton />}>
      <ClientExplorer clients={clientDirectory()} />
    </Suspense>
  );
}

function ClientsSkeleton() {
  return (
    <div className="page space-y-4" aria-busy>
      <Skeleton className="h-10 w-48" />
      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Skeleton className="h-[60vh]" />
        <Skeleton className="h-[60vh]" />
      </div>
    </div>
  );
}
