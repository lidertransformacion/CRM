import { describe, expect, it } from "vitest";
import { buildSeedCommittee } from "@/lib/committee/seed-data";
import { applyAction, createNextCommittee } from "@/lib/committee/mutate";
import { boardStats, flatten, personStats, topicIsClosed, topicStats } from "@/lib/committee/metrics";
import { buildCommitteeEmail } from "@/lib/committee/email";

const AS_OF = "2026-10-15";

describe("committee seed", () => {
  const doc = buildSeedCommittee();

  it("matches the captured board counts", () => {
    const stats = boardStats(doc, AS_OF);
    expect(stats.open).toBe(34);
    expect(stats.closed).toBe(30);
    expect(stats.open + stats.closed).toBe(64);
    expect(stats.overdue).toBe(7);
    expect(stats.carried).toBe(17);
    expect(doc.topics).toHaveLength(9);
    expect(doc.topics.filter(topicIsClosed).map((topic) => topic.number).sort()).toEqual([1, 4]);
  });

  it("matches topic open and carried counts", () => {
    const byNumber = Object.fromEntries(doc.topics.map((topic) => [topic.number, topicStats(doc, topic)]));
    expect(byNumber[2]).toMatchObject({ open: 7, carried: 4 });
    expect(byNumber[3]).toMatchObject({ open: 6, carried: 3 });
    expect(byNumber[5]).toMatchObject({ open: 10, carried: 7 });
    expect(byNumber[6]).toMatchObject({ open: 4, carried: 3 });
    expect(byNumber[7]).toMatchObject({ open: 4, carried: 0 });
    expect(byNumber[8]).toMatchObject({ open: 2, carried: 0 });
    expect(byNumber[9]).toMatchObject({ open: 1, carried: 0 });
  });

  it("matches the person panel", () => {
    const people = Object.fromEntries(personStats(doc, AS_OF).map((person) => [person.name, person]));
    expect(people.Juanpa).toMatchObject({ open: 9, overdue: 3, carried: 5 });
    expect(people.Catery).toMatchObject({ open: 6, overdue: 0, carried: 2 });
    expect(people.Daniel).toMatchObject({ open: 5, overdue: 0, carried: 3 });
    expect(people["Maria I"]).toMatchObject({ open: 5, overdue: 1, carried: 4 });
    expect(people.Andre).toMatchObject({ open: 4, overdue: 2, carried: 2 });
    expect(people["Maria Paula"]).toMatchObject({ open: 4, overdue: 0, carried: 0 });
    expect(people.Diego).toMatchObject({ open: 3, overdue: 1, carried: 3 });
    expect(people.Diana).toMatchObject({ open: 3, overdue: 1, carried: 2 });
    expect(people.Osmar).toMatchObject({ open: 1, overdue: 1, carried: 1 });
    expect(people.Mapa).toMatchObject({ open: 1, overdue: 0, carried: 0 });
    expect(people["Sin responsable"]).toMatchObject({ open: 3, overdue: 0, carried: 0 });
  });

  it("keeps twenty original minutes and the coperama link", () => {
    const withActa = doc.topics.flatMap((topic) => topic.puntos).filter((punto) => punto.acta);
    expect(withActa).toHaveLength(20);
    const coperama = doc.topics.flatMap((topic) => topic.puntos).find((punto) => punto.title === "COPERAMA");
    expect(coperama?.links[0]?.label).toBe("Cronograma implementación BH");
  });
});

describe("committee email", () => {
  const email = buildCommitteeEmail(buildSeedCommittee(), AS_OF);

  it("builds the subject, intro and closed list", () => {
    expect(email.subject).toBe("Comité Out of Stores · 14 oct · Decisiones y pendientes");
    expect(email.text).toContain("Quedan 34 pendientes abiertos; 17 llevan dos o más comités sin resolver");
    expect(email.text).toContain("7 tienen la fecha vencida");
    expect(email.text).toContain("- Definir logo del punto (MELI - apertura MEDELLIN lunes 26 octubre)");
    expect(email.text).toContain("- (Don Eloy)\n");
    expect(email.text).not.toContain("- (Don Eloy) (Don Eloy)");
    expect(email.text).toContain("Gracias,\nAndrea");
    expect(email.html).toContain("<table");
    expect(email.html).toContain("Vencido");
  });

  it("orders each person by committee age and then date", () => {
    const juanpa = email.sections.find((section) => section.name === "Juanpa");
    expect(juanpa?.count).toBe(9);
    expect(juanpa?.rows[0]?.title).toBe("Nuevo arreglo de sillas (se están dañando otra vez)");
    expect(juanpa?.rows.map((row) => row.committees)).toEqual(["6", "6", "6", "4", "2", "1", "1", "Nuevo", "Nuevo"]);
    expect(email.sections.at(-1)?.name).toBe("Sin responsable");
    expect(email.sections.reduce((sum, section) => sum + section.count, 0)).toBe(44);
  });
});

describe("new committee", () => {
  it("carries open items forward and leaves closed ones behind", () => {
    const doc = buildSeedCommittee();
    const { archived, next } = createNextCommittee(doc, "2026-10-21");
    expect(archived.committee.number).toBe(7);
    expect(next.committee.number).toBe(8);
    expect(next.committee.heldOn).toBe("2026-10-21");
    const archivedItems = flatten(archived);
    const nextItems = flatten(next);
    expect(archivedItems).toHaveLength(64);
    expect(nextItems.every((row) => row.pendiente.status !== "cerrado")).toBe(true);
    expect(nextItems).toHaveLength(34);
    const filtrados = nextItems.find((row) => row.pendiente.title === "Venta de filtrados PARA AMBOS");
    expect(filtrados?.pendiente.bornCommitteeNumber).toBe(6);
    expect(next.committee.number - (filtrados?.pendiente.bornCommitteeNumber ?? 0)).toBe(2);
    const reopened = applyAction(next, {
      type: "patchPendiente",
      topicId: filtrados!.topic.id,
      puntoId: filtrados!.punto.id,
      pendienteId: filtrados!.pendiente.id,
      patch: { status: "cerrado" },
    });
    const closed = flatten(reopened).find((row) => row.pendiente.id === filtrados!.pendiente.id);
    expect(closed?.pendiente.closedInCommitteeNumber).toBe(8);
  });
});
