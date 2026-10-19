"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { useCommandPalette } from "@/components/shell/command-palette-context";

/** Botón "Buscar" de Inicio: abre el buscador global del AppShell (⌘K / Ctrl K). */
export function SearchShortcut() {
  const { open } = useCommandPalette();
  const [mac, setMac] = React.useState(true);
  React.useEffect(() => {
    setMac(/Mac|iPhone|iPad|iPod/.test(navigator.userAgent));
  }, []);

  return (
    <Button type="button" variant="secondary" onClick={open} aria-label="Buscar cliente, equipo u oportunidad" aria-keyshortcuts="Meta+K Control+K">
      <Search />
      Buscar
      <span className="hidden items-center gap-0.5 sm:inline-flex" aria-hidden>
        <Kbd>{mac ? "⌘" : "Ctrl"}</Kbd>
        <Kbd>K</Kbd>
      </span>
    </Button>
  );
}
