import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PasswordForm } from "@/components/auth/PasswordForm";
import { SessionCard } from "@/components/auth/SessionCard";
import { PageHeader } from "@/components/ui/page-header";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Cuenta" };

/** Cuenta: cambiar la contraseña (obligatorio la primera vez) y cerrar sesión. */
export default async function CuentaPage() {
  const jar = await cookies();
  const session = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!session) redirect("/login?next=/cuenta");
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
      </div>
    </div>
  );
}
