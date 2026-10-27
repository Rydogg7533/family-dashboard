"use client";
import { useEffect, useState } from "react";
import { H1 } from "@/components/ui";
import { loadAppearance, type Appearance } from "@/lib/appearance";

// The Today heading, following Settings › Appearance › Greeting. Appearance is stored per device
// (localStorage) until it moves to the profile row, so the server cannot see it: the server renders the
// date and the name; this swaps in the greeting once the page is on the phone.
//
// First line: "date" shows the date. "weather" and "quote" have no source yet (no weather feed, no quote
// list), so they show the date rather than inventing one; "none" shows nothing.
const partOfDay = (tz: string) => {
  const h = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: tz }).format(new Date())) % 24;
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

export function TodayGreeting({ date, name, tz }: { date: string; name: string; tz: string }) {
  const [a, setA] = useState<Appearance | null>(null);
  useEffect(() => { setA(loadAppearance()); }, []);
  if (!a) return <H1 right={name}>{date}</H1>;
  const who = a.greetingName.trim();
  return (
    <div className="mb-3">
      <H1 right={name}>{who ? `${partOfDay(tz)}, ${who}` : partOfDay(tz)}</H1>
      {a.firstLine !== "none" && <div className="text-sm text-muted -mt-2">{date}</div>}
    </div>
  );
}
