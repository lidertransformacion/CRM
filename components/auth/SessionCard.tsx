"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import type { Role } from "@/lib/auth/roles";

/** Quién está en sesión y el botón para cerrarla (en móvil es el sitio natural para salir). */
export function SessionCard({ email, role }: { email: string; role: Role }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } catch {
      setPending(false);
      toast({ title: "No se pudo cerrar la sesión", description: "Revisa la conexión e inténtalo de nuevo.", tone: "danger" });
    }
  }

  return (
    <Card className="min-w-0">
      <CardHeader title="Sesión" description="Con qué cuenta estás usando el CRM" />
      <CardBody>
        <dl className="space-y-3">
          <div className="min-w-0">
            <dt className="text-xs font-medium text-ink-2">Correo</dt>
            <dd className="mt-0.5 break-all text-sm font-medium text-ink">{email}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-ink-2">Rol</dt>
            <dd className="mt-1">
              <Badge tone={role === "admin" ? "accent" : "neutral"}>{role === "admin" ? "Administrador" : "Usuario"}</Badge>
            </dd>
          </div>
        </dl>
        {role === "admin" && (
          <p className="mt-4 text-xs text-ink-3">
            Como administrador puedes crear usuarios y restablecer contraseñas en{" "}
            <Link href="/ajustes" className="font-medium text-navy-2 underline-offset-4 hover:underline">
              Ajustes
            </Link>
            .
          </p>
        )}
      </CardBody>
      <CardFooter>
        <Button type="button" variant="secondary" onClick={logout} loading={pending} disabled={pending} className="max-sm:w-full">
          <LogOut />
          Cerrar sesión
        </Button>
      </CardFooter>
    </Card>
  );
}
