/** Raw bytes kept under Gmail's 25 MB message limit after base64 MIME encoding. */
export const MAX_MAIL_BYTES = 20 * 1024 * 1024;

/** D1 refuses large rows. Anything bigger needs the MAIL_FILES R2 binding. */
export const MAX_D1_FILE_BYTES = 400 * 1024;

const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "a", "h1", "h2", "h3", "h4",
  "span", "div", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "img", "blockquote", "hr",
]);

const STYLE_OK = /^(color|background|background-color|text-align|text-decoration|font-weight|font-style|font-size|font-family|line-height|border|border-[\w-]+|padding|padding-[\w-]+|margin|margin-[\w-]+|width|height|vertical-align|border-collapse)$/i;

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function decodeBasic(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Plain template text becomes paragraphs the editor can open. */
export function toEditorHtml(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "<p></p>";
  if (/<\/?[a-z][\s\S]*>/i.test(trimmed)) return sanitizeEmailHtml(trimmed);
  return trimmed
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeText(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/h[1-4]>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/t[dh]>/gi, "\t");
  return decodeBasic(withBreaks.replace(/<[^>]+>/g, ""))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function safeStyle(raw: string): string {
  const kept: string[] = [];
  for (const chunk of raw.split(";")) {
    const [name, ...rest] = chunk.split(":");
    if (!name || !rest.length) continue;
    const prop = name.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (!STYLE_OK.test(prop)) continue;
    if (/url\s*\(|expression|javascript|@import/i.test(value)) continue;
    if (value.length > 200) continue;
    kept.push(`${prop}: ${value}`);
  }
  return kept.join("; ");
}

function safeUrl(tag: string, value: string): string | null {
  const url = value.trim().replace(/^['"]|['"]$/g, "");
  if (tag === "a") {
    if (/^(https?:|mailto:)/i.test(url) && !/\s/.test(url)) return url;
    return null;
  }
  if (/^cid:[A-Za-z0-9@._-]+$/.test(url)) return url;
  if (/^\/api\/mail\/files\/[0-9a-f-]{36}$/i.test(url)) return url;
  if (/^https:\/\//i.test(url) && !/\s/.test(url) && url.length < 2000) return url;
  if (/^data:image\/(?:jpeg|jpg|png|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(url) && url.length <= 200_000) return url.replace(/\s/g, "");
  return null;
}

function sanitizeAttrs(tag: string, raw: string): string {
  const attrs: string[] = [];
  const re = /([a-zA-Z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    const name = match[1].toLowerCase();
    const value = match[3] ?? match[4] ?? match[5] ?? "";
    if (name.startsWith("on") || name === "srcdoc" || name === "style") {
      if (name === "style") {
        const style = safeStyle(value);
        if (style) attrs.push(`style="${escapeText(style)}"`);
      }
      continue;
    }
    if ((name === "href" && tag === "a") || (name === "src" && tag === "img")) {
      const url = safeUrl(tag, value);
      if (url) attrs.push(`${name}="${escapeText(url)}"`);
      continue;
    }
    if (name === "alt" || name === "title") {
      attrs.push(`${name}="${escapeText(value.slice(0, 200))}"`);
      continue;
    }
    if ((name === "colspan" || name === "rowspan") && /^\d{1,2}$/.test(value)) {
      attrs.push(`${name}="${value}"`);
      continue;
    }
    if (name === "align" && /^(left|right|center)$/i.test(value)) {
      attrs.push(`align="${value.toLowerCase()}"`);
      continue;
    }
    if (name === "data-file-id" && /^[0-9a-f-]{36}$/i.test(value)) {
      attrs.push(`data-file-id="${value.toLowerCase()}"`);
    }
  }
  if (tag === "a" && attrs.some((item) => item.startsWith("href="))) attrs.push('rel="noopener noreferrer"');
  return attrs.length ? ` ${attrs.join(" ")}` : "";
}

/** Drops scripts, event handlers, and unknown tags. Keeps tables, color, and safe links. */
export function sanitizeEmailHtml(input: string): string {
  const withoutDanger = input
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\s*(script|style|iframe|object|embed|form|link|meta)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|form|link|meta)\b[^>]*\/?\s*>/gi, "");
  let out = "";
  let index = 0;
  while (index < withoutDanger.length) {
    const start = withoutDanger.indexOf("<", index);
    if (start === -1) {
      out += escapeText(decodeBasic(withoutDanger.slice(index)));
      break;
    }
    out += escapeText(decodeBasic(withoutDanger.slice(index, start)));
    if (withoutDanger.startsWith("</", start)) {
      const end = withoutDanger.indexOf(">", start);
      if (end === -1) break;
      const name = withoutDanger.slice(start + 2, end).trim().toLowerCase().split(/\s/)[0] ?? "";
      if (ALLOWED_TAGS.has(name) && name !== "br" && name !== "img" && name !== "hr") out += `</${name}>`;
      index = end + 1;
      continue;
    }
    const end = withoutDanger.indexOf(">", start);
    if (end === -1) break;
    const inner = withoutDanger.slice(start + 1, end).replace(/\/\s*$/, "");
    const name = (inner.match(/^[a-zA-Z0-9]+/)?.[0] ?? "").toLowerCase();
    const attrRaw = inner.slice(name.length);
    if (ALLOWED_TAGS.has(name)) out += `<${name}${sanitizeAttrs(name, attrRaw)}>`;
    index = end + 1;
  }
  return out || "<p></p>";
}

const FILE_ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function fileIdsInHtml(html: string): string[] {
  const ids = new Set<string>();
  const patterns = [/\/api\/mail\/files\/([0-9a-f-]{36})/gi, /data-file-id="([0-9a-f-]{36})"/gi];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html))) {
      if (FILE_ID.test(match[1] ?? "")) ids.add((match[1] ?? "").toLowerCase());
    }
  }
  return [...ids];
}

export function rewriteFileSrc(html: string, idToCid: Map<string, string>): string {
  return html.replace(/\/api\/mail\/files\/([0-9a-f-]{36})/gi, (full, id: string) => {
    const cid = idToCid.get(id.toLowerCase());
    return cid ? `cid:${cid}` : full;
  });
}
