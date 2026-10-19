/** The only domain allowed to receive an account. Case-insensitive, exact host, no subdomain. */
export const COMPANY_DOMAIN = "libertariocoffee.com";

export const BOOTSTRAP_ADMIN_EMAIL = "lidertransformacion@libertariocoffee.com";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isLibertarioEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  const at = normalized.indexOf("@");
  if (at <= 0 || at !== normalized.lastIndexOf("@")) return false;
  if (/\s/.test(normalized)) return false;
  return normalized.slice(at) === `@${COMPANY_DOMAIN}`;
}
