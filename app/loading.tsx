import { Skeleton } from "@/components/ui/skeleton";

/**
 * Esqueleto que Next muestra al instante al navegar a cualquier sección mientras el
 * servidor arma la página. Así el clic siempre tiene respuesta visible.
 */
export default function Loading() {
  return (
    <div className="page anim-fade-in" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      <div className="mb-5 space-y-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-[min(520px,80%)]" />
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-[88px] rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-3">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
        <Skeleton className="hidden h-72 rounded-xl lg:block" />
      </div>
    </div>
  );
}
