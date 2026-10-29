import {
  Zap, Files, House, Settings, Inbox, Receipt, Clock, CalendarDays, MessageSquare, Mail, ShieldCheck, ShoppingCart, Mailbox,
  CalendarClock, Repeat, CreditCard, Award, Folder, Users, Contact, Car, Laptop, MapPin, HeartPulse, Siren, Activity, Bell,
  Filter, Plug, LayoutDashboard, Palette, ScrollText, Phone, ClipboardList, Baby, Tv, Sun, Sparkles, Wallet, LayoutGrid, type LucideIcon,
} from "lucide-react";

// Icon names used by src/lib/more-links.ts. Usable from server and client components.
const ICONS: Record<string, LucideIcon> = {
  zap: Zap, files: Files, house: House, settings: Settings, inbox: Inbox, receipt: Receipt, clock: Clock, calendar: CalendarDays,
  message: MessageSquare, mail: Mail, claims: ShieldCheck, cart: ShoppingCart, mailbox: Mailbox, calendarClock: CalendarClock,
  repeat: Repeat, creditCard: CreditCard, award: Award, folder: Folder, users: Users, contact: Contact, car: Car, laptop: Laptop,
  mapPin: MapPin, heartPulse: HeartPulse, siren: Siren, activity: Activity, bell: Bell, filter: Filter, plug: Plug,
  layout: LayoutDashboard, palette: Palette, scroll: ScrollText, phone: Phone, list: ClipboardList, baby: Baby, tv: Tv,
  sun: Sun, sparkles: Sparkles, wallet: Wallet, grid: LayoutGrid,
};

export function MoreIcon({ name, size = 22, className, strokeWidth = 1.75, fill }: { name: string; size?: number; className?: string; strokeWidth?: number; fill?: string }) {
  const I = ICONS[name] ?? Folder;
  return <I size={size} strokeWidth={strokeWidth} fill={fill} aria-hidden="true" className={className} />;
}
