import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El indicador de desarrollo de Next se mueve para no tapar el pie del menú lateral.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
