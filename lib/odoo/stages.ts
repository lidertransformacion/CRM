export type StageDef = {
  name: string;
  position: number;
  isWon: boolean;
  isLost: boolean;
  teamRestriction: string;
  short: string;
};

export const STAGES: StageDef[] = [
  { name: "LEAD", position: 1, isWon: false, isLost: false, teamRestriction: "all", short: "Lead" },
  { name: "CONTACTO/VISITA /LLAMADA EN FRIO", position: 2, isWon: false, isLost: false, teamRestriction: "Comercial", short: "Contacto" },
  { name: "IMPACTADO", position: 3, isWon: false, isLost: false, teamRestriction: "all", short: "Impactado" },
  { name: "PRESENTACIÓN/DISCOVERY", position: 4, isWon: false, isLost: false, teamRestriction: "Comercial", short: "Discovery" },
  { name: "OFERTA COMERCIAL", position: 5, isWon: false, isLost: false, teamRestriction: "Comercial", short: "Oferta" },
  { name: "NEGOCIACIÓN", position: 6, isWon: false, isLost: false, teamRestriction: "all", short: "Negociación" },
  { name: "CIERRE/ GANADO", position: 7, isWon: true, isLost: false, teamRestriction: "all", short: "Ganado" },
  { name: "CLIENTE RECURRENTE", position: 8, isWon: false, isLost: false, teamRestriction: "all", short: "Recurrente" },
  { name: "OPORTUNIDAD PERDIDA", position: 9, isWon: false, isLost: true, teamRestriction: "all", short: "Perdida" },
];

export const OPEN_STAGES = new Set(STAGES.filter((stage) => !stage.isWon && !stage.isLost && stage.name !== "CLIENTE RECURRENTE").map((stage) => stage.name));

export function stageOf(name: string): StageDef | undefined {
  return STAGES.find((stage) => stage.name === name);
}
