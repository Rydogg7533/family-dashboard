"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveDevice, type DeviceInput } from "@/app/devices/actions";

const inp = "w-full min-h-11 rounded-xl border border-line bg-bg px-3 text-sm";
const KINDS = ["Phone", "Laptop", "Tablet", "Watch", "Computer", "TV", "Game console", "Router", "Headphones", "Camera", "E-bike", "Appliance", "Other"];
const STATUSES = ["in use", "spare", "loaned", "retired"];
const blank: DeviceInput = { name: "", kind: "", make: "", person: "", status: "in use", serialLast4: "", serialPointer: "", purchaseDate: "", warrantyEnd: "", planName: "", planEnd: "", subscription: "", note: "" };

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (<label className="flex flex-col gap-1"><span className="text-xs font-semibold">{label}</span>{children}{hint && <span className="text-[11px] text-muted">{hint}</span>}</label>);
}

export function DeviceForm({ people }: { people: { id: string; name: string }[] }) {
  const router = useRouter();
  const [d, setD] = useState<DeviceInput>(blank);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof DeviceInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setD((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    const r = await saveDevice(d);
    setBusy(false);
    if (!r.ok) { setErr(r.error ?? "Could not save."); return; }
    router.push("/devices?all=1"); router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 pb-24">
      <section className="card flex flex-col gap-3">
        <div className="font-bold">The device</div>
        <Field label="Name *" hint="How it appears in lists, e.g. Ryan's iPhone."><input className={inp} value={d.name} onChange={set("name")} placeholder="Ryan's iPhone" /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Kind *"><select className={inp} value={d.kind} onChange={set("kind")}><option value="">—</option>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></Field>
          <Field label="Make / model"><input className={inp} value={d.make} onChange={set("make")} placeholder="Apple iPhone 16" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Whose is it"><select className={inp} value={d.person} onChange={set("person")}><option value="">Household</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Status"><select className={inp} value={d.status} onChange={set("status")}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        </div>
        <Field label="Note"><textarea className={inp + " py-2 min-h-16"} value={d.note} onChange={set("note")} /></Field>
      </section>

      <section className="card flex flex-col gap-3">
        <div className="font-bold">Serial</div>
        <Field label="Serial: last 4 only" hint="The full serial or IMEI is never stored here."><input className={inp} value={d.serialLast4} maxLength={4} onChange={set("serialLast4")} /></Field>
        <Field label="Full serial: 1Password item name" hint="The item's name only."><input className={inp} value={d.serialPointer} onChange={set("serialPointer")} /></Field>
      </section>

      <details className="card">
        <summary className="font-bold cursor-pointer min-h-9 flex items-center">Purchase, warranty and plan</summary>
        <p className="text-xs text-muted mt-1">Warranty and plan end dates surface on Devices and Today before they lapse.</p>
        <div className="flex flex-col gap-3 mt-3">
          <Field label="Purchased"><input className={inp} type="date" value={d.purchaseDate} onChange={set("purchaseDate")} /></Field>
          <Field label="Warranty ends"><input className={inp} type="date" value={d.warrantyEnd} onChange={set("warrantyEnd")} /></Field>
          <Field label="Protection plan"><input className={inp} value={d.planName} onChange={set("planName")} placeholder="AppleCare+" /></Field>
          <Field label="Plan ends"><input className={inp} type="date" value={d.planEnd} onChange={set("planEnd")} /></Field>
          <Field label="Subscription or line"><input className={inp} value={d.subscription} onChange={set("subscription")} placeholder="Carrier line ····03" /></Field>
        </div>
      </details>

      {err && <div className="rounded-xl bg-red-bg text-red px-4 py-3 text-sm font-semibold">{err}</div>}
      <div className="fixed bottom-16 inset-x-0 z-30 bg-bg/95 backdrop-blur border-t border-line"><div className="max-w-md mx-auto px-5 py-3 flex gap-2">
        <Link href="/devices" className="min-h-11 px-4 rounded-xl border border-line font-semibold text-sm inline-flex items-center">Cancel</Link>
        <button disabled={busy} className="flex-1 min-h-11 rounded-xl bg-accent text-white font-semibold disabled:opacity-50">{busy ? "Saving…" : "Add device"}</button>
      </div></div>
    </form>
  );
}
