import type { Metadata } from "next";
import Link from "next/link";
import { requirePageUser } from "@/lib/auth/page-session";
import { listMySignatures } from "@/lib/legal/signatures";
import { getDb } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Firmas" };

export default async function FirmasPage() {
  const session = await requirePageUser("/firmas");
  const { pending, history } = await listMySignatures(await getDb(), session.uid, session.email);
  return (
    <div className="page space-y-4">
      <PageHeader eyebrow="Legal" title="Firmas" description="Lo que te toca firmar y lo que ya pasó por ti." />
      <Card>
        <CardHeader title="Pendiente de mi firma" description="Solo puedes firmar cuando eres el firmante en turno." />
        {pending.length === 0 ? (
          <EmptyState compact title="No tienes firmas en turno" description="Cuando te toque, el aviso también llega por correo." />
        ) : (
          <ul className="divide-y divide-line-2">
            {pending.map((item) => (
              <li key={item.requestId}>
                <Link href={`/firmas/${item.requestId}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-accent-soft">
                  <span>
                    <span className="block text-sm font-medium">{item.title}</span>
                    <span className="text-xs text-ink-3">{item.code} · paso {item.stepOrder}</span>
                  </span>
                  <Badge tone="warn" size="sm">Firmar</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <CardHeader title="Historial" />
        {history.length === 0 ? (
          <EmptyState compact title="Aún no participas en una firma" />
        ) : (
          <ul className="divide-y divide-line-2">
            {history.map((item) => (
              <li key={`${item.requestId}-${item.role}`}>
                <Link href={`/firmas/${item.requestId}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-accent-soft">
                  <span className="text-sm">{item.title}</span>
                  <span className="text-xs text-ink-3">{item.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
