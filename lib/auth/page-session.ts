import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { normalizeRole, SESSION_COOKIE, verifySession, type SessionPayload } from "@/lib/auth/session";
import { userById } from "@/lib/auth/users";

export async function requirePageUser(nextPath: string): Promise<SessionPayload> {
  const jar = await cookies();
  const session = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!session) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  const user = await userById(await getDb(), session.uid);
  if (!user || user.session_version !== session.sv) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  if (user.must_change_password) redirect("/cuenta");
  return {
    uid: user.id,
    email: user.email,
    role: normalizeRole(user.role),
    mustChangePassword: false,
    sv: user.session_version,
    exp: session.exp,
  };
}
