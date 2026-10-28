"use client";
// Settings › Sitter › Approved sitters: the list and the add flow (from Contacts, or someone new), with "all now" or "name and phone, finish later" (D4).
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addSitterFromContact, addSitterNew, searchContactsForSitter, type SitterFields } from "@/app/settings/sitter/templates-actions";
import type { SitterPerson } from "@/lib/sitter-shared";

const inp = "w-full min-h-10 rounded-xl border border-line bg-bg px-3 text-sm";
const btn = "min-h-10 px-4 rounded-xl border border-line text-sm font-semibold disabled:opacity-50";
const prim = "min-h-11 px-4 rounded-xl bg-accent text-white font-semibold text-sm disabled:opacity-50";
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Denver" });

export function SitterPeople({ sitters, owner, kids }: { sitters: SitterPerson[]; owner: boolean; kids: { id: string; name: string }[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const approved = sitters.filter((s) => s.approvedAt), suggested = sitters.filter((s) => !s.approvedAt);
  return (
    <div className="flex flex-col gap-3">
      {msg && <div className="rounded-xl bg-green-bg text-green px-4 py-3 text-sm font-semibold">{msg}</div>}
      {!adding && <button onClick={() => { setAdding(true); setMsg(null); }} className={prim + " self-start"}>+ Add a sitter</button>}
      {adding && <AddSitter owner={owner} kids={kids} onDone={(note) => { setAdding(false); setMsg(note); router.refresh(); }} onCancel={() => setAdding(false)} />}
      {suggested.length > 0 && (
        <div className="card flex flex-col gap-2">
          <div className="font-semibold text-sm">Waiting for an owner’s approval</div>
          {suggested.map((s) => <Row key={s.id} s={s} />)}
        </div>
      )}
      {approved.length === 0 && !adding && <div className="card text-sm text-muted">No approved sitters yet. Add the people you already trust; a sitter who isn’t on this list can still be used for a visit.</div>}
      {approved.map((s) => <Row key={s.id} s={s} />)}
    </div>
  );
}

function Row({ s }: { s: SitterPerson }) {
  return (
    <Link href={`/settings/sitter/people/${s.id}`} className="card flex flex-col gap-1 no-underline">
      <div className="flex justify-between items-start gap-2">
        <div className="font-semibold">{s.name}{s.ageBand === "teen" ? <span className="text-xs text-muted font-normal"> · teen{s.age ? ` ${s.age}` : ""}</span> : null}</div>
        {s.pending ? <span className="text-[11px] font-bold rounded-full px-2 py-0.5 bg-amber-bg text-amber">Contact syncing</span> : s.lastVisitAt ? <span className="text-xs text-muted">Last sat {fmtDay(s.lastVisitAt)}</span> : null}
      </div>
      <div className="text-xs text-muted">{[s.phone ?? "no phone yet", s.relationship, s.rateText, s.drives ? "drives" : null].filter(Boolean).join(" · ")}</div>
      {s.missing.length > 0 && <div className="text-xs text-amber">{s.missing.length} detail{s.missing.length === 1 ? "" : "s"} missing</div>}
    </Link>
  );
}

function AddSitter({ owner, kids, onDone, onCancel }: { owner: boolean; kids: { id: string; name: string }[]; onDone: (note: string) => void; onCancel: () => void }) {
  const [mode, setMode] = useState<"pick" | "new">("pick");
  const [q, setQ] = useState(""); const [list, setList] = useState<{ id: string; name: string; phone: string | null; mine: boolean }[]>([]);
  const [card, setCard] = useState<{ id: string; name: string; phone: string | null } | null>(null);
  const [first, setFirst] = useState(""); const [last, setLast] = useState(""); const [phone, setPhone] = useState("");
  const [depth, setDepth] = useState<"ask" | "now" | "later">("ask");
  const [f, setF] = useState<SitterFields>({ relationship: "", ageBand: "", age: null, rateText: "", drives: null, childrenOk: null, availabilityText: "", certifiedText: "", notes: "" });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const identified = mode === "pick" ? !!card : !!(first || last) && !!phone;
  const name = mode === "pick" ? card?.name ?? "" : [first, last].filter(Boolean).join(" ");

  const save = async () => {
    setBusy(true); setErr(null);
    const fields: SitterFields = depth === "now" ? f : {};
    const r = mode === "pick" ? await addSitterFromContact(card!.id, fields, depth === "later") : await addSitterNew(first, last, phone, fields, depth === "later");
    setBusy(false);
    if (!r.ok) { setErr(r.error ?? "Could not save."); return; }
    onDone((r.note ?? "Saved.") + (depth === "later" ? " A task to finish the details is on your list." : ""));
  };

  return (
    <div className="card flex flex-col gap-3">
      <div className="font-semibold">Add a sitter</div>
      <div className="flex gap-2">
        <button onClick={() => setMode("pick")} className={`${btn} ${mode === "pick" ? "bg-soft" : ""}`}>From Contacts</button>
        <button onClick={() => setMode("new")} className={`${btn} ${mode === "new" ? "bg-soft" : ""}`}>Someone new</button>
      </div>
      {mode === "pick" && !card && (
        <div className="flex flex-col gap-1.5">
          <input className={inp} placeholder="Search your contacts by name" value={q} onChange={async (e) => { const v = e.target.value; setQ(v); setList(v.trim().length >= 2 ? await searchContactsForSitter(v) : []); }} autoFocus />
          {list.map((c) => <button key={c.id} onClick={() => setCard(c)} className="text-left rounded-lg bg-soft px-3 py-2 text-sm flex justify-between"><span>{c.name}</span><span className="text-muted text-xs">{c.phone ?? "no phone"}</span></button>)}
          {q.trim().length >= 2 && list.length === 0 && <div className="text-xs text-muted">Nobody by that name. Try “Someone new”.</div>}
        </div>
      )}
      {mode === "pick" && card && <div className="text-sm flex justify-between items-center rounded-lg bg-soft px-3 py-2"><span><b>{card.name}</b> <span className="text-muted text-xs">{card.phone ?? "no phone on the card"}</span></span><button onClick={() => setCard(null)} className="text-xs font-semibold text-muted">Change</button></div>}
      {mode === "new" && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2"><input className={inp} placeholder="First name" value={first} onChange={(e) => setFirst(e.target.value)} autoFocus /><input className={inp} placeholder="Last name" value={last} onChange={(e) => setLast(e.target.value)} /></div>
          <input className={inp} type="tel" placeholder="Mobile number" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <div className="text-xs text-muted">Goes into your Contacts (and to Google or Apple on the next sync). Name and phone live there, not here.</div>
        </div>
      )}
      {identified && depth === "ask" && (
        <div className="rounded-xl border border-line p-3 flex flex-col gap-2">
          <div className="text-sm">Add all of {name.split(" ")[0]}’s details now, or just name and phone and finish later?</div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setDepth("now")} className={btn}>All now</button>
            <button onClick={() => setDepth("later")} className={btn}>Name and phone, finish later</button>
          </div>
          <div className="text-xs text-muted">“Finish later” puts a task on your list and the sitter can be used right away.</div>
        </div>
      )}
      {identified && depth === "now" && <SitterFieldsForm f={f} setF={setF} kids={kids} />}
      {err && <div className="text-sm text-red">{err}</div>}
      <div className="flex gap-2 items-center">
        {identified && depth !== "ask" && <button disabled={busy} onClick={save} className={prim}>{owner ? "Save as approved sitter" : "Suggest this sitter"}</button>}
        <button onClick={onCancel} className="text-xs font-semibold text-muted min-h-9 px-2">Cancel</button>
      </div>
    </div>
  );
}

