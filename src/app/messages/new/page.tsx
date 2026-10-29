import Link from "next/link";
import { NewMessage } from "@/components/c/NewMessage";

export const dynamic = "force-dynamic";

// Start a conversation with anyone in the person's Contacts. The first line goes out through Messages from the Mac;
// the thread shows up here on the mirror's next pass (within a minute).
export default function NewMessagePage() {
  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <Link href="/messages" className="min-w-9 min-h-9 flex items-center justify-center rounded-lg hover:bg-soft text-accent font-bold text-xl" aria-label="Back to Messages">‹</Link>
        <h1 className="text-sm font-bold">New message</h1>
        <span className="min-w-9" />
      </div>
      <NewMessage />
    </>
  );
}
