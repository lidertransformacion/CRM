/** Tipos compartidos entre la página de clientes y GET /api/clients. */

export type ClientRow = { customer: string; opportunities: number; pipeline: number; comodatos: number };

export type TimelineKind = "oportunidad" | "actividad" | "comité" | "comodato";

export type TimelineEvent = {
  at: string;
  kind: TimelineKind;
  title: string;
  detail: string;
  /** Enlace a la pantalla donde vive el registro (pipeline, equipo, comité). */
  href?: string;
  /** Marca algo que requiere atención (actividad vencida, pendiente abierto). */
  alert?: boolean;
};

export type ClientSummary = {
  opportunities: number;
  open: number;
  won: number;
  lost: number;
  recurrent: number;
  openPipeline: number;
  comodatos: number;
  overdueActivities: number;
  /** Oportunidad abierta más reciente, para "Redactar correo". */
  latestLeadKey: string | null;
};

export type ClientTimelineResponse = {
  customer: string;
  summary: ClientSummary;
  events: TimelineEvent[];
};
