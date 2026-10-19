"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/shell/LogoMark";

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
    // Mismo login que la app de mantenimiento de Libertario: tarjeta blanca centrada sobre crema,
    // lockup isotipo + LIBERTARIO + subtítulo, "Bienvenido", etiquetas en mayúsculas y botón a lo ancho.
    <main className="fixed inset-0 z-50 grid place-items-center bg-crema p-6">
      <form onSubmit={onSubmit} className="flex w-[min(440px,100%)] flex-col gap-3.5 rounded-[10px] border border-line bg-surface px-7 pb-6 pt-7 shadow-card">
        <div className="flex items-center gap-3">
          <LogoMark className="size-12 shrink-0 text-ink" />
          <div className="font-serif text-[15px] leading-none tracking-[0.2em] text-ink">
            LIBERTARIO
            <small className="mt-[3px] block font-sans text-[10px] tracking-[0.16em] text-ink-3 uppercase">CRM Comercial</small>
          </div>
        </div>
        <h2 className="mt-1.5 font-serif text-[22px] font-normal text-ink">Bienvenido</h2>
        <p className="text-sm leading-relaxed text-ink-2">Aquí se hace el seguimiento comercial: comités, oportunidades, equipos en comodato y clientes.</p>
        <label className="flex flex-col gap-1.5 text-xs uppercase tracking-[0.06em] text-ink-3">
          Correo
          <input
            id="correo"
            type="email"
            autoComplete="username"
            required
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-[15px] normal-case tracking-normal text-ink outline-none focus:border-navy-2 focus:ring-2 focus:ring-navy-2/20"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs uppercase tracking-[0.06em] text-ink-3">
          Contraseña
          <input
            id="clave"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-[15px] normal-case tracking-normal text-ink outline-none focus:border-navy-2 focus:ring-2 focus:ring-navy-2/20"
          />
        </label>
        <p className="min-h-[18px] text-[13px] text-danger" role="alert">{error}</p>
        <Button type="submit" size="lg" className="w-full rounded-[10px] text-[14.5px]" loading={pending} disabled={pending}>
          {pending ? "Entrando…" : "Entrar"}
        </Button>
        <p className="text-xs text-ink-3">¿No tienes acceso? Pídeselo a Transformación Digital.</p>
      </form>
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