export function SitterFieldsForm({ f, setF, kids }: { f: SitterFields; setF: (f: SitterFields) => void; kids: { id: string; name: string }[] }) {
  const set = (k: keyof SitterFields, v: unknown) => setF({ ...f, [k]: v });
  const ok = f.childrenOk;
  return (
    <div className="flex flex-col gap-2">
      <input className={inp} placeholder="How you know them (neighbour, Melissa's niece, from church)" value={f.relationship ?? ""} onChange={(e) => set("relationship", e.target.value)} />
      <div className="flex gap-2 items-center">
        <select className={inp} value={f.ageBand ?? ""} onChange={(e) => set("ageBand", e.target.value)}><option value="">Adult or teen?</option><option value="adult">Adult</option><option value="teen">Teen</option></select>
        {f.ageBand === "teen" && <input className={inp} type="number" placeholder="Age" min={10} max={19} value={f.age ?? ""} onChange={(e) => set("age", e.target.value ? Number(e.target.value) : null)} />}
      </div>
      <div className="flex gap-2">
        <input className={inp} placeholder="Rate ($15/hr, $60 flat)" value={f.rateText ?? ""} onChange={(e) => set("rateText", e.target.value)} />
        <select className={inp} value={f.drives == null ? "" : f.drives ? "yes" : "no"} onChange={(e) => set("drives", e.target.value === "" ? null : e.target.value === "yes")}><option value="">Drives?</option><option value="yes">Drives</option><option value="no">Doesn’t drive</option></select>
      </div>
      {kids.length > 0 && (
        <div className="text-xs flex flex-wrap gap-2 items-center"><span className="text-muted">Good with:</span>
          <label className="flex items-center gap-1"><input type="checkbox" checked={ok == null} onChange={(e) => set("childrenOk", e.target.checked ? null : [])} /> all kids</label>
          {ok != null && kids.map((k) => <label key={k.id} className="flex items-center gap-1"><input type="checkbox" checked={ok.includes(k.id)} onChange={(e) => set("childrenOk", e.target.checked ? [...ok, k.id] : ok.filter((x) => x !== k.id))} /> {k.name}</label>)}
        </div>
      )}
      <input className={inp} placeholder="Availability (weekends only, not Sundays)" value={f.availabilityText ?? ""} onChange={(e) => set("availabilityText", e.target.value)} />
      <input className={inp} placeholder="CPR or first-aid (and year)" value={f.certifiedText ?? ""} onChange={(e) => set("certifiedText", e.target.value)} />
      <textarea rows={2} className={inp} placeholder="Notes (allergic to cats, needs a ride home after 10)" value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
    </div>
  );
}
