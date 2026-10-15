import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addMaintenance, createEquipment, getEquipment, listEquipment, openDatabase, seedIfEmpty, sheetPlans, updateEquipment } from "@/lib/db";
import { storeCode } from "@/lib/equipment/catalog";
import { splitLocation } from "@/lib/equipment/clients";
import { maintenanceCost, parseWarranty } from "@/lib/equipment/warranty";
import { getSheetsAdapter } from "@/lib/sheets/adapter";
import { planPush } from "@/lib/sheets/diff";
import { FORMULA_HEADERS } from "@/lib/sheets/types";

function tempDb() {
  const file = path.join(os.tmpdir(), `crm-eq-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
  const db = openDatabase(file);
  seedIfEmpty(db);
  return { file, db };
}

describe("equipment seed", () => {
  const created: string[] = [];
  afterEach(() => {
    for (const file of created) fs.rmSync(file, { force: true });
  });

  it("loads 224 equipment keyed by serial and computes store codes", () => {
    const { file, db } = tempDb();
    created.push(file);
    const rows = listEquipment(db);
    expect(rows).toHaveLength(224);
    expect(new Set(rows.map((row) => row.serial)).size).toBe(224);
    expect(new Set(rows.map((row) => row.asset_number)).size).toBe(224);
    expect(rows.find((row) => row.serial === "C24001551")).toMatchObject({ asset_number: "ACT-0001", store_code: "ZG-001" });
    expect(rows.every((row) => row.store_code === storeCode(row.site_id, row.site_seq))).toBe(true);
    const cartagena = rows.filter((row) => row.client_name === "Hotel Cartagena Plaza de la Aduana");
    expect(cartagena).toHaveLength(8);
    expect(cartagena[0]).toMatchObject({ city: "Cartagena", status: "en_comodato" });
    const addressOnly = rows.find((row) => row.serial === "GEN-COM018");
    expect(addressOnly?.client_name).toBeNull();
    expect(addressOnly?.city).toBe("Bogotá");
    const june = rows.find((row) => row.serial === "GEN-COM037");
    expect(june?.warranty_until).toBe("2027-06-30");
    expect(june?.warranty_state).toBe("vigente");
    expect(db.prepare("SELECT COUNT(*) AS n FROM suppliers").get()).toEqual({ n: expect.any(Number) });
    const suppliers = db.prepare("SELECT COUNT(*) AS n FROM suppliers WHERE name != ''").get() as { n: number };
    expect(suppliers.n).toBeGreaterThan(10);
  });

  it("computes maintenance cost from frequency, hours and the configured rate", () => {
    const cost = maintenanceCost({ everyDays: 90, hoursMin: 1, hoursMax: 3, hourlyRate: 50000 });
    expect(cost?.hours).toBe(2);
    expect(cost?.visitsPerYear).toBeCloseTo(365 / 90);
    expect(cost?.annualCost).toBeCloseTo((365 / 90) * 100000);
    expect(parseWarranty("Ya paso fecha de grantia").state).toBe("vencida");
    expect(parseWarranty("Nueva, garantía  Junio 2027").until).toBe("2027-06-30");
    expect(splitLocation("Hoteles Estelar - Intercontinental Cali Avenida Colombia #2-72").city).toBe("Cali");
  });

  it("creates and edits an equipment with history, a new asset number and the next store code", () => {
    const { file, db } = tempDb();
    created.push(file);
    const createdRow = createEquipment(
      { serial: "TEST-001", name: "Molinillo de prueba", category: "Molino de café", siteId: "COM", clientName: "La Artesa SAS", status: "en_comodato" },
      db,
    );
    expect(createdRow.asset_number).toBe("ACT-0225");
    expect(createdRow.store_code).toBe("COM-039");
    const moved = updateEquipment(
      "TEST-001",
      {
        serial: "TEST-001",
        name: "Molinillo de prueba",
        category: "Molino de café",
        siteId: "ZG",
        clientName: "Dekarla SAS",
        address: "Calle 80",
        city: "Bogotá",
        status: "en_comodato",
        deliveredOn: "2026-10-15",
        salesperson: "DIAZ BARRERA, ALEJANDRO",
      },
      db,
    );
    expect(moved.store_code).toBe("ZG-021");
    const history = db.prepare("SELECT field FROM equipment_history WHERE serial = ?").all("TEST-001") as { field: string }[];
    expect(history.map((row) => row.field)).toContain("site");
    expect(history.map((row) => row.field)).toContain("client");
    addMaintenance("TEST-001", { performedOn: "2026-10-15", kind: "preventivo", hours: 2, partsCost: 10000, technician: "Taller", notes: "Cambio de empaque", conditionAfter: "Operativo" }, db);
    const log = db.prepare("SELECT visit_cost FROM maintenance_logs WHERE serial = ?").get("TEST-001") as { visit_cost: number };
    expect(log.visit_cost).toBe(2 * 50000 + 10000);
    expect(getEquipment("TEST-001", db)?.salesperson).toBe("DIAZ BARRERA, ALEJANDRO");
  });
});

describe("google sheets adapter", () => {
  const created: string[] = [];
  afterEach(() => {
    vi.unstubAllEnvs();
    for (const file of created) fs.rmSync(file, { force: true });
  });

  it("ships in dry-run, matches rows by serial and never plans deletes", async () => {
    vi.stubEnv("SHEETS_SYNC_ENABLED", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const adapter = await getSheetsAdapter();
    expect(adapter.mode).toBe("dry-run");
    const result = await adapter.apply({ updates: [], inserts: [], deletes: [], formulaNotes: [] });
    expect(result.written).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();

    const { file, db } = tempDb();
    created.push(file);
    const plans = sheetPlans(db);
    expect(plans.mode).toBe("dry-run");
    expect(plans.push.deletes).toEqual([]);
    expect(plans.push.updates).toEqual([]);
    expect(plans.push.inserts).toEqual([]);
    expect(plans.pull.inserts).toEqual([]);
    expect(plans.pull.updates).toEqual([]);
  });

  it("writes a diff by serial and skips formula columns", () => {
    const { file, db } = tempDb();
    created.push(file);
    updateEquipment(
      "C24001551",
      {
        serial: "C24001551",
        name: "Dalla Corte Studio",
        category: "Máquina de café",
        siteId: "ZG",
        status: "en_tienda",
      },
      db,
    );
    const plans = sheetPlans(db);
    expect(plans.push.inserts).toEqual([]);
    expect(plans.push.deletes).toEqual([]);
    const update = plans.push.updates.find((row) => row.serial === "C24001551");
    expect(update?.rowNumber).toBe(2);
    expect(update?.changes.map((change) => change.column)).toContain("Nombre del equipo");
    expect(update?.changes.some((change) => FORMULA_HEADERS.has(change.column))).toBe(false);
    const moved = planPush(
      listEquipment(db).map((row) => {
        const sync = {
          serial: row.serial,
          sheetSerial: row.sheet_serial,
          name: row.name,
          category: row.category,
          siteId: row.site_id,
          siteName: "Zona G",
          siteSeq: row.site_seq,
          storeCode: row.store_code,
          supplier: row.supplier ?? "",
          supplierReference: row.supplier_reference ?? "",
          model: row.model ?? "",
          warrantyUntil: row.warranty_until,
          warrantyRaw: row.warranty_raw ?? "",
          everyDays: row.maintenance_every_days,
          hoursLabel: row.hours_label ?? "",
          locationRaw: row.location_raw ?? "",
          clientName: row.client_name,
          address: row.address ?? "",
          city: row.city ?? "",
          dirty: JSON.parse(row.dirty_json) as string[],
          sheetCells: JSON.parse(row.sheet_cells_json) as Record<string, string>,
        };
        return sync;
      }),
      {
        spreadsheetId: "x",
        tabName: "Listado Equipos",
        headers: ["Nº de serie", "Nombre del equipo"],
        rows: [
          { rowNumber: 9, serial: "OTHER", cells: { "Nº de serie": "OTHER", "Nombre del equipo": "A" } },
          { rowNumber: 4, serial: "C24001551", cells: { "Nº de serie": "C24001551", "Nombre del equipo": "Dalla Corte" } },
        ],
      },
    );
    expect(moved.updates[0]?.rowNumber).toBe(4);
    expect(moved.updates[0]?.serial).toBe("C24001551");
  });

  it("refuses to construct the live client while sync is disabled", async () => {
    vi.stubEnv("SHEETS_SYNC_ENABLED", "");
    const { LiveGoogleSheetsAdapter } = await import("@/lib/sheets/live");
    expect(() => new LiveGoogleSheetsAdapter()).toThrow(/disabled|Faltan|SHEETS_SYNC/);
  });
});
