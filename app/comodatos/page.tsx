import type { Metadata } from "next";
import { EquipmentDesk } from "@/components/equipment/EquipmentDesk";
import { catalogValues, hourlyRate, listEquipment } from "@/lib/db";
import { nextMaintenanceBySerial } from "@/lib/equipment/queries";
import { todayIso } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Equipos" };

export default async function ComodatosPage() {
  const equipment = await listEquipment();
  const [initialNext, rate, categories, clients, cities, suppliers, salespeople] = await Promise.all([
    nextMaintenanceBySerial(equipment),
    hourlyRate(),
    catalogValues("category"),
    catalogValues("client"),
    catalogValues("city"),
    catalogValues("supplier"),
    catalogValues("salesperson"),
  ]);
  return (
    <EquipmentDesk
      initial={equipment}
      initialNext={initialNext}
      hourlyRate={rate}
      today={todayIso()}
      lists={{ categories, clients, cities, suppliers, salespeople }}
    />
  );
}
