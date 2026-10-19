"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";

/** Dispara la barra desde código: `window.dispatchEvent(new Event("crm:navigation-start"))`. */
export const NAVIGATION_START_EVENT = "crm:navigation-start";

/**
 * Barra de progreso fina en el borde superior. Arranca al hacer clic en un enlace interno
 * (o al recibir el evento `crm:navigation-start`) y termina cuando cambia la URL.
 * Da respuesta inmediata al clic aunque el servidor tarde en responder.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, setState] = React.useState<"idle" | "loading" | "done">("idle");
  const timeout = React.useRef<number | null>(null);
  const key = `${pathname}?${searchParams.toString()}`;
  const lastKey = React.useRef(key);

  const start = React.useCallback(() => {
    setState("loading");
    if (timeout.current) window.clearTimeout(timeout.current);
    // Red de seguridad: si algo falla y la URL no cambia, la barra se retira sola.
    timeout.current = window.setTimeout(() => setState("idle"), 10000);
  }, []);

  React.useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname.startsWith("/api/")) return;
      const current = window.location.pathname + window.location.search;
      if (url.pathname + url.search === current) return;
      start();
    }
    function onCustom() {
      start();
    }
    document.addEventListener("click", onClick, true);
    window.addEventListener(NAVIGATION_START_EVENT, onCustom);
    window.addEventListener("popstate", onCustom);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener(NAVIGATION_START_EVENT, onCustom);
      window.removeEventListener("popstate", onCustom);
    };
  }, [start]);

  React.useEffect(() => {
    if (lastKey.current === key) return;
    lastKey.current = key;
    if (timeout.current) window.clearTimeout(timeout.current);
    setState("done");
    const id = window.setTimeout(() => setState("idle"), 320);
    return () => window.clearTimeout(id);
  }, [key]);

  if (state === "idle") return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[120] h-[3px]" role="progressbar" aria-label="Cargando página" aria-valuetext={state === "done" ? "Listo" : "Cargando"}>
      <div
        className="h-full bg-navy-2 shadow-[0_0_8px_rgba(45,81,161,.6)]"
        style={{
          width: state === "done" ? "100%" : "80%",
          transition: state === "done" ? "width 160ms ease-out, opacity 220ms ease-out 120ms" : "width 6s cubic-bezier(0.1, 0.6, 0.2, 1)",
          opacity: state === "done" ? 0 : 1,
        }}
      />
    </div>
  );
}
