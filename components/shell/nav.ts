import type { LucideIcon } from "lucide-react";
import { Briefcase, ChartBar, ClipboardList, Coffee, Folder, LayoutDashboard, Mail, MapPinned, PenLine, SquareKanban, Users } from "lucide-react";
import { normalizeRole, type Role } from "@/lib/auth/roles";

export type NavItem = { href: string; label: string; description: string; icon: LucideIcon; exact?: boolean; roles?: Role[] };

/** Secciones de la app. El orden es el de uso diario: primero el resumen, luego lo operativo. */
export const NAV: NavItem[] = [
  { href: "/", label: "Inicio", description: "Qué requiere atención hoy", icon: LayoutDashboard, exact: true },
  { href: "/comites", label: "Comités", description: "Actas, pendientes y responsables", icon: ClipboardList },
  { href: "/pipeline", label: "Pipeline", description: "Oportunidades Pay Line por etapa", icon: SquareKanban },
  { href: "/kpis", label: "KPIs", description: "Resultados por vendedor y metas", icon: ChartBar },
  { href: "/comodatos", label: "Equipos", description: "Comodatos, garantías y mantenimiento", icon: Coffee },
  { href: "/clientes", label: "Clientes", description: "Historia completa de cada cliente", icon: Users },
  { href: "/visitas", label: "Visitas", description: "Reportes de visita y cobertura semanal", icon: MapPinned },
  { href: "/correos", label: "Correos", description: "Borradores listos para copiar", icon: Mail },
  { href: "/legal", label: "Contratos", description: "Archivos, contratos y novedades", icon: Folder },
  { href: "/firmas", label: "Firmas", description: "Lo que te toca firmar", icon: PenLine },
  { href: "/gerencia", label: "Gerencia", description: "Vista de dirección", icon: Briefcase, roles: ["admin", "gerencia"] },
];

export function navItems(role: string | null | undefined): NavItem[] {
  const normalized = role ? normalizeRole(role) : null;
  return NAV.filter((item) => !item.roles || (normalized != null && item.roles.includes(normalized)));
}

export function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function currentSection(pathname: string): NavItem | undefined {
  return NAV.find((item) => isActive(pathname, item));
}
