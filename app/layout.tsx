import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { DM_Sans, Fraunces } from "next/font/google";
import { AppNav } from "@/components/shell/AppNav";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import "./globals.css";

const dm = DM_Sans({ subsets: ["latin"], variable: "--font-dm" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CRM Pay Line",
  description: "Comercial de Libertario Coffee Roasters: comités, pipeline, KPIs y comodatos.",
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const jar = await cookies();
  const session = await verifySession(jar.get(SESSION_COOKIE)?.value);
  return (
    <html lang="es">
      <body className={`${dm.variable} ${fraunces.variable} antialiased`}>
        {session ? (
          <AppNav email={session.email} role={session.role} mustChangePassword={session.mustChangePassword} />
        ) : null}
        {children}
      </body>
    </html>
  );
}
