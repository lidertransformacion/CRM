import { HttpError } from "@/lib/auth/users";
import { fold } from "@/lib/visits/catalog";
import { decodeVisitCode, findVisitCodes } from "@/lib/visits/codec";
import { SEED_POINTS } from "@/lib/visits/points-seed";
import { releaseBytes, reserveBytes } from "@/lib/storage/quota";
import { bytesToDataUrl, dataUrlBytes, visitPhotoBucket } from "@/lib/visits/photos";
import { normalizeVisit, type VisitBrief, type VisitPhoto, type VisitPoint, type VisitRecord } from "@/lib/visits/model";
import type { SqlDb } from "@/lib/sql/types";

const MAX_MEDIA_CHARS = 200_000;

type PhotoRow = {
  id: number;
  visit_id: string;
  kind: string;
  tag: string | null;
  sort_order: number;
  r2_key: string | null;
  data_url: string | null;
};

type VisitRow = {
  id: string;
  status: string;
  point_id: string | null;
  fecha: string | null;
  cliente: string | null;
  sede: string | null;
  resultado_final: string | null;
  created_by: number | null;
  payload: string;
  created_at: string;
  updated_at: string;
};

function leadKey(leads: { import_key: string; customer: string | null; name: string }[], trade: string, legal: string): string | null {
  const tradeFold = fold(trade);
  const legalFold = fold(legal);
  const hit = leads.find((lead) => {
    const customer = fold(lead.customer || "");
    const name = fold(lead.name || "");
    return (tradeFold && (customer === tradeFold || name === tradeFold)) || (legalFold && legalFold !== tradeFold && (customer === legalFold || name === legalFold));
  });
  return hit?.import_key ?? null;
}

