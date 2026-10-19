"use client";

import * as React from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LoaderCircle, LogOut, Search, Settings, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/ui/kbd";
import { Sheet, SheetContent, SheetBody } from "@/components/ui/sheet";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { LogoMark } from "@/components/shell/LogoMark";
import { CommandPaletteContext } from "@/components/shell/command-palette-context";
import { NavigationProgress } from "@/components/shell/NavigationProgress";
import { BottomNav } from "@/components/shell/BottomNav";
import { NAV, currentSection, isActive } from "@/components/shell/nav";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const section = currentSection(pathname);

  React.useEffect(() => setMobileOpen(false), [pathname]);

  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const palette = React.useMemo(
    () => ({
      open: () => setPaletteOpen(true),
      close: () => setPaletteOpen(false),
      toggle: () => setPaletteOpen((value) => !value),
      isOpen: paletteOpen,
    }),
    [paletteOpen],
  );

  if (pathname === "/login") {
    return <div className="min-h-dvh bg-bg">{children}</div>;
  }

  return (
    <CommandPaletteContext.Provider value={palette}>
      <React.Suspense fallback={null}>
        <NavigationProgress />
      </React.Suspense>
      <div className="min-h-dvh">
        <aside
          className="fixed inset-y-0 left-0 z-30 hidden w-[var(--sidebar-w)] flex-col bg-navy text-crema lg:flex"
          aria-label="Navegación principal"
        >
          <Brand />
          <SidebarNav pathname={pathname} />
          <SidebarFooter />
        </aside>

        <div className="lg:pl-[var(--sidebar-w)]">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line-2 bg-bg/85 px-4 backdrop-blur lg:px-7">
            <Link href="/" className="flex items-center gap-2 lg:hidden">
              <LogoMark className="size-6 text-navy" />
              <span className="font-sans text-sm font-semibold">
                CRM Libertario
              </span>
            </Link>
            <div className="hidden min-w-0 items-center gap-2 text-sm lg:flex">
              {section && (
                <>
                  <span className="font-medium text-ink">{section.label}</span>
                  <span className="text-ink-3">·</span>
                  <span className="truncate text-ink-3">
                    {section.description}
                  </span>
                </>
              )}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-surface px-3 text-sm text-ink-3 transition-colors hover:border-[rgba(24,43,85,.3)] hover:text-ink"
                aria-label="Buscar en todo el CRM"
              >
                <Search className="size-4" />
                <span className="hidden sm:inline">
                  Buscar cliente, equipo u oportunidad
                </span>
                <span className="hidden items-center gap-0.5 sm:inline-flex">
                  <Kbd>⌘</Kbd>
                  <Kbd>K</Kbd>
                </span>
              </button>
            </div>
          </header>
          <main id="contenido" className="pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0">{children}</main>
        </div>

        <BottomNav onMore={() => setMobileOpen(true)} moreOpen={mobileOpen} />

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent
            side="left"
            size="sm"
            title="CRM Libertario"
            description="Equipo Comercial"
            className="bg-navy text-crema [&_.eyebrow]:text-crema/60 [&_[data-slot=title]]:text-crema [&_[data-slot=description]]:text-crema/60 [&_button[aria-label=Cerrar]]:text-crema/70"
          >
            <SheetBody className="px-2 py-2">
              <SidebarNav pathname={pathname} />
            </SheetBody>
            <SidebarFooter />
          </SheetContent>
        </Sheet>

        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      </div>
    </CommandPaletteContext.Provider>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-3 px-5 pb-4 pt-5">
      <LogoMark className="size-[34px] text-crema" />
      <span className="leading-tight">
        <span className="block text-[10px] font-medium uppercase tracking-[0.18em] text-crema/60">
          Libertario Coffee
        </span>
        <span className="block font-serif text-lg text-crema">
          CRM Comercial
        </span>
      </span>
    </Link>
  );
}

function SidebarNav({ pathname }: { pathname: string }) {
  return (
    <nav className="flex-1 space-y-0.5 px-3 py-2">
      {NAV.map((item) => {
        const active = isActive(pathname, item);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-md px-3 py-2 transition-colors",
              active
                ? "bg-white/12 text-white"
                : "text-crema/75 hover:bg-white/8 hover:text-white",
            )}
          >
            <NavIcon icon={Icon} active={active} />
            <span className="min-w-0 leading-tight">
              <span className="block text-sm font-medium">{item.label}</span>
              <span
                className={cn(
                  "block truncate text-[11px]",
                  active ? "text-white/70" : "text-crema/50",
                )}
              >
                {item.description}
              </span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarFooter() {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }
  return (
    <div className="border-t border-white/10 px-5 py-4 text-[11px] leading-relaxed text-crema/55">
      <div className="mb-2 grid grid-cols-3 gap-1 text-sm">
        <Link href="/cuenta" className="flex h-11 flex-col items-center justify-center gap-0.5 rounded-md text-crema/80 hover:bg-white/8 hover:text-white lg:h-9 lg:flex-row lg:gap-1.5">
          <UserRound className="size-4" /> Cuenta
        </Link>
        <Link href="/ajustes" className="flex h-11 flex-col items-center justify-center gap-0.5 rounded-md text-crema/80 hover:bg-white/8 hover:text-white lg:h-9 lg:flex-row lg:gap-1.5">
          <Settings className="size-4" /> Ajustes
        </Link>
        <button type="button" onClick={logout} className="flex h-11 flex-col items-center justify-center gap-0.5 rounded-md text-crema/80 hover:bg-white/8 hover:text-white lg:h-9 lg:flex-row lg:gap-1.5">
          <LogOut className="size-4" /> Salir
        </button>
      </div>
      <p className="text-center lg:text-left">No envía correos ni escribe en Odoo.</p>
    </div>
  );
}

/** Icono del menú: muestra un spinner mientras Next carga la sección (useLinkStatus). */
function NavIcon({ icon: Icon, active }: { icon: React.ComponentType<{ className?: string }>; active: boolean }) {
  const { pending } = useLinkStatus();
  return (
    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md", active ? "bg-amarillo text-navy" : "bg-white/8 text-crema/80 group-hover:bg-white/12")}>
      {pending ? <LoaderCircle className="size-4 animate-spin" aria-label="Cargando" /> : <Icon className="size-4" />}
    </span>
  );
}
