import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Poppins, Libre_Baskerville } from "next/font/google";
import { AppShell } from "@/components/shell/AppShell";
import { ToastProvider } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-poppins", display: "swap" });
const baskerville = Libre_Baskerville({ subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"], variable: "--font-baskerville", display: "swap" });

export const metadata: Metadata = {
  title: { default: "CRM Libertario", template: "%s · CRM Libertario" },
  description: "Herramienta del equipo Comercial de Libertario Coffee Roasters: comités, pipeline Pay Line, KPIs, equipos en comodato, clientes y correos.",
  icons: { icon: "/brand/isotipo-libertario-dark.png" },
};

export const viewport: Viewport = { themeColor: "#182b55", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es" className={`${poppins.variable} ${baskerville.variable}`}>
      <body className="antialiased">
        <TooltipProvider>
          <ToastProvider>
            <AppShell>{children}</AppShell>
          </ToastProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
