"use client";

import * as React from "react";

/** Mismo umbral que el breakpoint `sm` de Tailwind (640 px): por debajo, el tablero es de una columna por pantalla. */
const MOBILE_QUERY = "(max-width: 639px)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(MOBILE_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** `true` en pantallas menores de 640 px. En el servidor (y durante la hidratación) devuelve `false`. */
export function useIsMobile(): boolean {
  return React.useSyncExternalStore(subscribe, () => window.matchMedia(MOBILE_QUERY).matches, () => false);
}
