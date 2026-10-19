import { EquipmentDesk } from "@/components/equipment/EquipmentDesk";
import { catalogValues, hourlyRate, listEquipment } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ComodatosPage() {
  const [initial, rate, categories, clients, cities, suppliers, salespeople] = await Promise.all([
    listEquipment(),
    hourlyRate(),
    catalogValues("category"),
    catalogValues("client"),
    catalogValues("city"),
    catalogValues("supplier"),
    catalogValues("salesperson"),
  ]);
  return (
    <EquipmentDesk
      initial={initial}
      hourlyRate={rate}
      lists={{ categories, clients, cities, suppliers, salespeople }}
    />
  );
}
