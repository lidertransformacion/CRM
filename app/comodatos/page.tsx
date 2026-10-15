import { EquipmentDesk } from "@/components/equipment/EquipmentDesk";
import { catalogValues, hourlyRate, listEquipment } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function ComodatosPage() {
  return (
    <EquipmentDesk
      initial={listEquipment()}
      hourlyRate={hourlyRate()}
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
