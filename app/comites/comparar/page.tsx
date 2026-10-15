import Link from "next/link";
import { compareCommittees } from "@/lib/db";
import { shortDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ left?: string; right?: string }> }) {
  const params = await searchParams;
  const data = compareCommittees(Number(params.left || 1), Number(params.right || 7));
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.16em] text-[#98a2b3]">COMITÉS</p>
          <h1 className="font-serif text-4xl">Comparar</h1>
        </div>
        <Link href="/comites" className="text-sm text-[var(--blue)]">Volver al tablero</Link>
      </div>
      <form className="flex flex-wrap gap-3 rounded-3xl bg-white p-4 shadow-sm">
        <label className="text-sm">Desde
          <select name="left" defaultValue={params.left || "1"} className="mt-1 block rounded-xl border px-3 py-2">
            {data.available.map((item) => <option key={item.number} value={item.number}>#{item.number} · {shortDate(item.heldOn)}</option>)}
          </select>
        </label>
        <label className="text-sm">Hasta
          <select name="right" defaultValue={params.right || "7"} className="mt-1 block rounded-xl border px-3 py-2">
            {data.available.map((item) => <option key={item.number} value={item.number}>#{item.number} · {shortDate(item.heldOn)}</option>)}
          </select>
        </label>
        <button className="self-end rounded-full bg-[var(--navy)] px-4 py-2 text-sm text-white">Ver</button>
      </form>
      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <h2 className="font-semibold">Cohortes de nacimiento</h2>
        <p className="mb-3 text-sm text-[#667085]">Cuántos pendientes nacieron en cada fecha y cuántos siguen abiertos en el tablero más reciente.</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {data.cohorts.map((cohort) => (
            <div key={cohort.number} className="rounded-2xl border border-[#eef0f5] p-3">
              <p className="text-xs text-[#98a2b3]">#{cohort.number} · {shortDate(cohort.heldOn)}</p>
              <p className="mt-1 text-2xl font-semibold">{cohort.stillOpen}</p>
              <p className="text-xs text-[#667085]">{cohort.born} nacieron · {cohort.closed} cerrados</p>
            </div>
          ))}
        </div>
      </section>
      {data.diff ? (
        <section className="grid gap-4 md:grid-cols-3">
          <DiffColumn title="Se cerraron o salieron" rows={data.diff.closedBetween} />
          <DiffColumn title="Siguen abiertos" rows={data.diff.stillOpen} />
          <DiffColumn title="Entraron después" rows={data.diff.added} />
        </section>
      ) : (
        <p className="rounded-2xl bg-white p-4 text-sm text-[#667085]">El diff de actas aparece cuando los dos comités tienen snapshot. Las fechas anteriores al #7 son cohortes.</p>
      )}
    </main>
  );
}

function DiffColumn({ title, rows }: { title: string; rows: { id: string; title: string; topic: string; change: string }[] }) {
  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm">
      <h3 className="font-semibold">{title}</h3>
      <p className="mb-2 text-xs text-[#98a2b3]">{rows.length}</p>
      <div className="space-y-2">
        {rows.slice(0, 12).map((row) => (
          <div key={row.id} className="text-sm">
            <p className="font-medium">{row.title}</p>
            <p className="text-xs text-[#667085]">{row.topic} · {row.change}</p>
          </div>
        ))}
        {rows.length > 12 && <p className="text-xs text-[#98a2b3]">y {rows.length - 12} más</p>}
      </div>
    </div>
  );
}
