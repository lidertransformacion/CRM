import { advanceSeed } from "@/lib/db";
import { hydrateProcessEnv } from "@/lib/env";
import { getSql } from "@/lib/sql";

await hydrateProcessEnv();
const db = await getSql();
let report = await advanceSeed(db, { maxBatches: 40 });
let guard = 0;
while (!report.complete && guard < 20) {
  report = await advanceSeed(db, { maxBatches: 40 });
  guard += 1;
}
console.log(JSON.stringify(report, null, 2));
if (!report.complete) {
  console.error("La semilla no terminó.");
  process.exit(1);
}
