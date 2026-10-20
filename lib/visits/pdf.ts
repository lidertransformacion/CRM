import { reportNumber, reportSections } from "@/lib/visits/calc";
import type { VisitRecord } from "@/lib/visits/model";

type Jpeg = { bytes: Uint8Array; width: number; height: number; components: number };

function dataUrlBytes(dataUrl: string): { mime: string; bytes: Uint8Array } | null {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl || "");
  if (!match) return null;
  const binary = atob(match[2].replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { mime: match[1], bytes };
}

function jpegInfo(bytes: Uint8Array): Jpeg | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let index = 2;
  while (index + 8 < bytes.length) {
    if (bytes[index] !== 0xff) return null;
    const marker = bytes[index + 1];
    if (marker === 0xd8) {
      index += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break;
    const length = (bytes[index + 2] << 8) + bytes[index + 3];
    if (length < 2) return null;
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      return { bytes, height: (bytes[index + 5] << 8) + bytes[index + 6], width: (bytes[index + 7] << 8) + bytes[index + 8], components: bytes[index + 9] };
    }
    index += 2 + length;
  }
  return null;
}

function pdfEscape(text: string): string {
  let out = "";
  for (const char of text.normalize("NFC")) {
    const code = char.charCodeAt(0);
    if (code === 40 || code === 41 || code === 92) out += `\\${char}`;
    else if (code >= 32 && code <= 126) out += char;
    else if (code <= 255) out += `\\${code.toString(8).padStart(3, "0")}`;
    else out += "?";
  }
  return `(${out})`;
}

function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width && current) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

type Piece =
  | { kind: "text"; text: string; size: number; font: "F1" | "F2"; gap: number }
  | { kind: "image"; jpeg: Jpeg; caption: string };

