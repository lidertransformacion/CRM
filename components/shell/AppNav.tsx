"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/comites", label: "Comités" },
  { href: "/pipeline", label: "Pay Line" },
  { href: "/kpis", label: "KPIs" },
  { href: "/comodatos", label: "Comodatos" },
  { href: "/clientes", label: "Clientes" },
  { href: "/correos", label: "Correos" },
];

export function AppNav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[var(--navy)] text-white">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-3 px-4 py-3">
        <Link href="/comites" className="mr-2 leading-tight">
          <span className="block text-[11px] tracking-[0.16em] text-white/55">LIBERTARIO COFFEE</span>
          <span className="block text-base font-semibold">CRM Pay Line</span>
        </Link>
        <nav className="flex flex-wrap gap-1">
          {LINKS.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm",
                  active ? "bg-white text-[var(--navy)]" : "text-white/80 hover:bg-white/10",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
