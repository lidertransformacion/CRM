export type EmailTemplate = {
  id: string;
  name: string;
  subject: string;
  body: string;
  sortOrder: number;
};

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: "primer-contacto",
    name: "Primer contacto",
    sortOrder: 1,
    subject: "{{cliente}} · café Libertario",
    body: `Hola,

Soy {{vendedor}}, del equipo comercial de Libertario Coffee Roasters. Los escribo porque creemos que {{cliente}} puede tener un café de especialidad a la altura de su operación.

¿Les queda bien una llamada breve esta semana para escuchar cómo sirven café hoy y ver si tiene sentido una visita?

Quedo atento,
{{vendedor}}
Comercial · Libertario Coffee Roasters`,
  },
  {
    id: "post-visita",
    name: "Seguimiento después de visita",
    sortOrder: 2,
    subject: "Gracias por la visita · {{cliente}}",
    body: `Hola,

Gracias por recibirnos. Quedó claro lo que necesitan en {{oportunidad}}: seguimos en {{etapa}}.

Les comparto los acuerdos de la visita y el siguiente paso. Si algo quedó por fuera, me lo devuelven por este mismo correo.

Quedo atento,
{{vendedor}}
Comercial · Libertario Coffee Roasters`,
  },
  {
    id: "oferta",
    name: "Envío de oferta",
    sortOrder: 3,
    subject: "Oferta comercial · {{cliente}}",
    body: `Hola,

Adjunto la oferta de {{oportunidad}} para {{cliente}}. El ingreso estimado que trabajamos es {{ingreso}}.

La propuesta está pensada para la operación que vimos. Quedo disponible para recorrerla juntos y ajustar lo que haga falta antes de pasar a negociación.

Quedo atento,
{{vendedor}}
Comercial · Libertario Coffee Roasters`,
  },
  {
    id: "negociacion",
    name: "Recordatorio de negociación",
    sortOrder: 4,
    subject: "Seguimiento · {{cliente}}",
    body: `Hola,

Retomo {{oportunidad}}. Seguimos en {{etapa}} y quiero confirmar si ya tienen una decisión o si hay un punto que todavía debamos resolver.

Si les sirve, agendamos 20 minutos esta semana.

Quedo atento,
{{vendedor}}
Comercial · Libertario Coffee Roasters`,
  },
  {
    id: "cierre",
    name: "Confirmación de cierre",
    sortOrder: 5,
    subject: "Bienvenidos · {{cliente}}",
    body: `Hola,

Confirmamos el cierre de {{oportunidad}}. Para Libertario, {{cliente}} ya hace parte de la operación y el siguiente paso es dejar lista la instalación y el primer servicio.

Les escribo con el plan de arranque. Cualquier cambio de fecha o de contacto, me avisan.

Gracias por la confianza,
{{vendedor}}
Comercial · Libertario Coffee Roasters`,
  },
  {
    id: "reactivacion",
    name: "Reactivación",
    sortOrder: 6,
    subject: "{{cliente}} · volvamos a hablar",
    body: `Hola,

Hace un tiempo conversamos sobre {{oportunidad}} y la dejamos en {{etapa}}. Quería retomar sin presión: si el momento cambió, con gusto armamos una propuesta nueva.

¿Tiene sentido volver a hablar este mes?

Quedo atento,
{{vendedor}}
Comercial · Libertario Coffee Roasters`,
  },
];

export type DraftFields = {
  cliente: string;
  oportunidad: string;
  vendedor: string;
  ingreso: string;
  etapa: string;
  fecha: string;
};

export function renderTemplate(template: Pick<EmailTemplate, "subject" | "body">, fields: DraftFields): { subject: string; body: string } {
  const fill = (source: string) =>
    source.replace(/\{\{\s*(cliente|oportunidad|vendedor|ingreso|etapa|fecha)\s*\}\}/g, (_, key: keyof DraftFields) => fields[key] || "—");
  return { subject: fill(template.subject), body: fill(template.body) };
}
