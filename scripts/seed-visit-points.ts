import { hydrateProcessEnv } from "@/lib/env";
import { getSql } from "@/lib/sql";
import { ensureVisitPoints } from "@/lib/visits/store";

await hydrateProcessEnv();
const db = await getSql();
const count = await ensureVisitPoints(db);
console.log(JSON.stringify({ visitPoints: count }));
