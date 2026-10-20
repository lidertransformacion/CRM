import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { UserAdmin } from "@/components/auth/UserAdmin";
import { LinkButton } from "@/components/home/LinkButton";
import { StorageBar } from "@/components/storage/StorageBar";
import { readUsage } from "@/lib/storage/quota";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { listUsers } from "@/lib/auth/users";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Ajustes" };

/** Ajustes: administración de usuarios (solo administradores). */
export default async function AjustesPage() {
  const jar = await cookies();
  const session = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!session) redirect("/login?next=/ajustes");
  if (session.role !== "admin") {
    return (
      <div className="page">
        <PageHeader eyebrow="Administración" title="Ajustes" description="Usuarios y accesos del CRM." />
        <Card>
          <EmptyState
            icon={<Lock />}
            title="Solo para administradores"
            description="Pide a un administrador que cree usuarios o restablezca contraseñas. Tu contraseña la cambias desde tu cuenta."
            action={
              <LinkButton href="/cuenta" variant="secondary">
                Ir a mi cuenta
              </LinkButton>
            }
          />
        </Card>
      </div>
    );
  }
  const db = await getDb();
  const [users, usage] = await Promise.all([listUsers(db), readUsage(db)]);
  return (
    <div className="page">
      <PageHeader
        eyebrow="Administración"
        title="Usuarios"
        description="Solo se aceptan correos que terminan exactamente en @libertariocoffee.com. Cada cuenta nueva entra obligada a cambiar la contraseña."
        actions={
          <LinkButton href="/ajustes/almacen" variant="secondary">
            Almacén
          </LinkButton>
        }
      />
      <Card className="mb-4">
        <CardHeader title="Almacén" description="Contratos, correos y fotos de visitas comparten 10 GB." />
        <CardBody>
          <StorageBar bytesUsed={usage.bytesUsed} limitBytes={usage.limitBytes} />
        </CardBody>
      </Card>
      <UserAdmin
        currentEmail={session.email}
        initial={users.map((user) => ({
          id: user.id,
          email: user.email,
          role: user.role,
          mustChangePassword: user.must_change_password === 1,
        }))}
      />
    </div>
  );
}
