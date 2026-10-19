import type { Metadata } from "next";
import { EquipmentDesk } from "@/components/equipment/EquipmentDesk";
import { equipmentDesk } from "@/lib/equipment/queries";
import { todayIso } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Equipos" };

export default async function ComodatosPage() {
  const desk = await equipmentDesk();
  return (
    <EquipmentDesk
      initial={desk.equipment}
      initialNext={desk.nextMaintenance}
      hourlyRate={desk.hourlyRate}
      today={todayIso()}
      lists={{ categories: desk.categories, clients: desk.clients, cities: desk.cities, suppliers: desk.suppliers, salespeople: desk.salespeople }}
    />
  );
}
