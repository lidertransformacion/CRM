import { ClientExplorer } from "@/components/clients/ClientExplorer";
import { clientDirectory } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  return <ClientExplorer clients={await clientDirectory()} />;
}
