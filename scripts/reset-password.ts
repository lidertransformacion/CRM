import { setTemporaryPassword } from "@/lib/auth/users";
import { hydrateProcessEnv } from "@/lib/env";
import { getSql } from "@/lib/sql";

const email = process.argv[2] ?? "";
const password = process.argv[3] ?? "";
if (!email || !password) {
  console.error("Uso: npm run reset-password -- correo@libertariocoffee.com 'contraseña-temporal'");
  process.exit(1);
}

await hydrateProcessEnv();
const db = await getSql();
const reset = await setTemporaryPassword(db, email, password);
console.log(JSON.stringify({ email: reset.email, mustChangePassword: true, sessionVersion: reset.sessionVersion }));
