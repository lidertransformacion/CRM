"use client";

import { useState, type FormEvent } from "react";
import type { Role } from "@/lib/auth/session";

type User = { id: number; email: string; role: Role; mustChangePassword: boolean };

export function UserAdmin({ initial }: { initial: User[] }) {
  const [users, setUsers] = useState(initial);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [resetPending, setResetPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, role }),
    });
    const body = (await response.json()) as { error?: string; user?: { id: number; email: string; role: Role } };
    setPending(false);
    if (!response.ok || !body.user) {
      setError(body.error || "No se pudo crear el usuario.");
      return;
    }
    setUsers((rows) => [...rows, { ...body.user!, mustChangePassword: true }].sort((a, b) => a.email.localeCompare(b.email)));
    setEmail("");
    setPassword("");
    setRole("user");
  }

  async function onReset(event: FormEvent) {
    event.preventDefault();
    setResetPending(true);
    setResetError("");
    setResetMessage("");
    const response = await fetch("/api/users/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: resetEmail.trim(), password: resetPassword.trim() }),
    });
    const body = (await response.json()) as { error?: string; email?: string };
    setResetPending(false);
    if (!response.ok) {
      setResetError(body.error || "No se pudo restablecer la contraseña.");
      return;
    }
    setUsers((rows) => rows.map((user) => (user.email === body.email ? { ...user, mustChangePassword: true } : user)));
    setResetMessage(`${body.email} entra con esa contraseña temporal y debe cambiarla.`);
    setResetEmail("");
    setResetPassword("");
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="grid gap-3 rounded-3xl bg-white p-5 shadow-sm sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">
          Correo
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="nombre@libertariocoffee.com"
            className="mt-1 w-full rounded-xl border border-[#d5d9e4] px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Contraseña inicial
          <input
            type="password"
            required
            minLength={12}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-xl border border-[#d5d9e4] px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Rol
          <select value={role} onChange={(event) => setRole(event.target.value as Role)} className="mt-1 w-full rounded-xl border border-[#d5d9e4] px-3 py-2">
            <option value="user">Usuario</option>
            <option value="admin">Administrador</option>
          </select>
        </label>
        {error && <p className="text-sm text-rose-600 sm:col-span-2">{error}</p>}
        <button disabled={pending} className="rounded-full bg-[var(--navy)] px-4 py-2 text-sm text-white sm:col-span-2 disabled:opacity-60">
          {pending ? "Creando…" : "Crear usuario"}
        </button>
      </form>
      <form onSubmit={onReset} className="grid gap-3 rounded-3xl bg-white p-5 shadow-sm sm:grid-cols-2">
        <div className="sm:col-span-2">
          <h2 className="font-serif text-2xl">Contraseña temporal</h2>
          <p className="mt-1 text-sm text-[#667085]">
            Restablece el acceso de un administrador o usuario. La sesión anterior deja de servir y la próxima entrada obliga a cambiar la contraseña.
          </p>
        </div>
        <label className="text-sm">
          Correo
          <input
            type="email"
            required
            value={resetEmail}
            onChange={(event) => setResetEmail(event.target.value)}
            placeholder="lidertransformacion@libertariocoffee.com"
            className="mt-1 w-full rounded-xl border border-[#d5d9e4] px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Contraseña temporal
          <input
            type="password"
            required
            minLength={12}
            value={resetPassword}
            onChange={(event) => setResetPassword(event.target.value)}
            className="mt-1 w-full rounded-xl border border-[#d5d9e4] px-3 py-2"
          />
        </label>
        {resetError && <p className="text-sm text-rose-600 sm:col-span-2">{resetError}</p>}
        {resetMessage && <p className="text-sm text-[#067647] sm:col-span-2">{resetMessage}</p>}
        <button disabled={resetPending} className="rounded-full bg-[var(--navy)] px-4 py-2 text-sm text-white sm:col-span-2 disabled:opacity-60">
          {resetPending ? "Guardando…" : "Restablecer contraseña"}
        </button>
      </form>
      <ul className="divide-y divide-[#eef0f5] rounded-3xl bg-white shadow-sm">
        {users.map((user) => (
          <li key={user.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
            <span>{user.email}</span>
            <span className="text-[#667085]">
              {user.role === "admin" ? "admin" : "usuario"}
              {user.mustChangePassword ? " · debe cambiar contraseña" : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
