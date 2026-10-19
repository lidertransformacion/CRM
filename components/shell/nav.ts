import type { LucideIcon } from "lucide-react";
import { ChartBar, ClipboardList, Coffee, LayoutDashboard, Mail, SquareKanban, Users } from "lucide-react";

export type NavItem = { href: string; label: string; description: string; icon: LucideIcon; exact?: boolean };

/** Secciones de la app. El orden es el de uso diario: primero el resumen, luego lo operativo. */
export const NAV: NavItem[] = [
  { href: "/", label: "Inicio", description: "Qué requiere atención hoy", icon: LayoutDashboard, exact: true },
  { href: "/comites", label: "Comités", description: "Actas, pendientes y responsables", icon: ClipboardList },
  { href: "/pipeline", label: "Pipeline", description: "Oportunidades Pay Line por etapa", icon: SquareKanban },
  { href: "/kpis", label: "KPIs", description: "Resultados por vendedor y metas", icon: ChartBar },
  { href: "/comodatos", label: "Equipos", description: "Comodatos, garantías y mantenimiento", icon: Coffee },
  { href: "/clientes", label: "Clientes", description: "Historia completa de cada cliente", icon: Users },
  { href: "/correos", label: "Correos", description: "Borradores listos para copiar", icon: Mail },
];

export function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function currentSection(pathname: string): NavItem | undefined {
  return NAV.find((item) => isActive(pathname, item));
}
