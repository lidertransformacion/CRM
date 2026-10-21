"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";

type Match = { kind: string; publicId: string | null; status: string | null; title: string | null; sha256: string };

const KIND: Record<string, string> = {
  final: "Coincide con el PDF final firmado.",
  source: "Coincide con el PDF original, antes de las firmas.",
  step: "Coincide con un PDF intermedio de la cadena de firma.",
  none: "No está en los contratos firmados de este CRM.",
};

export default function VerificarPage() {
  const [sha, setSha] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Match | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const form = new FormData();
      if (file) form.set("file", file);
      if (sha.trim()) form.set("sha256", sha.trim());
      const response = await fetch("/api/verificar", { method: "POST", body: form });
      const payload = (await response.json()) as Match & { error?: string };
      if (!response.ok) {
        setError(payload.error || "No se pudo verificar.");
        setResult(null);
        return;
      }
      setResult(payload);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <PageHeader eyebrow="Verificación" title="¿Este PDF es el del CRM?" description="Sube el archivo o pega su SHA-256. No hace falta iniciar sesión." />
      <Card>
        <CardHeader title="Comprobar autenticidad" />
        <CardBody>
          <form className="space-y-4" onSubmit={submit}>
            <Field label="PDF" htmlFor="verify-file">
              <Input id="verify-file" type="file" accept="application/pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            </Field>
            <Field label="O el hash SHA-256" htmlFor="verify-sha">
              <Input id="verify-sha" value={sha} onChange={(event) => setSha(event.target.value)} placeholder="64 caracteres hexadecimales" />
            </Field>
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button type="submit" loading={pending}>Verificar</Button>
          </form>
          {result && (
            <div className="mt-4 rounded-lg border border-line-2 p-3 text-sm">
              <p>{KIND[result.kind] ?? result.kind}</p>
              {result.title && <p className="mt-1 font-medium">{result.title}</p>}
              {result.publicId && (
                <Link className="mt-2 inline-block text-navy-2 underline" href={`/verificar/${result.publicId}`}>
                  Ver el certificado
                </Link>
              )}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
