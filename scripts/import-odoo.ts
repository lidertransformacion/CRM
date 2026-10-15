import { defaultOdooPaths, getDb, importOdooFiles } from "../lib/db";

const defaults = defaultOdooPaths();
const [leads, activities, teams] = process.argv.slice(2);
const files = {
  leads: leads || defaults.leads,
  activities: activities || defaults.activities,
  teams: teams || defaults.teams,
};

importOdooFiles(getDb(), files);
console.log("Reimported Odoo exports. Local lead edits were reapplied.");
console.log(files.leads);
console.log(files.activities);
console.log(files.teams);
