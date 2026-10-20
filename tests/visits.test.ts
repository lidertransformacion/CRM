import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createUser } from "@/lib/auth/users";
import { openDatabase } from "@/lib/db";
import { wrapDatabaseSync } from "@/lib/sql/node";
import { CAL, FREQ_DAYS } from "@/lib/visits/catalog";
import { addDays, bogotaToday, brewRatio, calAuto, calOk, emailText, mailSigner, mondayOf, ownerOfPoint, reportNumber, visitsCsv, weekData } from "@/lib/visits/calc";
import { decodeVisitCode, encodeVisitCode } from "@/lib/visits/codec";
import { blankVisit, stepsFor, type VisitRecord } from "@/lib/visits/model";
import { visitPdf } from "@/lib/visits/pdf";
import { SEED_POINTS } from "@/lib/visits/points-seed";
import { ensureVisitPoints, getVisit, importVisitCodes, listPoints, saveVisit } from "@/lib/visits/store";

async function tempSql() {
  const file = path.join(os.tmpdir(), `crm-visits-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
  const raw = await openDatabase(file);
  return { file, db: wrapDatabaseSync(raw) };
}

function sampleVisit(patch: Partial<VisitRecord> = {}): VisitRecord {
  return blankVisit({
    cliente: "MERCARI",
    sede: "Punto 1",
    razonSocial: "MEDIOS Y PROGRAMAS S.A.S",
    fecha: "2026-10-14",
    visitante: "Comercial",
    responsable: "Alejandro Diaz Barrera",
    respId: "adiaz",
    tipos: ["Calibración de café", "Capacitación de baristas"],
    objetivos: ["Mejorar espresso"],
    perfil: "PAZ",
    cal: { dosis: { obj: "18", desp: "18.4" }, yield: { obj: "36", desp: "37" }, tiempo: { obj: "28", desp: "27" } },
    resultadoFinal: "bue",
    resumen: "Dejamos la receta estable.",
    planCli: { com: "Alejandro Díaz", fVis: "MENSUAL" },
    status: "final",
    ...patch,
  });
}

describe("visit catalog and calculations", () => {
  it("seeds 71 points with the hospitality frequencies", () => {
    expect(SEED_POINTS).toHaveLength(71);
    const counts = SEED_POINTS.reduce<Record<string, number>>((acc, point) => {
      const key = point.visitFrequency || "(empty)";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    expect(counts).toMatchObject({ MENSUAL: 29, "CADA 3 MESES": 18, ANUAL: 8, "CADA 2 MESES": 6, "CADA 6 MESES": 4 });
    expect((counts["SIN DEFINIR"] || 0) + (counts["(empty)"] || 0)).toBe(6);
    expect(new Set(SEED_POINTS.map((point) => point.id)).size).toBe(71);
    expect(FREQ_DAYS.MENSUAL).toBe(30);
    expect(FREQ_DAYS["CADA 3 MESES"]).toBe(90);
    const mercari = SEED_POINTS.find((point) => point.tradeName === "MERCARI" && point.pointName === "Punto 1");
    expect(mercari && ownerOfPoint({ commercial: mercari.commercial })).toBe("adiaz");
  });

  it("opens calibration and training steps for a coffee visit and checks tolerances", () => {
    const visit = sampleVisit();
    const ids = stepsFor(visit).map((step) => step.id);
    expect(ids).toEqual(["datos", "cal", "capac", "com", "result", "cierre"]);
    expect(stepsFor(blankVisit({ visitante: "Técnico", tipos: ["Servicio técnico"] })).some((step) => step.id === "tec")).toBe(true);
    expect(calAuto(visit, "dosis")).toBe(true);
    expect(calAuto(sampleVisit({ cal: { dosis: { obj: "18", desp: "18.6" } } }), "dosis")).toBe(false);
    expect(CAL.find((item) => item.id === "tds")?.tolerance).toBe(0.1);
    expect(calOk(sampleVisit({ cal: { dosis: { obj: "18", desp: "18.6", ok: true } } }), "dosis")).toBe(true);
    expect(brewRatio(visit)).toMatchObject({ dose: 18.4, yield: 37, ratio: "1:2.0" });
  });

  it("signs the client email with the assigned commercial", () => {
    const visit = sampleVisit();
    expect(mailSigner(visit).email).toBe("businessdevelopercol@libertariocoffee.com");
    const text = emailText(visit);
    expect(text).toContain("Alejandro Diaz Barrera");
    expect(text).toContain("18.4 g → 37 g");
    expect(text).toContain("Por la libertad de vivir el café.");
    expect(visitsCsv([visit])).toContain("Nombre comercial");
    expect(visitsCsv([visit])).toContain("MERCARI");
    expect(reportNumber(visit)).toMatch(/^RV-261014-/);
  });

  it("round-trips a LIBV1 code without photos", async () => {
    const visit = sampleVisit({
      fotos: [{ tag: "Antes", src: "data:image/jpeg;base64,AAAA" }],
      firmaBarista: "data:image/jpeg;base64,BBBB",
    });
    const code = await encodeVisitCode(visit);
    expect(code.startsWith("LIBV1.")).toBe(true);
    const decoded = await decodeVisitCode(code);
    expect(decoded.cliente).toBe("MERCARI");
    expect(decoded.fotos).toEqual([]);
    expect(decoded.firmaBarista).toBe("");
    expect(decoded.cal.dosis?.desp).toBe("18.4");
  });

  it("counts visits done against points due this week", () => {
    const today = bogotaToday();
    const start = mondayOf(today);
    const point = {
      ...SEED_POINTS[0],
      id: "punto-mensual",
      tradeName: "CAFE NORTE",
      legalName: "CAFE NORTE SAS",
      pointName: "Principal",
      visitFrequency: "MENSUAL",
      commercial: "Juanita Higuera",
      leadImportKey: null,
    };
    const due = blankVisit({
      id: "visit-due",
      status: "final",
      cliente: "CAFE NORTE",
      sede: "Principal",
      clienteId: point.id,
      fecha: addDays(start, -30),
      planCli: { com: "Juanita Higuera", fVis: "MENSUAL" },
    });
    const open = weekData([due], [point], start, "todos", today);
    expect(open.kpi.due).toBe(1);
    expect(open.kpi.done).toBe(0);
    expect(open.rows[0]?.visitState === "venc" || open.rows[0]?.dueThisWeek).toBe(true);

    const done = blankVisit({
      ...due,
      id: "visit-done",
      fecha: start,
    });
    const covered = weekData([done], [point], start, "jhiguera", today);
    expect(covered.kpi.visits).toBe(1);
    expect(covered.kpi.done + covered.kpi.onTime).toBeGreaterThan(0);
    expect(ownerOfPoint(point)).toBe("jhiguera");
  });

  it("writes a PDF and stores an imported visit", async () => {
    const visit = sampleVisit();
    const pdf = visitPdf(visit);
    const header = new TextDecoder().decode(pdf.slice(0, 8));
    expect(header.startsWith("%PDF")).toBe(true);
    expect(new TextDecoder().decode(pdf.slice(-6))).toContain("EOF");

    const { file, db } = await tempSql();
    const user = await createUser(db, { role: "admin" }, { email: "visitas@libertariocoffee.com", password: "correct-horse-battery", role: "admin" });
    expect(await ensureVisitPoints(db)).toBe(71);
    const points = await listPoints(db);
    expect(points).toHaveLength(71);
    const saved = await saveVisit(db, visit, user.id);
    expect(saved.cliente).toBe("MERCARI");
    const code = await encodeVisitCode(sampleVisit({ id: "import-me-01", cliente: "ARTESA", sede: "Principal", status: "final" }));
    const imported = await importVisitCodes(db, `Hola\n${code}\nfin`, user.id);
    expect(imported.added).toBe(1);
    const loaded = await getVisit(db, "import-me-01");
    expect(loaded?.cliente).toBe("ARTESA");
    expect(loaded?.origen).toBe("barista");
    fs.rmSync(file, { force: true });
  });
});
