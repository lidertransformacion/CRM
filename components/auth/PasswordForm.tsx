"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck } from "lucide-react";
import { LinkButton } from "@/components/home/LinkButton";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

/** Cambio de contraseña del usuario en sesión. Si `mustChange`, es el primer paso obligatorio tras entrar. */
export function PasswordForm({ mustChange }: { mustChange: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    setDone(false);
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, nextPassword }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error || "No se pudo cambiar la contraseña.");
        return;
      }
      setDone(true);
      setCurrentPassword("");
      setNextPassword("");
      toast({ title: "Contraseña cambiada", description: "Ya puedes usar el CRM con la nueva contraseña.", tone: "ok" });
      router.refresh();
    } catch {
      setError("Sin conexión. Inténtalo de nuevo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="min-w-0">
      <CardHeader
        title="Cambiar contraseña"
        description={mustChange ? "Reemplaza la contraseña de arranque antes de seguir" : "Mínimo 12 caracteres y distinta de la actual"}
      />
      <form onSubmit={onSubmit}>
        <CardBody className="space-y-4">
          <Field label="Contraseña actual" htmlFor="current-password" required>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </Field>
          <Field label="Contraseña nueva" htmlFor="next-password" required hint="Mínimo 12 caracteres, distinta de la actual">
            <Input
              id="next-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              value={nextPassword}
              onChange={(event) => setNextPassword(event.target.value)}
            />
          </Field>
          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </p>
          )}
          {done && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-ok-soft px-3 py-2 text-sm text-ok" role="status">
              <span className="flex items-center gap-2">
                <CircleCheck className="size-4 shrink-0" aria-hidden />
                Listo. Ya puedes usar el CRM.
              </span>
              <LinkButton href="/" variant="link" size="sm">
                Ir a Inicio
              </LinkButton>
            </div>
          )}
        </CardBody>
        <CardFooter>
          <Button type="submit" loading={pending} disabled={pending} className="max-sm:w-full">
            Cambiar contraseña
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
