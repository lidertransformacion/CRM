import type { LucideIcon } from "lucide-react";
import { Briefcase, ChartBar, ClipboardList, Coffee, Folder, FolderOpen, LayoutDashboard, Mail, MapPinned, PenLine, SquareKanban, Users } from "lucide-react";
import { normalizeRole, type Role } from "@/lib/auth/roles";

export type NavItem = { href: string; label: string; description: string; icon: LucideIcon; exact?: boolean; roles?: Role[] };

const ALL: Role[] = ["admin", "comercial", "legal", "gerencia"];
const OPERATIONS: Role[] = ["admin", "comercial"];
const FILES: Role[] = ["admin", "comercial", "legal"];
const DIRECTION: Role[] = ["admin", "comercial"];

/** Secciones de la app. Cada rol ve solo las suyas. */
export const NAV: NavItem[] = [
  { href: "/", label: "Inicio", description: "Qué requiere atención hoy", icon: LayoutDashboard, exact: true, roles: ALL },
  { href: "/comites", label: "Comités", description: "Actas, pendientes y responsables", icon: ClipboardList, roles: OPERATIONS },
  { href: "/pipeline", label: "Pipeline", description: "Oportunidades Pay Line por etapa", icon: SquareKanban, roles: OPERATIONS },
  { href: "/kpis", label: "KPIs", description: "Resultados por vendedor y metas", icon: ChartBar, roles: OPERATIONS },
  { href: "/comodatos", label: "Equipos", description: "Comodatos, garantías y mantenimiento", icon: Coffee, roles: OPERATIONS },
  { href: "/clientes", label: "Clientes", description: "Historia completa de cada cliente", icon: Users, roles: OPERATIONS },
  { href: "/visitas", label: "Visitas", description: "Reportes de visita y cobertura semanal", icon: MapPinned, roles: OPERATIONS },
  { href: "/legal", label: "Contratos", description: "Consulta de contratos y vencimientos", icon: Folder, roles: ALL },
  { href: "/legal/drive", label: "Archivos", description: "Carpetas y PDF del archivo", icon: FolderOpen, roles: FILES },
  { href: "/firmas", label: "Firmas", description: "Lo que te toca firmar", icon: PenLine, roles: ALL },
  { href: "/correos", label: "Correos", description: "Borradores listos para enviar", icon: Mail, roles: ALL },
  { href: "/gerencia", label: "Gerencia", description: "Números, proyección y contratos", icon: Briefcase, roles: DIRECTION },
];

const HOME_COPY: Partial<Record<Role, string>> = {
  legal: "Contratos por vencer, firmas y novedades",
  gerencia: "Números, proyección y firmas",
};

export function navItems(role: string | null | undefined): NavItem[] {
  const normalized = role ? normalizeRole(role) : null;
  return NAV.filter((item) => !item.roles || (normalized != null && item.roles.includes(normalized))).map((item) => {
    if (item.href !== "/" || !normalized) return item;
    const description = HOME_COPY[normalized];
    return description ? { ...item, description } : item;
  });
}

export function isActive(pathname: string, item: NavItem): boolean {
  if (item.href === "/legal") {
    return pathname === "/legal" || (pathname.startsWith("/legal/") && !pathname.startsWith("/legal/drive"));
  }
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function currentSection(pathname: string): NavItem | undefined {
  const matches = NAV.filter((item) => isActive(pathname, item));
  return matches.sort((a, b) => b.href.length - a.href.length)[0];
}
