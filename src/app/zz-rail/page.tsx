import ContactsBook from "@/components/c/ContactsBook";
export const dynamic = "force-dynamic";
export default function T() {
  const names = "Adams Baker Chen Davis Evans Foster Garcia Hill Ito Jones King Lopez Moore Nash Ortiz Park Quinn Reed Smith Tran Young Zhao".split(" ");
  const cards = names.flatMap((n, i) => [0, 1, 2, 3, 4].map((k) => ({ id: `${i}-${k}`, fullName: `P${k} ${n}`, firstName: `P${k}`, lastName: n, nickname: null, org: null, phones: [], emails: [], addresses: [], birthday: null, notes: null, etag: null, mine: true, pending: false })));
  return <ContactsBook cards={cards} />;
}
