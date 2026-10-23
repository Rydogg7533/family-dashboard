import {
  Zap, Files, House, Settings, Inbox, Receipt, Clock, CalendarDays, MessageSquare, Mail, ShieldCheck, ShoppingCart, Mailbox,
  CalendarClock, Repeat, CreditCard, Award, Folder, Users, Contact, Car, Laptop, MapPin, HeartPulse, Siren, Activity, Bell,
  Filter, Plug, LayoutDashboard, Palette, ScrollText, Phone, ClipboardList, Baby, Tv, type LucideIcon,
} from "lucide-react";

// Icon names used by src/lib/more-links.ts. Usable from server and client components.
const ICONS: Record<string, LucideIcon> = {
  zap: Zap, files: Files, house: House, settings: Settings, inbox: Inbox, receipt: Receipt, clock: Clock, calendar: CalendarDays,
  message: MessageSquare, mail: Mail, claims: ShieldCheck, cart: ShoppingCart, mailbox: Mailbox, calendarClock: CalendarClock,
  repeat: Repeat, creditCard: CreditCard, award: Award, folder: Folder, users: Users, contact: Contact, car: Car, laptop: Laptop,
  mapPin: MapPin, heartPulse: HeartPulse, siren: Siren, activity: Activity, bell: Bell, filter: Filter, plug: Plug,
  layout: LayoutDashboard, palette: Palette, scroll: ScrollText, phone: Phone, list: ClipboardList, baby: Baby, tv: Tv,
};

export function MoreIcon({ name, size = 22, className }: { name: string; size?: number; className?: string }) {
  const I = ICONS[name] ?? Folder;
  return <I size={size} strokeWidth={1.75} aria-hidden="true" className={className} />;
}
