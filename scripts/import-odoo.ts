import { defaultOdooPaths, getDb, importOdooFiles } from "../lib/db";

async function main() {
  const defaults = defaultOdooPaths();
  const [leads, activities, teams] = process.argv.slice(2);
  const files = {
    leads: leads || defaults.leads,
    activities: activities || defaults.activities,
    teams: teams || defaults.teams,
  };
  await importOdooFiles(await getDb(), files);
  console.log("Reimported Odoo exports. Local lead edits were reapplied.");
  console.log(files.leads);
  console.log(files.activities);
  console.log(files.teams);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
