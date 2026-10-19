// "Always say who" (design principle): every item names who asked for it or whom it is for, next to its source.
// Renders e.g. "Melissa asked · for Ryan · from Messages · 7:52" or "System · from email (Ryan's Gmail)".
export function Who({ by, forPerson, source, href, at, className = "" }: { by: string; forPerson?: string | null; source?: string; href?: string; at?: string; className?: string }) {
  return (
    <div className={`text-xs text-muted ${className}`}>
      <span className="font-semibold text-fg/80">{by}</span>
      {forPerson ? <> · for {forPerson}</> : null}
      {source ? <> · from {href ? <a href={href} className="font-semibold text-accent">{source}</a> : source}</> : null}
      {at ? <> · {at}</> : null}
    </div>
  );
}