/** Client-facing visit PDF. Spanish text uses WinAnsi so accents survive without an embedded font. */
export function visitPdf(visit: VisitRecord): Uint8Array {
  const pieces: Piece[] = [
    { kind: "text", text: "LIBERTARIO HOSPITALITY", size: 11, font: "F2", gap: 16 },
    { kind: "text", text: "Reporte de visita", size: 18, font: "F2", gap: 18 },
  ];
  for (const section of reportSections(visit, "client")) {
    pieces.push({ kind: "text", text: section.title, size: 13, font: "F2", gap: 16 });
    for (const line of section.lines) pieces.push({ kind: "text", text: line, size: 10, font: "F1", gap: 13 });
    pieces.push({ kind: "text", text: "", size: 10, font: "F1", gap: 8 });
  }
  visit.fotos.forEach((photo, index) => {
    const parsed = dataUrlBytes(photo.src);
    const jpeg = parsed?.mime === "image/jpeg" ? jpegInfo(parsed.bytes) : null;
    if (jpeg) pieces.push({ kind: "image", jpeg, caption: photo.tag || `Foto ${index + 1}` });
  });
  for (const [label, src] of [
    ["Firma de quien visitó", visit.firmaBarista],
    ["Firma de quien recibe", visit.firmaCliente],
  ] as const) {
    const parsed = dataUrlBytes(src);
    const jpeg = parsed?.mime === "image/jpeg" ? jpegInfo(parsed.bytes) : null;
    if (jpeg) pieces.push({ kind: "image", jpeg, caption: label });
  }
  pieces.push({ kind: "text", text: "Por la libertad de vivir el café.", size: 10, font: "F1", gap: 14 });

  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 48;
  const contentWidth = pageWidth - margin * 2;
  const pages: { content: string; images: { name: string; jpeg: Jpeg; draw: string }[] }[] = [];
  let content = "";
  let y = pageHeight - margin;
  let images: { name: string; jpeg: Jpeg; draw: string }[] = [];
  let imageCounter = 0;

  const flush = () => {
    pages.push({ content, images });
    content = "";
    images = [];
    y = pageHeight - margin;
  };
  const ensure = (height: number) => {
    if (y - height < margin) flush();
  };

  for (const piece of pieces) {
    if (piece.kind === "text") {
      const lines = piece.text ? wrap(piece.text, piece.size >= 16 ? 42 : 88) : [""];
      for (const line of lines) {
        ensure(piece.gap);
        y -= piece.gap;
        if (line) content += `BT /${piece.font} ${piece.size} Tf 24 43 85 rg ${margin} ${y} Td ${pdfEscape(line)} Tj ET\n`;
      }
      continue;
    }
    const maxWidth = contentWidth;
    const scale = Math.min(1, maxWidth / piece.jpeg.width, 220 / piece.jpeg.height);
    const drawWidth = Math.max(1, piece.jpeg.width * scale);
    const drawHeight = Math.max(1, piece.jpeg.height * scale);
    ensure(drawHeight + 28);
    y -= 16;
    content += `BT /F1 9 Tf 0.35 0.32 0.28 rg ${margin} ${y} Td ${pdfEscape(piece.caption)} Tj ET\n`;
    y -= drawHeight + 6;
    imageCounter += 1;
    const name = `Im${imageCounter}`;
    images.push({
      name,
      jpeg: piece.jpeg,
      draw: `q\n${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} ${margin} ${y} cm\n/${name} Do\nQ\n`,
    });
    y -= 8;
  }
  if (content || images.length || pages.length === 0) pages.push({ content, images });

  const objects: { id: number; body: string | Uint8Array; stream?: boolean }[] = [];
  const pageIds: number[] = [];
  let nextId = 3;
  const fontRegular = nextId++;
  const fontBold = nextId++;
  objects.push({ id: fontRegular, body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>" });
  objects.push({ id: fontBold, body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>" });

  for (const page of pages) {
    const xobjects: string[] = [];
    let stream = page.content;
    for (const image of page.images) {
      const id = nextId++;
      const color = image.jpeg.components === 1 ? "/DeviceGray" : "/DeviceRGB";
      const header = `<< /Type /XObject /Subtype /Image /Width ${image.jpeg.width} /Height ${image.jpeg.height} /ColorSpace ${color} /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.jpeg.bytes.length} >>\nstream\n`;
      const encoded = new TextEncoder().encode(header);
      const footer = new TextEncoder().encode("\nendstream");
      const body = new Uint8Array(encoded.length + image.jpeg.bytes.length + footer.length);
      body.set(encoded, 0);
      body.set(image.jpeg.bytes, encoded.length);
      body.set(footer, encoded.length + image.jpeg.bytes.length);
      objects.push({ id, body, stream: true });
      xobjects.push(`/${image.name} ${id} 0 R`);
      stream += image.draw;
    }
    const contentId = nextId++;
    objects.push({ id: contentId, body: `<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}endstream` });
    const pageId = nextId++;
    pageIds.push(pageId);
    objects.push({
      id: pageId,
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> /XObject << ${xobjects.join(" ")} >> >> >>`,
    });
  }

  const catalog = `<< /Type /Catalog /Pages 2 0 R >>`;
  const pagesObj = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`;
  const all = [
    { id: 1, body: catalog },
    { id: 2, body: pagesObj },
    ...objects,
  ].sort((a, b) => a.id - b.id);

  const chunks: Uint8Array[] = [new TextEncoder().encode(`%PDF-1.4\n% ${reportNumber(visit)}\n`)];
  const offsets: number[] = [0];
  let cursor = chunks[0].length;
  for (const object of all) {
    offsets[object.id] = cursor;
    const prefix = new TextEncoder().encode(`${object.id} 0 obj\n`);
    const core = typeof object.body === "string" ? new TextEncoder().encode(object.body) : object.body;
    const suffix = new TextEncoder().encode("\nendobj\n");
    const block = new Uint8Array(prefix.length + core.length + suffix.length);
    block.set(prefix, 0);
    block.set(core, prefix.length);
    block.set(suffix, prefix.length + core.length);
    chunks.push(block);
    cursor += block.length;
  }
  let xref = `xref\n0 ${all.length + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= all.length; id += 1) xref += `${String(offsets[id] || 0).padStart(10, "0")} 00000 n \n`;
  const trailer = `${xref}trailer\n<< /Size ${all.length + 1} /Root 1 0 R >>\nstartxref\n${cursor}\n%%EOF`;
  chunks.push(new TextEncoder().encode(trailer));
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const pdf = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    pdf.set(chunk, offset);
    offset += chunk.length;
  }
  return pdf;
}
