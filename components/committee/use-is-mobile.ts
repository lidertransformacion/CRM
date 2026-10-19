"use client";

import { useSyncExternalStore } from "react";

/** Mismo corte que el breakpoint `sm` de Tailwind: por debajo es "móvil". */
const QUERY = "(max-width: 639px)";

function subscribe(callback: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

/**
 * `true` por debajo de `sm`. En el servidor (y durante la hidratación) devuelve `false`, así que
 * el layout debe resolverse con clases `max-sm:`; este hook es solo para comportamiento
 * (qué hace un toque, atributos ARIA), nunca para decidir qué se pinta.
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
