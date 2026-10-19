import type { Metadata } from "next";
import { EquipmentDesk } from "@/components/equipment/EquipmentDesk";
import { catalogValues, hourlyRate, listEquipment } from "@/lib/db";
import { nextMaintenanceBySerial } from "@/lib/equipment/queries";
import { todayIso } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Equipos" };

export default function ComodatosPage() {
  const equipment = listEquipment();
  return (
    <EquipmentDesk
      initial={equipment}
      initialNext={nextMaintenanceBySerial(equipment)}
      hourlyRate={hourlyRate()}
      today={todayIso()}
      lists={{
        categories: catalogValues("category"),
        clients: catalogValues("client"),
        cities: catalogValues("city"),
        suppliers: catalogValues("supplier"),
        salespeople: catalogValues("salesperson"),
      }}
    />
  );
}
