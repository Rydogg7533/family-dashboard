import { notFound } from "next/navigation";
import { H1 } from "@/components/ui";
import { DeviceForm } from "@/components/DeviceForm";
import { getDevice, getPeople } from "@/lib/data-registers";
import { formPeople } from "@/lib/vehicle-form-data";
import type { DeviceInput } from "@/app/devices/actions";

export const dynamic = "force-dynamic";

export default async function EditDevice({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [d, people] = await Promise.all([getDevice(id), getPeople()]);
  if (!d) notFound();
  const form = await formPeople(people);
  const uuid = people.find((p) => p.id === d.person)?.uuid ?? "";
  const initial: DeviceInput = {
    name: d.name, kind: d.kind, make: d.make ?? "", person: uuid, status: d.status,
    serialLast4: d.serialLast4 ?? "", serialPointer: d.serialPointer ?? "", purchaseDate: "",
    warrantyEnd: d.warrantyEnd ?? "", planName: d.planName ?? "", planEnd: d.planEnd ?? "",
    subscription: d.subscription ?? "", note: d.note ?? "",
  };
  return (<><H1>Edit {d.name}</H1><DeviceForm people={form} id={d.id} initial={initial} /></>);
}
