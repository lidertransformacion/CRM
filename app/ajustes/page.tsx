import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { UserAdmin } from "@/components/auth/UserAdmin";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { listUsers } from "@/lib/auth/users";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AjustesPage() {
  const jar = await cookies();
  const session = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!session) redirect("/login?next=/ajustes");
  if (session.role !== "admin") {
    return (
      <main className="mx-auto max-w-lg px-4 py-6">
        <h1 className="font-serif text-4xl">Ajustes</h1>
        <p className="mt-2 text-sm text-[#667085]">Solo un administrador puede crear usuarios.</p>
      </main>
    );
  }
  const users = await listUsers(await getDb());
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <div>
        <p className="text-xs tracking-[0.16em] text-[#98a2b3]">ADMINISTRACIÓN</p>
        <h1 className="font-serif text-4xl">Usuarios</h1>
        <p className="mt-2 max-w-2xl text-sm text-[#667085]">
          Solo se aceptan correos que terminan exactamente en @libertariocoffee.com. Cada cuenta nueva entra obligada a cambiar la contraseña.
        </p>
      </div>
      <UserAdmin
        initial={users.map((user) => ({
          id: user.id,
          email: user.email,
          role: user.role,
          mustChangePassword: user.must_change_password === 1,
        }))}
      />
    </main>
  );
}
