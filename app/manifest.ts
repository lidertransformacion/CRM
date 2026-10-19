import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CRM Pay Line",
    short_name: "Pay Line",
    description: "Comercial de Libertario Coffee Roasters: comités, pipeline, KPIs y comodatos.",
    start_url: "/",
    display: "standalone",
    lang: "es",
    background_color: "#eef1f6",
    theme_color: "#10182f",
    icons: [
      { src: "/favicon.png", sizes: "32x32", type: "image/png" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
