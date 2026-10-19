"use client";

import { useRouter } from "next/navigation";
import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { shortDate } from "@/lib/utils";

/**
 * Selectores "Desde / Hasta" de la comparación; navegan al cambiar, sin botón.
 * En móvil van en una columna (cada selector a ancho completo) con "Intercambiar" entre los dos.
 */
export function CompareControls({ available, left, right }: { available: { number: number; heldOn: string }[]; left: number; right: number }) {
  const router = useRouter();
  function go(nextLeft: number, nextRight: number) {
    router.push(`/comites/comparar?left=${nextLeft}&right=${nextRight}`);
  }
  const options = available.map((item) => (
    <option key={item.number} value={item.number}>
      Comité #{item.number} · {shortDate(item.heldOn)}
    </option>
  ));
  return (
    <>
      <Field label="Desde" htmlFor="compare-left" inline className="gap-2 max-sm:w-full max-sm:[&>div]:min-w-0 max-sm:[&>div]:flex-1 max-sm:[&>label]:w-12">
        <Select id="compare-left" value={left} onChange={(event) => go(Number(event.target.value), right)} className="w-[200px] max-sm:w-full">
          {options}
        </Select>
      </Field>
      <Button variant="ghost" size="icon" aria-label="Intercambiar comités" onClick={() => go(right, left)} className="max-sm:ml-auto max-sm:w-auto max-sm:px-3">
        <ArrowLeftRight />
        <span className="sm:hidden">Intercambiar</span>
      </Button>
      <Field label="Hasta" htmlFor="compare-right" inline className="gap-2 max-sm:w-full max-sm:[&>div]:min-w-0 max-sm:[&>div]:flex-1 max-sm:[&>label]:w-12">
        <Select id="compare-right" value={right} onChange={(event) => go(left, Number(event.target.value))} className="w-[200px] max-sm:w-full">
          {options}
        </Select>
      </Field>
    </>
  );
}
