import "server-only";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// Seeds a believable, fictional household for a demo tester -- the "Whitfield family" -- across the
// surfaces a prospect will actually look at first: Today's tasks, the week's calendar, an account with
// transactions, and one Inbox item to click through. Not exhaustive (70+ tables exist); this is the
// slice that makes the first five minutes feel like a real household, not an empty app.
//
// Service-role inserts bypass RLS, so every row below carries an explicit household_id -- the
// `current_household()` column default only fires for inserts made as a signed-in user (see
// supabase/demo/0001_multitenant_foundation.sql).

const service = () =>
  createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

export async function seedDemoHousehold(householdId: number, ownerId: string, ownerName: string) {
  const svc = service();
  const today = new Date();
  const iso = (daysFromNow: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + daysFromNow);
    return d.toISOString().slice(0, 10);
  };

  await svc.from("household").update({ name: "Whitfield" }).eq("id", householdId);

  // Tasks -- a mix of the three kinds the Today page shows.
  await svc.from("tasks").insert([
    { household_id: householdId, person: ownerId, kind: "do", title: "Sign the permission slip for the science trip", due_at: new Date(Date.now() + 86400000).toISOString(), tier: 2 },
    { household_id: householdId, kind: "decide", title: "Pick a dentist for the kids' cleanings", tier: 2 },
    { household_id: householdId, kind: "fyi", title: "Water bill auto-paid -- $64.12", tier: 1, status: "done" },
    { household_id: householdId, kind: "reply", title: "RSVP to the Hendersons' birthday party", due_at: new Date(Date.now() + 2 * 86400000).toISOString(), tier: 2 },
  ]);

  // This week's calendar.
  await svc.from("calendar_events").insert([
    { household_id: householdId, calendar_name: "Family", date: iso(1), start_time: "16:30", end_time: "17:30", title: "Soccer practice", place: "Lincoln Park Fields" },
    { household_id: householdId, calendar_name: "Family", date: iso(2), start_time: "09:00", end_time: "10:00", title: "Well-child checkup", place: "Dr. Patel's office" },
    { household_id: householdId, person: ownerId, person_name: ownerName, calendar_name: "Work", date: iso(3), start_time: "14:00", end_time: "15:00", title: "Quarterly review" },
    { household_id: householdId, calendar_name: "Family", date: iso(5), start_time: "11:00", end_time: "13:00", title: "Henderson birthday party", place: "132 Maple St" },
  ]);

  // Money: one checking account with a few transactions, a mix of states.
  const acct = `demo-checking-${householdId}`;
  await svc.from("accounts").insert({
    id: acct, household_id: householdId, kind: "checking", institution: "Prairie Trust Bank", last4: "4821", owner: ownerName, balance_current: 4812.33, balance_statement: 4920.1,
  });
  await svc.from("transactions").insert([
    { id: `${acct}-t1`, household_id: householdId, account_id: acct, amount: -64.12, merchant: "City Water Utility", date: iso(-2), status: "classified", category: "Utilities" },
    { id: `${acct}-t2`, household_id: householdId, account_id: acct, amount: -112.4, merchant: "Westside Grocery", date: iso(-1), status: "matched", category: "Groceries" },
    { id: `${acct}-t3`, household_id: householdId, account_id: acct, amount: -38.0, merchant: "Lincoln Park Soccer League", date: iso(-5), status: "unknown" },
  ]);

  // One Inbox item -- the thing a prospect taps to see the "identify this" flow.
  await svc.from("inbox_items").insert({
    household_id: householdId, kind: "identify", title: "What is this $38 charge?", origin: "Checking ****4821", missing: "Who is this for, and what is it?",
    options: ["Soccer league fee", "Something else", "Not ours -- flag it"],
  });

  return { household: "Whitfield" };
}
