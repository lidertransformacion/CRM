import type { MetadataRoute } from "next";

/** Manifiesto de la PWA: iconos con el isotipo Libertario sobre navy (generados desde public/brand/logo-mark.svg). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CRM Libertario",
    short_name: "Libertario",
    description: "CRM del equipo Comercial de Libertario Coffee Roasters: comités, pipeline, KPIs, equipos, clientes y correos.",
    start_url: "/",
    display: "standalone",
    lang: "es",
    background_color: "#f3f0eb",
    theme_color: "#182b55",
    icons: [
      { src: "/favicon.png", sizes: "32x32", type: "image/png" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
