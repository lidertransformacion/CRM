import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Poppins, Libre_Baskerville } from "next/font/google";
import { cookies } from "next/headers";
import { AppShell } from "@/components/shell/AppShell";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { ToastProvider } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-poppins", display: "swap" });
const baskerville = Libre_Baskerville({ subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"], variable: "--font-baskerville", display: "swap" });

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "CRM Libertario", template: "%s · CRM Libertario" },
  description: "Herramienta del equipo Comercial de Libertario Coffee Roasters: comités, pipeline Pay Line, KPIs, equipos en comodato, clientes y correos.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "CRM Libertario", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = { themeColor: "#182b55", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  // La tarjeta de usuario del menú necesita saber quién está conectado (solo lee la cookie firmada).
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  const user = session ? { email: session.email, role: session.role } : null;
  return (
    <html lang="es" className={`${poppins.variable} ${baskerville.variable}`}>
      <body className="antialiased">
        <TooltipProvider>
          <ToastProvider>
            <AppShell user={user}>{children}</AppShell>
          </ToastProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