/** Inserts any catalog point that is not already stored. Safe to call on every visits request. */
export async function ensureVisitPoints(db: SqlDb): Promise<number> {
  const existing = await db.all<{ id: string }>("SELECT id FROM visit_points");
  const have = new Set(existing.map((row) => row.id));
  const missing = SEED_POINTS.filter((point) => !have.has(point.id));
  if (!missing.length) return existing.length;
  const leads = await db.all<{ import_key: string; customer: string | null; name: string }>("SELECT import_key, customer, name FROM leads");
  const now = new Date().toISOString();
  for (const point of missing) {
    await db.run(
      `INSERT INTO visit_points (
         id, legal_name, trade_name, point_name, address, city, locality, zone,
         visit_frequency, commercial, visit_barista, training_frequency, training_barista,
         lead_import_key, active, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        point.id,
        point.legalName,
        point.tradeName,
        point.pointName,
        point.address,
        point.city,
        point.locality,
        point.zone,
        point.visitFrequency,
        point.commercial,
        point.visitBarista,
        point.trainingFrequency,
        point.trainingBarista,
        leadKey(leads, point.tradeName, point.legalName),
        now,
        now,
      ],
    );
  }
  return existing.length + missing.length;
}

export async function listPoints(db: SqlDb): Promise<VisitPoint[]> {
  const rows = await db.all<{
    id: string;
    legal_name: string;
    trade_name: string;
    point_name: string;
    address: string;
    city: string;
    locality: string;
    zone: string;
    visit_frequency: string;
    commercial: string;
    visit_barista: string;
    training_frequency: string;
    training_barista: string;
    lead_import_key: string | null;
  }>("SELECT * FROM visit_points WHERE active = 1 ORDER BY trade_name, point_name");
  return rows.map((row) => ({
    id: row.id,
    legalName: row.legal_name,
    tradeName: row.trade_name,
    pointName: row.point_name,
    address: row.address,
    city: row.city,
    locality: row.locality,
    zone: row.zone,
    visitFrequency: row.visit_frequency,
    commercial: row.commercial,
    visitBarista: row.visit_barista,
    trainingFrequency: row.training_frequency,
    trainingBarista: row.training_barista,
    leadImportKey: row.lead_import_key,
  }));
}

function assertMedia(value: string, label: string) {
  if (!value) return;
  if (value === "1") return;
  if (!/^data:image\/(?:jpeg|jpg|png);base64,/i.test(value)) throw new HttpError(400, `${label} no es una imagen válida.`);
  if (value.length > MAX_MEDIA_CHARS) throw new HttpError(400, `${label} es demasiado pesada. Toma otra más cerca.`);
}

async function readStored(row: PhotoRow): Promise<string> {
  if (row.data_url) return row.data_url;
  if (!row.r2_key) return "";
  const bucket = await visitPhotoBucket();
  if (!bucket) return "";
  const object = await bucket.get(row.r2_key);
  if (!object) return "";
  const bytes = new Uint8Array(await object.arrayBuffer());
  return bytesToDataUrl("image/jpeg", bytes);
}

async function hydrate(db: SqlDb, row: VisitRow): Promise<VisitRecord> {
  const parsed = normalizeVisit(JSON.parse(row.payload) as Partial<VisitRecord>);
  parsed.id = row.id;
  parsed.status = row.status === "final" ? "final" : "borrador";
  const media = await db.all<PhotoRow>("SELECT * FROM visit_photos WHERE visit_id = ? ORDER BY sort_order, id", [row.id]);
  const photos: VisitPhoto[] = [];
  for (const item of media) {
    const src = await readStored(item);
    if (item.kind === "photo") photos.push({ tag: item.tag || "Antes", src, photoId: item.id });
    else if (item.kind === "signature_visitor") parsed.firmaBarista = src;
    else if (item.kind === "signature_client") parsed.firmaCliente = src;
  }
  if (photos.length) parsed.fotos = photos;
  return parsed;
}

export async function listVisits(db: SqlDb): Promise<VisitRecord[]> {
  const rows = await db.all<VisitRow>("SELECT * FROM visits ORDER BY fecha DESC, updated_at DESC");
  return rows.map((row) => {
    const visit = normalizeVisit(JSON.parse(row.payload) as Partial<VisitRecord>);
    visit.id = row.id;
    visit.status = row.status === "final" ? "final" : "borrador";
    visit.fotos = (visit.fotos || []).map((photo) => ({ ...photo, src: "" }));
    visit.firmaBarista = "";
    visit.firmaCliente = "";
    return visit;
  });
}

export async function listVisitBriefs(db: SqlDb): Promise<VisitBrief[]> {
  const rows = await db.all<{ id: string; cliente: string | null; sede: string | null; fecha: string | null; status: string }>(
    "SELECT id, cliente, sede, fecha, status FROM visits",
  );
  return rows.map((row) => ({ id: row.id, cliente: row.cliente || "", sede: row.sede || "", fecha: row.fecha || "", status: row.status }));
}

export async function getVisit(db: SqlDb, id: string): Promise<VisitRecord | null> {
  const row = await db.get<VisitRow>("SELECT * FROM visits WHERE id = ?", [id]);
  if (!row) return null;
  return hydrate(db, row);
}

async function storeMedia(db: SqlDb, visitId: string, kind: string, tag: string, sort: number, dataUrl: string, now: string) {
  if (!dataUrl || dataUrl === "1") return;
  const parsed = dataUrlBytes(dataUrl);
  const bucket = parsed ? await visitPhotoBucket() : null;
  let r2Key: string | null = null;
  let storedUrl: string | null = dataUrl;
  if (bucket && parsed) {
    r2Key = `visits/${visitId}/${kind}-${sort}.${parsed.mime.includes("png") ? "png" : "jpg"}`;
    await reserveBytes(db, parsed.bytes.byteLength);
    try {
      await bucket.put(r2Key, parsed.bytes, { httpMetadata: { contentType: parsed.mime } });
    } catch (error) {
      await releaseBytes(db, parsed.bytes.byteLength);
      throw error;
    }
    storedUrl = null;
  }
  try {
    await db.run(
      `INSERT INTO visit_photos (visit_id, kind, tag, sort_order, r2_key, data_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [visitId, kind, tag, sort, r2Key, storedUrl, now],
    );
  } catch (error) {
    if (bucket && r2Key && parsed) {
      try {
        await bucket.delete(r2Key);
      } catch {
        // The reservation is released below even if the object is already gone.
      }
      await releaseBytes(db, parsed.bytes.byteLength);
    }
    throw error;
  }
}

async function clearMedia(db: SqlDb, visitId: string) {
  const rows = await db.all<{ r2_key: string | null }>("SELECT r2_key FROM visit_photos WHERE visit_id = ?", [visitId]);
  const bucket = await visitPhotoBucket();
  for (const row of rows) {
    if (!row.r2_key || !bucket) continue;
    const object = await bucket.get(row.r2_key);
    const size = object ? (await object.arrayBuffer()).byteLength : 0;
    await bucket.delete(row.r2_key);
    if (size > 0) await releaseBytes(db, size);
  }
  await db.run("DELETE FROM visit_photos WHERE visit_id = ?", [visitId]);
}

export async function saveVisit(db: SqlDb, input: VisitRecord, userId: number): Promise<VisitRecord> {
  const visit = normalizeVisit(input);
  if (!/^[\w-]{4,80}$/.test(visit.id)) throw new HttpError(400, "El identificador de la visita no es válido.");
  if (visit.status === "final" && !visit.cliente.trim()) throw new HttpError(400, "Elige el cliente para finalizar la visita.");
  visit.fotos.slice(0, 4).forEach((photo, index) => assertMedia(photo.src, `La foto ${index + 1}`));
  assertMedia(visit.firmaBarista, "La firma");
  assertMedia(visit.firmaCliente, "La firma del cliente");
  const now = new Date().toISOString();
  const payload: VisitRecord = {
    ...visit,
    fotos: visit.fotos.slice(0, 4).map((photo) => ({ tag: photo.tag || "Antes", src: "" })),
    firmaBarista: "",
    firmaCliente: "",
    updatedAt: Date.now(),
  };
  await db.run(
    `INSERT INTO visits (id, status, point_id, fecha, cliente, sede, resultado_final, created_by, payload, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status,
       point_id = excluded.point_id,
       fecha = excluded.fecha,
       cliente = excluded.cliente,
       sede = excluded.sede,
       resultado_final = excluded.resultado_final,
       payload = excluded.payload,
       updated_at = excluded.updated_at`,
    [
      visit.id,
      visit.status,
      visit.clienteId || null,
      visit.fecha || null,
      visit.cliente,
      visit.sede,
      visit.resultadoFinal || null,
      userId,
      JSON.stringify(payload),
      now,
      now,
    ],
  );
  await clearMedia(db, visit.id);
  for (const [index, photo] of visit.fotos.slice(0, 4).entries()) {
    await storeMedia(db, visit.id, "photo", photo.tag || "Antes", index, photo.src, now);
  }
  await storeMedia(db, visit.id, "signature_visitor", "firma", 0, visit.firmaBarista, now);
  await storeMedia(db, visit.id, "signature_client", "firma", 1, visit.firmaCliente, now);
  const saved = await getVisit(db, visit.id);
  if (!saved) throw new HttpError(500, "No se pudo leer la visita guardada.");
  return saved;
}

export async function deleteVisit(db: SqlDb, id: string): Promise<void> {
  const existing = await db.get<{ id: string }>("SELECT id FROM visits WHERE id = ?", [id]);
  if (!existing) throw new HttpError(404, "Esa visita no está en el historial.");
  await clearMedia(db, id);
  await db.run("DELETE FROM visits WHERE id = ?", [id]);
}

export async function importVisitCodes(db: SqlDb, text: string, userId: number): Promise<{ added: number; updated: number; bad: number }> {
  const codes = findVisitCodes(text);
  if (!codes.length) throw new HttpError(400, "No se encontró ningún registro que empiece por LIBV1.");
  let added = 0;
  let updated = 0;
  let bad = 0;
  for (const code of codes) {
    try {
      const decoded = await decodeVisitCode(code);
      if (!decoded.id || !decoded.cliente.trim()) {
        bad += 1;
        continue;
      }
      const previous = await getVisit(db, decoded.id);
      const merged = normalizeVisit({
        ...(previous || {}),
        ...decoded,
        origen: "barista",
        importedAt: Date.now(),
        fotos: previous?.fotos?.length ? previous.fotos : decoded.fotos,
        firmaBarista: previous?.firmaBarista || decoded.firmaBarista,
        firmaCliente: previous?.firmaCliente || decoded.firmaCliente,
      });
      merged.status = decoded.status === "borrador" ? "borrador" : "final";
      await saveVisit(db, merged, userId);
      if (previous) updated += 1;
      else added += 1;
    } catch {
      bad += 1;
    }
  }
  return { added, updated, bad };
}
