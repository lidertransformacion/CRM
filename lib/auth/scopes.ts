import { normalizeRole, type Role } from "@/lib/auth/roles";

/** A section of the CRM. The menu and the API use the same list. */
export type Scope =
  | "commercial"
  | "committee"
  | "visits"
  | "mail"
  | "contracts"
  | "files"
  | "signatures"
  | "gerencia"
  | "users"
  | "account";

const ALL: Scope[] = ["commercial", "committee", "visits", "mail", "contracts", "files", "signatures", "gerencia", "users", "account"];

/** Comercial matches admin except creating, deactivating, or deleting users. */
const ACCESS: Record<Role, readonly Scope[]> = {
  admin: ALL,
  comercial: ALL.filter((scope) => scope !== "users"),
  legal: ["mail", "contracts", "files", "signatures", "account"],
  gerencia: ["mail", "contracts", "signatures", "gerencia", "account"],
};

export function canAccess(role: string | null | undefined, scope: Scope): boolean {
  return ACCESS[normalizeRole(role)].includes(scope);
}

export function scopesFor(role: string | null | undefined): readonly Scope[] {
  return ACCESS[normalizeRole(role)];
}

/**
 * Which scope a URL belongs to. Null means any signed-in role (home and the denial page).
 * Viewing a contract PDF is `contracts`. Changing files or folders is `files`.
 */
export function scopeForPath(pathname: string, method = "GET"): Scope | null {
  if (pathname === "/" || pathname === "/sin-acceso") return null;
  if (pathname === "/cuenta" || pathname.startsWith("/api/auth/")) return "account";
  if (pathname.startsWith("/ajustes") || pathname.startsWith("/api/users") || pathname.startsWith("/api/admin")) return "users";
  if (pathname === "/api/storage/recalculate") return "users";
  if (pathname === "/api/storage") return "files";
  if (pathname.startsWith("/comites") || pathname.startsWith("/api/committee")) return "committee";
  if (
    pathname.startsWith("/pipeline") ||
    pathname.startsWith("/kpis") ||
    pathname.startsWith("/comodatos") ||
    pathname.startsWith("/clientes") ||
    pathname.startsWith("/api/pipeline") ||
    pathname.startsWith("/api/kpis") ||
    pathname.startsWith("/api/leads") ||
    pathname.startsWith("/api/comodatos") ||
    pathname.startsWith("/api/clients") ||
    pathname.startsWith("/api/search")
  ) {
    return "commercial";
  }
  if (pathname.startsWith("/visitas") || pathname.startsWith("/api/visits")) return "visits";
  if (pathname.startsWith("/correos") || pathname.startsWith("/api/correos") || pathname.startsWith("/api/mail")) return "mail";
  if (pathname.startsWith("/firmas") || pathname.startsWith("/api/firmas")) return "signatures";
  if (pathname.startsWith("/gerencia")) return "gerencia";
  if (pathname.startsWith("/legal/drive") || pathname.startsWith("/api/legal/drive") || pathname.startsWith("/api/legal/folders")) return "files";
  if (pathname.startsWith("/api/legal/files")) return method === "GET" || method === "HEAD" ? "contracts" : "files";
  if (pathname.includes("/firma")) return "signatures";
  if (pathname.startsWith("/api/legal/contracts") && method !== "GET" && method !== "HEAD") return "files";
  if (pathname.startsWith("/legal") || pathname.startsWith("/api/legal")) return "contracts";
  return null;
}
