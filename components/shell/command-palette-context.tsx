"use client";

import * as React from "react";

type CommandPaletteApi = { open: () => void; close: () => void; toggle: () => void; isOpen: boolean };

export const CommandPaletteContext = React.createContext<CommandPaletteApi | null>(null);

/** Abre el buscador global (⌘K) desde cualquier componente cliente: `const { open } = useCommandPalette()`. */
export function useCommandPalette(): CommandPaletteApi {
  const context = React.useContext(CommandPaletteContext);
  if (!context) throw new Error("useCommandPalette requiere <AppShell> en el layout");
  return context;
}
