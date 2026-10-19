"use client";

import { Suspense, useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";

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
    const next = params.get("next") || "/comites";
    router.replace(body.mustChangePassword ? "/cuenta" : next.startsWith("/") ? next : "/comites");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <Image src="/brand/logo-light.png" alt="Libertario" width={334} height={80} className="h-12 w-auto" priority unoptimized />
      <h1 className="mt-3 font-serif text-4xl">CRM Pay Line</h1>
      <p className="mt-2 text-sm text-[#667085]">Entra con tu correo de Libertario Coffee Roasters.</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-3 rounded-3xl bg-white p-6 shadow-sm">
        <label className="block text-sm">
          Correo
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-xl border border-[#d5d9e4] px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Contraseña
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-xl border border-[#d5d9e4] px-3 py-2"
          />
        </label>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button disabled={pending} className="w-full rounded-full bg-[var(--navy)] px-4 py-2 text-sm text-white disabled:opacity-60">
          {pending ? "Entrando…" : "Entrar"}
        </button>
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
