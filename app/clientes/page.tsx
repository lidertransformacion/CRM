import { ClientExplorer } from "@/components/clients/ClientExplorer";
import { clientDirectory } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function ClientesPage() {
  return <ClientExplorer clients={clientDirectory()} />;
}
