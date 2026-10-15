import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DM_Sans, Fraunces } from "next/font/google";
import { AppNav } from "@/components/shell/AppNav";
import "./globals.css";

const dm = DM_Sans({ subsets: ["latin"], variable: "--font-dm" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });

export const metadata: Metadata = {
  title: "CRM Pay Line",
  description: "Comercial de Libertario Coffee Roasters: comités, pipeline, KPIs y comodatos.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es">
      <body className={`${dm.variable} ${fraunces.variable} antialiased`}>
        <AppNav />
        {children}
      </body>
    </html>
  );
}
