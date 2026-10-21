import { PDFDocument, StandardFonts, rgb } from "@cantoo/pdf-lib";

export type StampInput = {
  signerName: string;
  signerEmail: string;
  roleLabel: string;
  step: number;
  signedAt: string;
  inputSha: string;
  outputNote: string;
  png?: Uint8Array | null;
  typedName?: string | null;
};

export type CertificateStep = {
  order: number;
  roleLabel: string;
  name: string;
  email: string;
  status: string;
  signedAt: string | null;
  ip: string | null;
  inputSha: string | null;
  outputSha: string | null;
};

export type CertificateInput = {
  publicId: string;
  title: string;
  sourceSha: string;
  completedAt: string;
  steps: CertificateStep[];
};

/** WinAnsi covers Spanish. Anything outside Latin-1 becomes a question mark so the font does not throw. */
export function pdfSafe(value: string): string {
  return value.normalize("NFC").replace(/[^\u0000-\u00ff]/g, "?");
}

function drawWrapped(page: { drawText: (text: string, options: { x: number; y: number; size: number; font: Awaited<ReturnType<PDFDocument["embedFont"]>>; color?: ReturnType<typeof rgb> }) => void }, font: Awaited<ReturnType<PDFDocument["embedFont"]>>, text: string, x: number, y: number, size: number, maxWidth: number): number {
  const words = pdfSafe(text).split(/\s+/);
  let line = "";
  let cursor = y;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
      page.drawText(line, { x, y: cursor, size, font, color: rgb(0.1, 0.12, 0.16) });
      cursor -= size + 3;
      line = word;
    } else {
      line = next;
    }
  }
  if (line) {
    page.drawText(line, { x, y: cursor, size, font, color: rgb(0.1, 0.12, 0.16) });
    cursor -= size + 3;
  }
  return cursor;
}

/** Appends one Firmas page with the drawn or typed signature. Returns the new PDF bytes. */
export async function stampSignature(pdfBytes: Uint8Array, input: StampInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(pdfBytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const page = pdf.addPage([595.28, 841.89]);
  page.drawText("Firma electronica", { x: 48, y: 790, size: 18, font: bold, color: rgb(0.09, 0.16, 0.33) });
  page.drawText(pdfSafe(`Paso ${input.step} · ${input.roleLabel}`), { x: 48, y: 766, size: 11, font, color: rgb(0.25, 0.28, 0.33) });
  let y = 734;
  y = drawWrapped(page, font, `${input.signerName} <${input.signerEmail}>`, 48, y, 12, 500);
  y = drawWrapped(page, font, `Firmado: ${input.signedAt}`, 48, y - 4, 10, 500);
  y = drawWrapped(page, font, `SHA-256 de entrada: ${input.inputSha}`, 48, y - 2, 8, 500);
  y -= 12;
  if (input.png && input.png.byteLength > 8) {
    const image = await pdf.embedPng(input.png);
    const width = Math.min(220, image.width);
    const height = (image.height / image.width) * width;
    page.drawImage(image, { x: 48, y: y - height, width, height });
    y -= height + 8;
  }
  if (input.typedName?.trim()) {
    page.drawText(pdfSafe(input.typedName.trim()), { x: 48, y, size: 20, font: italic, color: rgb(0.05, 0.08, 0.2) });
    y -= 28;
  }
  page.drawText(pdfSafe(input.outputNote), { x: 48, y: Math.max(48, y), size: 8, font, color: rgb(0.35, 0.38, 0.42) });
  return new Uint8Array(await pdf.save());
}

/** Appends the completion certificate. The caller hashes the result. */
export async function appendCertificate(pdfBytes: Uint8Array, input: CertificateInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(pdfBytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595.28, 841.89]);
  let y = 790;
  const fresh = () => {
    page = pdf.addPage([595.28, 841.89]);
    y = 790;
  };
  const line = (text: string, size = 10, useBold = false) => {
    if (y < 72) fresh();
    y = drawWrapped(page, useBold ? bold : font, text, 48, y, size, 500);
    y -= 4;
  };
  page.drawText("Certificado de finalizacion", { x: 48, y, size: 18, font: bold, color: rgb(0.09, 0.16, 0.33) });
  y -= 28;
  line(input.title, 12, true);
  line(`Sobre: ${input.publicId}`);
  line(`Cerrado: ${input.completedAt}`);
  line(`SHA-256 del PDF original: ${input.sourceSha}`, 8);
  line("Metodo: firma electronica simple (Ley 527 de 1999, Decreto 2364 de 2012). OTP al correo, consentimiento y sello de hora del servidor.");
  y -= 6;
  for (const step of input.steps) {
    line(`${step.order}. ${step.roleLabel} · ${step.name} <${step.email}>`, 11, true);
    line(`Estado: ${step.status}${step.signedAt ? ` · ${step.signedAt}` : ""}${step.ip ? ` · IP ${step.ip}` : ""}`, 9);
    if (step.inputSha) line(`Entrada ${step.inputSha}`, 8);
    if (step.outputSha) line(`Salida ${step.outputSha}`, 8);
    y -= 4;
  }
  line("La ultima pagina de este PDF es este certificado. El hash del archivo completo es el hash final del sobre.", 8);
  return new Uint8Array(await pdf.save());
}
