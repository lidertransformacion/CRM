import { describe, expect, it } from "vitest";
import { EMAIL_TEMPLATES, renderTemplate } from "@/lib/emails/templates";

describe("client email drafts", () => {
  it("renders copyable text and does not include a send action", () => {
    const template = EMAIL_TEMPLATES.find((item) => item.id === "oferta");
    const draft = renderTemplate(template!, {
      cliente: "Hotel Las Américas",
      oportunidad: "Cápsulas del hotel",
      vendedor: "Alejandro Díaz",
      ingreso: "$12.000.000",
      etapa: "Oferta",
      fecha: "15 oct",
    });
    expect(draft.subject).toContain("Hotel Las Américas");
    expect(draft.body).toContain("Alejandro Díaz");
    expect(draft.body).toContain("$12.000.000");
    expect(JSON.stringify(EMAIL_TEMPLATES)).not.toMatch(/mailto:|sendMail|nodemailer/i);
  });
});
