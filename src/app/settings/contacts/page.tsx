import Link from "next/link";
import { H1 } from "@/components/ui";
import ContactsSourcePicker from "@/components/c/ContactsSourcePicker";
import { getMyContactsConnection } from "@/lib/data-connections";

export const dynamic = "force-dynamic";

export default async function ContactsSource() {
  const c = await getMyContactsConnection();
  return (
    <>
      <H1 right={<Link href="/settings" className="font-semibold text-accent">Settings ›</Link>}>Contacts source</H1>
      <p className="text-xs text-muted mb-3">Where your own contacts live. This is per person: each parent chooses for themselves, and you can change it any time.</p>
      <ContactsSourcePicker {...c} />
      <p className="text-xs text-muted mt-4">Changing it never deletes a contact. The old source’s contacts are hidden here, and come back at the next sync if you switch back. Edits you make in the dashboard are saved to the source you choose, only for the fields you change, and refused if the contact changed there first.</p>
    </>
  );
}
