import { H1 } from "@/components/ui";
import { DeviceForm } from "@/components/DeviceForm";
import { getPeople } from "@/lib/data-registers";
import { formPeople } from "@/lib/vehicle-form-data";

export const dynamic = "force-dynamic";

export default async function NewDevice() {
  return (<><H1>Add a device</H1><DeviceForm people={await formPeople(await getPeople())} /></>);
}
