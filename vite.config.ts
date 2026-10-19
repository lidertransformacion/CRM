import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import vinext from "vinext";

export default defineConfig({
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
      "node:sqlite": path.resolve(import.meta.dirname, "lib/sql/sqlite-stub.ts"),
    },
  },
});
