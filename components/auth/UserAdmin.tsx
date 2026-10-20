"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { CircleAlert, CircleCheck, KeyRound, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FieldGrid } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { ROLE_LABEL } from "@/lib/auth/permissions";
import type { Role } from "@/lib/auth/roles";

type User = { id: number; email: string; role: Role; mustChangePassword: boolean };

/**
 * Administración de usuarios: crear, restablecer contraseña y ver quién tiene acceso.
 * Formularios en una columna con `Field`; la lista es tabla en escritorio y filas en móvil.
 */
export function UserAdmin({ initial, currentEmail }: { initial: User[]; currentEmail?: string }) {
  const { toast } = useToast();
  const [users, setUsers] = useState(initial);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("comercial");
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
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, role }),
      });
      const body = (await response.json()) as { error?: string; user?: { id: number; email: string; role: Role } };
      if (!response.ok || !body.user) {
        setError(body.error || "No se pudo crear el usuario.");
        return;
      }
      const created = body.user;
      setUsers((rows) => [...rows, { ...created, mustChangePassword: true }].sort((a, b) => a.email.localeCompare(b.email)));
      setEmail("");
      setPassword("");
      setRole("comercial");
      toast({ title: "Usuario creado", description: `${created.email} entra con la contraseña inicial y debe cambiarla.`, tone: "ok" });
    } catch {
      setError("Sin conexión. Inténtalo de nuevo.");
    } finally {
      setPending(false);
    }
  }

  async function onReset(event: FormEvent) {
    event.preventDefault();
    setResetPending(true);
    setResetError("");
    setResetMessage("");
    try {
      const response = await fetch("/api/users/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail.trim(), password: resetPassword.trim() }),
      });
      const body = (await response.json()) as { error?: string; email?: string };
      if (!response.ok) {
        setResetError(body.error || "No se pudo restablecer la contraseña.");
        return;
      }
      setUsers((rows) => rows.map((user) => (user.email === body.email ? { ...user, mustChangePassword: true } : user)));
      setResetMessage(`${body.email} entra con esa contraseña temporal y debe cambiarla.`);
      setResetEmail("");
      setResetPassword("");
      toast({ title: "Contraseña restablecida", description: body.email, tone: "ok" });
    } catch {
      setResetError("Sin conexión. Inténtalo de nuevo.");
    } finally {
      setResetPending(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="min-w-0">
        <CardHeader title="Nuevo usuario" description="Entra con la contraseña inicial y la cambia en su primer ingreso" />
        <form onSubmit={onSubmit}>
          <CardBody className="space-y-4">
            <Field label="Correo" htmlFor="new-email" required hint="Debe terminar en @libertariocoffee.com">
              <Input
                id="new-email"
                type="email"
                autoComplete="off"
                inputMode="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nombre@libertariocoffee.com"
              />
            </Field>
            <FieldGrid>
              <Field label="Contraseña inicial" htmlFor="new-password" required hint="Mínimo 12 caracteres">
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </Field>
              <Field label="Rol" htmlFor="new-role">
                <Select id="new-role" value={role} onChange={(event) => setRole(event.target.value as Role)}>
                  <option value="comercial">Comercial</option>
                  <option value="legal">Legal</option>
                  <option value="gerencia">Gerencia</option>
                  <option value="admin">Administrador</option>
                </Select>
              </Field>
            </FieldGrid>
            {error && <Alert tone="danger">{error}</Alert>}
          </CardBody>
          <CardFooter>
            <Button type="submit" loading={pending} disabled={pending} className="max-sm:w-full">
              <UserPlus />
              Crear usuario
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card className="min-w-0">
        <CardHeader title="Contraseña temporal" description="La sesión anterior deja de servir y la próxima entrada obliga a cambiarla" />
        <form onSubmit={onReset}>
          <CardBody className="space-y-4">
            <Field label="Usuario" htmlFor="reset-email" required>
              <Select id="reset-email" required value={resetEmail} onChange={(event) => setResetEmail(event.target.value)}>
                <option value="">Elige un usuario</option>
                {users.map((user) => (
                  <option key={user.id} value={user.email}>
                    {user.email}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Contraseña temporal" htmlFor="reset-password" required hint="Mínimo 12 caracteres">
              <Input
                id="reset-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                value={resetPassword}
                onChange={(event) => setResetPassword(event.target.value)}
              />
            </Field>
            {resetError && <Alert tone="danger">{resetError}</Alert>}
            {resetMessage && <Alert tone="ok">{resetMessage}</Alert>}
          </CardBody>
          <CardFooter>
            <Button type="submit" loading={resetPending} disabled={resetPending} className="max-sm:w-full">
              <KeyRound />
              Restablecer contraseña
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card className="min-w-0 lg:col-span-2">
        <CardHeader title={`Con acceso (${users.length})`} description="Quién puede entrar al CRM y con qué rol" />
        {users.length === 0 ? (
          <EmptyState compact title="Todavía no hay usuarios" description="Crea el primero con el formulario de arriba." />
        ) : (
          <>
            {/* Móvil: lista de filas. */}
            <ul className="divide-y divide-line-2 sm:hidden">
              {users.map((user) => (
                <li key={user.id} className="min-h-11 px-5 py-3">
                  <p className="text-sm font-medium text-ink">
                    <span className="break-words">{user.email}</span>
                    {user.email === currentEmail && <span className="ml-1.5 whitespace-nowrap text-xs font-normal text-ink-3">(tú)</span>}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-3">
                    <span>{ROLE_LABEL[user.role]}</span>
                    <StatusBadge user={user} />
                  </div>
                </li>
              ))}
            </ul>
            {/* Escritorio: tabla. */}
            <div className="max-sm:hidden">
              <Table>
                <THead>
                  <tr>
                    <TH>Correo</TH>
                    <TH>Rol</TH>
                    <TH>Estado</TH>
                  </tr>
                </THead>
                <TBody>
                  {users.map((user) => (
                    <TR key={user.id}>
                      <TD className="font-medium text-ink">
                        {user.email}
                        {user.email === currentEmail && <span className="ml-1.5 whitespace-nowrap text-xs font-normal text-ink-3">(tú)</span>}
                      </TD>
                      <TD className="text-ink-2">{ROLE_LABEL[user.role]}</TD>
                      <TD>
                        <StatusBadge user={user} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function StatusBadge({ user }: { user: User }) {
  return user.mustChangePassword ? (
    <Badge tone="warn" size="sm">
      Debe cambiar contraseña
    </Badge>
  ) : (
    <Badge tone="ok" size="sm" dot>
      Activo
    </Badge>
  );
}

function Alert({ tone, children }: { tone: "danger" | "ok"; children: ReactNode }) {
  const danger = tone === "danger";
  return (
    <p role={danger ? "alert" : "status"} className={`flex items-start gap-2 rounded-md px-3 py-2 text-sm ${danger ? "bg-danger-soft text-danger" : "bg-ok-soft text-ok"}`}>
      {danger ? <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> : <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />}
      <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}
