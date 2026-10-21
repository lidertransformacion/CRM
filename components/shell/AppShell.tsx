"use client";

import * as React from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LoaderCircle, LogOut, Search, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/ui/kbd";
import { Sheet, SheetContent, SheetBody } from "@/components/ui/sheet";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { LogoMark } from "@/components/shell/LogoMark";
import { CommandPaletteContext } from "@/components/shell/command-palette-context";
import { NavigationProgress } from "@/components/shell/NavigationProgress";
import { BottomNav } from "@/components/shell/BottomNav";
import { currentSection, isActive, navItems } from "@/components/shell/nav";
import type { Role } from "@/lib/auth/roles";
import { ROLE_LABEL } from "@/lib/auth/permissions";
import { canAccess } from "@/lib/auth/scopes";

export type ShellUser = { email: string; role: Role } | null;

export function AppShell({ children, user = null }: { children: React.ReactNode; user?: ShellUser }) {
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

  const items = navItems(user?.role);
  const searchRecords = canAccess(user?.role, "commercial");
  const palette = React.useMemo(
    () => ({
      open: () => setPaletteOpen(true),
      close: () => setPaletteOpen(false),
      toggle: () => setPaletteOpen((value) => !value),
      isOpen: paletteOpen,
    }),
    [paletteOpen],
  );

  if (pathname === "/login" || pathname.startsWith("/firmar") || pathname.startsWith("/verificar")) {
    return <div className="min-h-dvh bg-bg">{children}</div>;
  }

  return (
    <CommandPaletteContext.Provider value={palette}>
      <React.Suspense fallback={null}>
        <NavigationProgress />
      </React.Suspense>
      <div className="min-h-dvh">
        <aside
          className="fixed inset-y-0 left-0 z-30 hidden w-[var(--sidebar-w)] flex-col border-r border-line-2 bg-surface text-ink print:hidden lg:flex"
          aria-label="Navegación principal"
        >
          <Brand />
          <SidebarNav pathname={pathname} user={user} items={items} />
          <SidebarFooter user={user} />
        </aside>

        <div className="print:pl-0 lg:pl-[var(--sidebar-w)]">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line-2 bg-bg/85 px-4 backdrop-blur print:hidden lg:px-7">
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
              {searchRecords && (
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
              )}
            </div>
          </header>
          <main id="contenido" className="pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0">{children}</main>
        </div>

        <BottomNav items={items} onMore={() => setMobileOpen(true)} moreOpen={mobileOpen} />

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" size="sm" title={<BrandLockup />} description="Menú" className="[&_[data-slot=description]]:sr-only">
            <SheetBody className="px-0 py-2">
              <SidebarNav pathname={pathname} user={user} items={items} />
            </SheetBody>
            <SidebarFooter user={user} />
          </SheetContent>
        </Sheet>

        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} sections={items} lookup={searchRecords} />
      </div>
    </CommandPaletteContext.Provider>
  );
}

/** Sello de marca igual al de la app de mantenimiento: isotipo + LIBERTARIO + subtítulo. */
function BrandLockup() {
  return (
    <span className="flex items-center gap-3">
      <LogoMark className="size-10 shrink-0 text-ink" />
      <span className="font-serif text-[15px] font-normal leading-none tracking-[0.2em] text-ink">
        LIBERTARIO
        <small className="mt-[3px] block font-sans text-[10px] font-normal uppercase tracking-[0.16em] text-ink-3">CRM Comercial</small>
      </span>
    </span>
  );
}

function Brand() {
  return (
    <Link href="/" className="block border-b border-line-2 px-[18px] py-[18px]">
      <BrandLockup />
    </Link>
  );
}

function SidebarNav({ pathname, user, items }: { pathname: string; user: ShellUser; items: ReturnType<typeof navItems> }) {
  const settingsActive = pathname === "/ajustes";
  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 py-2.5">
      {items.map((item) => (
        <NavRow key={item.href} href={item.href} icon={item.icon} label={item.label} description={item.description} active={isActive(pathname, item)} />
      ))}
      {user?.role === "admin" && (
        <div className="mt-3.5 border-t border-line-2 pt-2">
          <NavRow href="/ajustes" icon={Settings} label="Ajustes" description="Crear usuarios y contraseñas" active={settingsActive} />
        </div>
      )}
    </nav>
  );
}

function NavRow({ href, icon, label, description, active }: { href: string; icon: React.ComponentType<{ className?: string }>; label: string; description: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] transition-colors max-lg:py-3 max-lg:text-[15px]",
        active ? "bg-navy font-medium text-crema" : "text-ink-2 hover:bg-accent-soft",
      )}
    >
      <NavIcon icon={icon} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span>{label}</span>
        <small className={cn("truncate text-[11px] font-normal max-lg:text-xs", active ? "text-crema/70" : "text-ink-3")}>{description}</small>
      </span>
    </Link>
  );
}

/** Nombre legible a partir del correo: "juan.perez@…" → "Juan Perez". */
const KNOWN_NAMES: Record<string, string> = { lidertransformacion: "Transformación Digital" };

function displayName(email: string) {
  const local = email.split("@")[0].toLowerCase();
  if (KNOWN_NAMES[local]) return KNOWN_NAMES[local];
  return email
    .split("@")[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Tarjeta de usuario al pie, como en mantenimiento: avatar, nombre, rol y salir. */
function SidebarFooter({ user }: { user: ShellUser }) {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }
  const name = user ? displayName(user.email) : "Mi cuenta";
  return (
    <div className="safe-bottom border-t border-line-2 px-3.5 py-3">
      <div className="flex items-center gap-3">
        <Link href="/cuenta" className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 hover:bg-accent-soft" title="Mi cuenta">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-navy font-serif text-[15px] text-crema" aria-hidden>
            {name.charAt(0)}
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-[13px] font-medium text-ink">{name}</span>
            <span className="truncate text-xs text-ink-3">{user ? ROLE_LABEL[user.role] : "Equipo Comercial"}</span>
          </span>
        </Link>
        <button type="button" onClick={logout} aria-label="Cerrar sesión" title="Cerrar sesión" className="grid size-10 shrink-0 place-items-center rounded-lg text-ink-2 hover:bg-accent-soft hover:text-ink">
          <LogOut className="size-[18px]" />
        </button>
      </div>
    </div>
  );
}

/** Icono del menú: muestra un spinner mientras Next carga la sección (useLinkStatus). */
function NavIcon({ icon: Icon }: { icon: React.ComponentType<{ className?: string }> }) {
  const { pending } = useLinkStatus();
  return pending ? <LoaderCircle className="size-[18px] shrink-0 animate-spin" aria-label="Cargando" /> : <Icon className="size-[18px] shrink-0" />;
}
