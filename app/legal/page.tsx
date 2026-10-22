import type { Metadata } from "next";
import { ContractBrowser } from "@/components/legal/ContractBrowser";
import { can } from "@/lib/auth/permissions";
import { requirePageUser } from "@/lib/auth/page-session";
import { contractCatalog } from "@/lib/legal/contracts";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contratos" };

export default async function LegalHome({ searchParams }: { searchParams: Promise<{ q?: string; vencer?: string }> }) {
  const session = await requirePageUser("/legal");
  const params = await searchParams;
  const rows = await contractCatalog(await getDb(), { uid: session.uid, email: session.email, role: session.role, ip: null, userAgent: null });
  return (
    <ContractBrowser
      rows={rows}
      initialQuery={params.q ?? ""}
      initialExpiring={params.vencer === "1"}
      upload={can(session.role, "upload_contract")}
      manageFiles={can(session.role, "manage_files")}
    />
  );
}
