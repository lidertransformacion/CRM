import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { GmailConnect } from "@/components/auth/GmailConnect";
import { PasswordForm } from "@/components/auth/PasswordForm";
import { SessionCard } from "@/components/auth/SessionCard";
import { PageHeader } from "@/components/ui/page-header";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { gmailConnection } from "@/lib/google/tokens";
import { mailTestMode } from "@/lib/mail/message";
import { getSql } from "@/lib/sql";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Cuenta" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

/** Cuenta: cambiar la contraseña (obligatorio la primera vez), conectar Gmail y cerrar sesión. */
export default async function CuentaPage({ searchParams }: { searchParams: SearchParams }) {
  const jar = await cookies();
  const session = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!session) redirect("/login?next=/cuenta");
  const params = await searchParams;
  const gmailFlag = first(params.gmail);
  const notice = gmailFlag === "conectado" || gmailFlag === "error" ? gmailFlag : null;
  const db = await getSql();
  const [connection, testMode] = await Promise.all([gmailConnection(db, session.uid), mailTestMode()]);
  return (
    <div className="page">
      <PageHeader
        eyebrow="Cuenta"
        title={session.mustChangePassword ? "Contraseña" : "Mi cuenta"}
        description={
          session.mustChangePassword
            ? "La primera vez hay que reemplazar la contraseña de arranque. Mínimo 12 caracteres, distinta de la actual."
            : "Tu acceso al CRM: cambia la contraseña o cierra la sesión."
        }
      />
      <div className="grid max-w-4xl grid-cols-1 gap-4 lg:grid-cols-2">
        <PasswordForm mustChange={session.mustChangePassword} />
        <SessionCard email={session.email} role={session.role} />
        <GmailConnect
          status={connection?.status === "connected" ? "connected" : "disconnected"}
          googleEmail={connection?.google_email ?? null}
          notice={notice}
          motivo={first(params.motivo)}
          testMode={testMode}
        />
      </div>
    </div>
  );
}
