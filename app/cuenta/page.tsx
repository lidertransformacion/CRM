"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function CuentaPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    setOk(false);
    const response = await fetch("/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, nextPassword }),
    });
    const body = (await response.json()) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setError(body.error || "No se pudo cambiar la contraseña.");
      return;
    }
    setOk(true);
    setCurrentPassword("");
    setNextPassword("");
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 py-6">
      <div>
        <p className="text-xs tracking-[0.16em] text-[#98a2b3]">CUENTA</p>
        <h1 className="font-serif text-4xl">Contraseña</h1>
        <p className="mt-2 text-sm text-[#667085]">
          La primera vez hay que reemplazar la contraseña de arranque. Mínimo 12 caracteres, distinta de la actual.
        </p>
      </div>
      <form onSubmit={onSubmit} className="space-y-3 rounded-3xl bg-white p-6 shadow-sm">
        <label className="block text-sm">
          Contraseña actual
          <input
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            className="mt-1 w-full rounded-xl border border-[#d5d9e4] px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Contraseña nueva
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            value={nextPassword}
            onChange={(event) => setNextPassword(event.target.value)}
            className="mt-1 w-full rounded-xl border border-[#d5d9e4] px-3 py-2"
          />
        </label>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {ok && <p className="text-sm text-emerald-700">Listo. Ya puedes usar el CRM.</p>}
        <button disabled={pending} className="rounded-full bg-[var(--navy)] px-4 py-2 text-sm text-white disabled:opacity-60">
          {pending ? "Guardando…" : "Cambiar contraseña"}
        </button>
      </form>
    </main>
  );
}
