const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Splits a typed list into unique lowercase addresses. Rejects anything that is not an email. */
export function splitAddresses(value: string | string[] | null | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(",") : (value ?? "");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,;\n]+/)) {
    const email = part.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    if (!EMAIL_RE.test(email) || email.length > 254) throw new Error("El destinatario no es un correo.");
    seen.add(email);
    out.push(email);
  }
  return out;
}

/** Comma-separated form stored on the outbox and written in the RFC 5322 header. */
export function joinAddresses(value: string | string[] | null | undefined): string {
  return splitAddresses(value).join(", ");
}
