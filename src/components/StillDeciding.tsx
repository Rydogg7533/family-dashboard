"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { decideFate } from "@/app/review/actions";

// One replaced or gone thing on the weekly review (D18). The choices are the fates; "Still not sure" is a real answer and
// pushes the next ask out a month. Handing down to a household member needs a name, so that is a line to Ask.
const FATES: { id: Parameters<typeof decideFate>[1]; label: string }[] = [
  { id: "spare", label: "Keeping it" }, { id: "sell", label: "Sold" }, { id: "give", label: "Gave away" }, { id: "trade_in", label: "Traded in" }, { id: "trash", label: "Threw out" }, { id: "lost", label: "Lost" }, { id: "undecided", label: "Still not sure" },
];
export function StillDeciding({ item }: { item: { ref: string; name: string; owner: string; status: string; href: string } }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const act = (f: Parameters<typeof decideFate>[1]) => start(async () => {
    const r = await decideFate(item.ref, f);
    if (!r.ok) setErr(("error" in r && r.error) || "That did not work."); else router.refresh();
  });
  return (
    <div className="card flex flex-col gap-2">
      <div className="text-sm leading-snug"><Link href={item.href} className="font-semibold">{item.name}</Link> <span className="text-muted">({item.owner}) {item.status === "gone" ? "left the house; how?" : "was replaced; what happened to it?"}</span></div>
      <div className="flex flex-wrap gap-2">
        {FATES.map((f) => <button key={f.id} type="button" disabled={pending} onClick={() => act(f.id)} className={`min-h-10 px-3 rounded-full border text-xs font-semibold disabled:opacity-50 ${f.id === "undecided" ? "border-line text-muted" : "border-line"}`}>{f.label}</button>)}
        <Link href={`/ask?q=${encodeURIComponent(`Hand the ${item.name} down to `)}`} className="min-h-10 px-3 rounded-full border border-line text-xs font-semibold flex items-center">Hand down to…</Link>
      </div>
      {err && <div className="text-red text-xs font-semibold">{err}</div>}
    </div>
  );
}
