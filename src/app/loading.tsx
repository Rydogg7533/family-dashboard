// Shown at once on every tap while the next page is prepared on the server, so navigation always answers immediately.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-3 animate-pulse">
      <div className="h-7 w-2/3 rounded-lg bg-soft" />
      <div className="h-12 rounded-xl bg-soft" />
      <div className="h-24 rounded-2xl bg-soft" />
      <div className="h-24 rounded-2xl bg-soft" />
      <div className="h-24 rounded-2xl bg-soft" />
    </div>
  );
}
