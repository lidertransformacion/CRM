import { NextResponse } from "next/server";
import { jsonError, requireSession } from "@/lib/auth/guard";
import { createUser, HttpError, listUsers } from "@/lib/auth/users";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const db = await getDb();
    const session = await requireSession(request, db);
    if (session.role !== "admin") throw new HttpError(403, "Solo un administrador puede ver usuarios.");
    const users = await listUsers(db);
    return NextResponse.json({
      users: users.map((user) => ({
        id: user.id,
        email: user.email,
        role: user.role,
        mustChangePassword: user.must_change_password === 1,
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const db = await getDb();
    const session = await requireSession(request, db);
    const body = (await request.json()) as { email?: string; password?: string; role?: "admin" | "user" };
    const user = await createUser(db, session, {
      email: body.email ?? "",
      password: body.password ?? "",
      role: body.role,
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
