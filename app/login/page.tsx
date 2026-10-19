"use client";

import { Suspense, useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password: password.trim() }),
    });
    const body = (await response.json()) as { error?: string; mustChangePassword?: boolean };
    setPending(false);
    if (!response.ok) {
      setError(body.error || "No se pudo entrar.");
      return;
    }
    const next = params.get("next") || "/";
    router.replace(body.mustChangePassword ? "/cuenta" : next.startsWith("/") ? next : "/");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <Image src="/brand/logo-libertario-light.png" alt="Libertario" width={334} height={80} className="h-12 w-auto" priority unoptimized />
      <h1 className="mt-4 text-3xl">CRM Libertario</h1>
      <p className="mt-2 text-sm text-ink-2">Entra con tu correo de Libertario Coffee Roasters.</p>
      <Card className="mt-6">
        <CardBody>
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Correo" htmlFor="correo" required>
              <Input id="correo" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
            </Field>
            <Field label="Contraseña" htmlFor="clave" required error={error || undefined}>
              <Input id="clave" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
            </Field>
            <Button type="submit" className="w-full" loading={pending} disabled={pending}>
              Entrar
            </Button>
          </form>
        </CardBody>
      </Card>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
