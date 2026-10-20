import { notFound } from "next/navigation";
import { H1 } from "@/components/ui";
import { VehicleForm } from "@/components/VehicleForm";
import { PEOPLE, getVehicles } from "@/lib/data-registers";
import { vehicleToInput, formPeople } from "@/lib/vehicle-form-data";

export const dynamic = "force-dynamic";

export default async function EditVehicle({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = (await getVehicles()).find((x) => x.id === id);
  if (!v || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  return (<><H1>Edit {v.short}</H1><VehicleForm id={id} initial={vehicleToInput(v)} people={await formPeople(PEOPLE)} /></>);
}
