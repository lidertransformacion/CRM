/** Build-time stand-in so the Workers bundle does not link node:sqlite. */
export class DatabaseSync {
  constructor() {
    throw new Error("node:sqlite no está disponible en Cloudflare Workers. Configura el binding D1 llamado DB.");
  }
}
