import { normalizeRole, type Role } from "@/lib/auth/roles";

/** What a contract action checks. Section access is `canAccess` in scopes.ts. */
export type Permission =
  | "manage_users"
  | "view_contracts"
  | "manage_files"
  | "upload_contract"
  | "link_any"
  | "view_gerencia";

const MATRIX: Record<Role, Record<Permission, boolean>> = {
  admin: {
    manage_users: true,
    view_contracts: true,
    manage_files: true,
    upload_contract: true,
    link_any: true,
    view_gerencia: true,
  },
  legal: {
    manage_users: false,
    view_contracts: true,
    manage_files: true,
    upload_contract: true,
    link_any: true,
    view_gerencia: false,
  },
  comercial: {
    manage_users: false,
    view_contracts: true,
    manage_files: true,
    upload_contract: true,
    link_any: true,
    view_gerencia: true,
  },
  gerencia: {
    manage_users: false,
    view_contracts: true,
    manage_files: false,
    upload_contract: false,
    link_any: false,
    view_gerencia: true,
  },
};

export function can(role: string | null | undefined, permission: Permission): boolean {
  return MATRIX[normalizeRole(role)][permission];
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrativo",
  comercial: "Comercial",
  legal: "Legal",
  gerencia: "Gerencia",
};
