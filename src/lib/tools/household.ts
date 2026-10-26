import "server-only";
import type { Tool } from "@/lib/tools/types";
import { str } from "@/lib/tools/types";
import { calendarsWithChoices, forgetHouseholdTz, googleCalAccount, hasGoogleCal } from "@/lib/google-calendar";

// Settings a person can change by asking. Each one writes to the same row the Settings screen writes to —
// there is no separate path, so asking and tapping cannot disagree.
export const householdTools: Tool[] = [
  {
    name: "household.get", title: "Household settings", kind: "read", tier: 1,
    description: "The household's name and time zone. The time zone decides what today means everywhere.",
    input: {},
    async run(_a, c) {
      const { data } = await c.sb.from("household").select("name, tz").limit(1).maybeSingle();
      return { ok: true, summary: `${data?.name ?? "Household"} · ${data?.tz ?? c.tz}`, data: { name: data?.name ?? null, tz: data?.tz ?? c.tz, today: c.today } };
    },
  },
  {
    name: "household.setTimeZone", title: "Change the time zone", kind: "write", tier: 2, ownerOnly: true,
    description: "Set the household's time zone. Changes what today means on every page. Takes an IANA name like America/Denver.",
    input: { tz: { type: "string", describe: "An IANA time zone name, like America/Denver or Europe/Madrid", required: true } },
    async run(a, c) {
      const tz = str(a.tz);
      try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); } catch { return { ok: false, error: `${tz} is not a time zone this app knows.` }; }
      const { error } = await c.sb.from("household").update({ tz }).eq("id", 1);
      if (error) return { ok: false, error: error.message };
      forgetHouseholdTz();
      return { ok: true, summary: `Time zone is now ${tz}`, href: "/settings/household" };
    },
  },
  {
    name: "calendar.listFollowed", title: "Which calendars are followed", kind: "read", tier: 1,
    description: "Every calendar on the connected account, and whether this person follows it. An unfollowed calendar is invisible everywhere in the app.",
    input: {},
    async run() {
      if (!hasGoogleCal()) return { ok: false, error: "No calendar is connected." };
      const cals = await calendarsWithChoices();
      return { ok: true, summary: `${cals.filter((x) => x.shown).length} of ${cals.length} followed on ${googleCalAccount()}`, data: cals.map((x) => ({ id: x.id, name: x.name, followed: x.shown, isNew: x.isNew })) };
    },
  },
  {
    name: "calendar.follow", title: "Show or hide a calendar", kind: "write", tier: 2,
    description: "Follow or stop following one calendar, for the person asking. Hiding one takes it out of the calendar, Today, sitter detection and place suggestions at once.",
    input: {
      name: { type: "string", describe: "The calendar's name, as calendar.listFollowed gives it", required: true },
      follow: { type: "boolean", describe: "true to show it, false to hide it", required: true },
    },
    async run(a, c) {
      if (!hasGoogleCal()) return { ok: false, error: "No calendar is connected." };
      const want = str(a.name).toLowerCase();
      const cals = await calendarsWithChoices();
      const cal = cals.find((x) => x.name.toLowerCase() === want) ?? cals.find((x) => x.name.toLowerCase().includes(want));
      if (!cal) return { ok: false, error: `No calendar called "${str(a.name)}". There is: ${cals.map((x) => x.name).join(", ")}.` };
      const follow = a.follow === true || str(a.follow) === "true";
      const { error } = await c.sb.from("calendar_choices").upsert({
        person: c.userId, account: googleCalAccount(), calendar_id: cal.id, shown: follow,
        name: cal.name, color: cal.color, updated_at: new Date().toISOString(),
      }, { onConflict: "person,account,calendar_id" });
      if (error) return { ok: false, error: error.message };
      return { ok: true, summary: `${cal.name} is now ${follow ? "shown" : "hidden"}`, href: "/calendar?calendars=1" };
    },
  },
];
