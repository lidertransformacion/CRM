/** One role per user. `user` is the previous commercial role and is read as `comercial`. */
export type Role = "admin" | "comercial" | "legal" | "gerencia";

export function normalizeRole(role: string | null | undefined): Role {
  if (role === "admin" || role === "comercial" || role === "legal" || role === "gerencia") return role;
  return "comercial";
}
