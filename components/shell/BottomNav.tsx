"use client";

import * as React from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Ellipsis, LoaderCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV, isActive } from "@/components/shell/nav";

/** Secciones con pestaña propia en móvil; el resto vive en "Más". */
const PRIMARY = ["/", "/comites", "/pipeline", "/comodatos"];

/**
 * Barra de pestañas inferior para móvil (oculta en escritorio). Cuatro secciones de uso diario
 * más "Más", que abre el menú completo. Respeta la zona segura del iPhone.
 */
export function BottomNav({ onMore, moreOpen }: { onMore: () => void; moreOpen: boolean }) {
  const pathname = usePathname();
  const items = PRIMARY.map((href) => NAV.find((item) => item.href === href)!).filter(Boolean);
  const otherActive = !items.some((item) => isActive(pathname, item));
  return (
    <nav
      aria-label="Secciones"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line-2 bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="grid grid-cols-5">
        {items.map((item) => {
          const active = isActive(pathname, item);
          return (
            <li key={item.href}>
              <Link href={item.href} aria-current={active ? "page" : undefined} className={cn("flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium", active ? "text-navy" : "text-ink-3")}>
                <TabIcon icon={item.icon} active={active} />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
        <li>
          <button type="button" onClick={onMore} aria-expanded={moreOpen} className={cn("flex h-14 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium", otherActive || moreOpen ? "text-navy" : "text-ink-3")}>
            <span className={cn("flex h-7 w-10 items-center justify-center rounded-full", (otherActive || moreOpen) && "bg-navy text-crema")}>
              <Ellipsis className="size-5" />
            </span>
            <span>Más</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}

function TabIcon({ icon: Icon, active }: { icon: LucideIcon; active: boolean }) {
  const { pending } = useLinkStatus();
  return (
    <span className={cn("flex h-7 w-10 items-center justify-center rounded-full transition-colors", active && "bg-navy text-crema")}>
      {pending ? <LoaderCircle className="size-5 animate-spin" aria-label="Cargando" /> : <Icon className="size-5" />}
    </span>
  );
}
