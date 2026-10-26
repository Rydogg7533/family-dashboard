import type { Task } from "@/lib/data";

// Where a task is actually finished, when that is somewhere a link can go.
//
// origin_ref is an identity key, not a destination: only "system" happens to hold a path. Every other
// kind stores something shaped for deduplication -- "routine:amazon:history@2026-10",
// "veh:<uuid>:0@needs_end", "<childId>:own_location" -- so each needs its own reading. The task detail
// page used to render href={task.origin_ref ?? "#"} directly, which meant a link to "#" for the 43 of
// 75 email tasks that have no ref, and href="routine:amazon:history@2026-10" for every routine task,
// which a browser reads as an unknown URL scheme.
//
// null means there is nowhere to send anyone. "Change the furnace filter" happens in the basement, and
// the title stays plain text rather than pretending to be a link.
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export type Destination = { href: string; label: string; external?: boolean };

export function taskDestination(task: Task): Destination | null {
  const ref = task.origin_ref ?? "";
  if (task.title.startsWith("Subscription? ")) return { href: `/tasks/${task.id}`, label: "the question" };
  switch (task.origin_kind) {
    case "system":
      return ref.startsWith("/") ? { href: ref, label: "it" } : null;
    case "routine":
      return { href: "/money/routine", label: "the money routine" };
    case "receipt":
      return { href: "/money/receipts", label: "receipts" };
    case "claim":
      return { href: "/claims", label: "claims" };
    case "message":
      return { href: "/messages", label: "messages" };
    case "calendar":
      return { href: "/calendar", label: "the calendar" };
    case "warranty": {
      const m = ref.match(new RegExp(`^veh:(${UUID})`, "i"));
      return m ? { href: `/vehicles/${m[1]}/edit`, label: "the vehicle" } : { href: "/warranties", label: "warranties" };
    }
    case "child_unlock": {
      const m = ref.match(new RegExp(`^(${UUID})`, "i"));
      return m ? { href: `/settings/people/${m[1]}`, label: "their access" } : { href: "/settings/people/features", label: "child features" };
    }
    case "email":
      return /^https?:\/\//i.test(ref) ? { href: ref, label: "the email", external: true } : { href: "/mail", label: "mail" };
    default:
      // "person": somebody typed this errand. There is no page where it gets done.
      return null;
  }
}
