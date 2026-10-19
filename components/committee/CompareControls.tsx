"use client";

import { useRouter } from "next/navigation";
import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { shortDate } from "@/lib/utils";

/** Selectores "Desde / Hasta" de la comparación; navegan al cambiar, sin botón. */
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
      <Field label="Desde" htmlFor="compare-left" inline className="gap-2">
        <Select id="compare-left" value={left} onChange={(event) => go(Number(event.target.value), right)} className="w-[200px]">
          {options}
        </Select>
      </Field>
      <Button variant="ghost" size="icon" aria-label="Intercambiar comités" onClick={() => go(right, left)}>
        <ArrowLeftRight />
      </Button>
      <Field label="Hasta" htmlFor="compare-right" inline className="gap-2">
        <Select id="compare-right" value={right} onChange={(event) => go(left, Number(event.target.value))} className="w-[200px]">
          {options}
        </Select>
      </Field>
    </>
  );
}
