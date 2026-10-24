"use client";
// A 6-digit keypad for children. Big keys, dots instead of digits, no autocomplete.
export function PinPad({ value, onChange, disabled, label }: { value: string; onChange: (v: string) => void; disabled?: boolean; label?: string }) {
  const press = (d: string) => { if (disabled) return; if (d === "del") onChange(value.slice(0, -1)); else if (value.length < 6) onChange(value + d); };
  return (
    <div className="flex flex-col items-center gap-4">
      {label && <div className="text-sm font-semibold">{label}</div>}
      <div className="flex gap-3" aria-label={`${value.length} of 6 digits entered`}>{[0, 1, 2, 3, 4, 5].map((i) => <span key={i} className={`w-4 h-4 rounded-full border-2 border-accent ${i < value.length ? "bg-accent" : ""}`} />)}</div>
      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"].map((k, i) => k === "" ? <span key={i} /> : (
          <button key={i} type="button" disabled={disabled} onClick={() => press(k)} aria-label={k === "del" ? "Delete" : k} className="w-[72px] h-[72px] rounded-full bg-soft text-2xl font-semibold active:bg-accent active:text-white disabled:opacity-50">{k === "del" ? "⌫" : k}</button>
        ))}
      </div>
    </div>
  );
}
