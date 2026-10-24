import { H1 } from "@/components/ui";
import { VehicleForm } from "@/components/VehicleForm";
import { getPeople } from "@/lib/data-registers";
import { blankInput, formPeople } from "@/lib/vehicle-form-data";

export const dynamic = "force-dynamic";

export default async function NewVehicle() {
  return (<><H1>Add a vehicle</H1><VehicleForm id={null} initial={blankInput()} people={await formPeople(await getPeople())} /></>);
}
