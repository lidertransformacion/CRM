"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Role } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/comites", label: "Comités" },
  { href: "/pipeline", label: "Pay Line" },
  { href: "/kpis", label: "KPIs" },
  { href: "/comodatos", label: "Comodatos" },
  { href: "/clientes", label: "Clientes" },
  { href: "/correos", label: "Correos" },
];

export function AppNav({
  email,
  role,
  mustChangePassword,
}: {
  email: string;
  role: Role;
  mustChangePassword: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const links = mustChangePassword ? [] : LINKS;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[var(--navy)] text-white">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-3 px-4 py-3">
        <Link href={mustChangePassword ? "/cuenta" : "/comites"} className="mr-2 leading-tight">
          <span className="block text-[11px] tracking-[0.16em] text-white/55">LIBERTARIO COFFEE</span>
          <span className="block text-base font-semibold">CRM Pay Line</span>
        </Link>
        <nav className="flex flex-wrap gap-1">
          {links.map((link) => {
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
          {!mustChangePassword && role === "admin" && (
            <Link
              href="/ajustes"
              className={cn(
                "rounded-full px-3 py-1.5 text-sm",
                pathname.startsWith("/ajustes") ? "bg-white text-[var(--navy)]" : "text-white/80 hover:bg-white/10",
              )}
            >
              Ajustes
            </Link>
          )}
          <Link
            href="/cuenta"
            className={cn(
              "rounded-full px-3 py-1.5 text-sm",
              pathname.startsWith("/cuenta") ? "bg-white text-[var(--navy)]" : "text-white/80 hover:bg-white/10",
            )}
          >
            Cuenta
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm text-white/70">
          <span className="hidden sm:inline">{email}</span>
          <button type="button" onClick={logout} className="rounded-full px-3 py-1.5 text-white hover:bg-white/10">
            Salir
          </button>
        </div>
      </div>
    </header>
  );
}
