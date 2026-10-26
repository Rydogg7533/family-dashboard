// Slice A data: people, vehicles, devices, medications, contacts, home items,
// places, sources, emergency plan. Sample fallbacks when Supabase is unset.
import { createClient, getRequestUser, hasSupabaseEnv } from "@/lib/supabase/server";

export * from "@/lib/a-shared";
import { PEOPLE, setRoster, dIso, daysUntil, dueText, type Device, type Vehicle, type Person, type PersonId, type Medication, type Contact, type HomeItem, type Place, type Source, type EmergencySection, type ScheduleBlock, type Activity, type OpenItem } from "@/lib/a-shared";


const sampleVehicles: Vehicle[] = [
  {
    id: "tahoe", name: "2016 Chevrolet Tahoe", short: "Tahoe", year: 2016, make: "Chevrolet", model: "Tahoe", plate: "[PLATE]", driver: "ryan",
    mileage: 128400, mileageAt: dIso(-12), mileageEstimated: false,
    expiries: [
      { label: "Registration renewal", date: dIso(23), kind: "registration", action: "Renew online", source: "Utah DMV", href: "#utah-dmv" },
      { label: "Safety and emissions", date: dIso(23), kind: "emissions", action: "Book inspection", source: "Emissions station", href: "#emissions" },
      { label: "Insurance policy renewal", date: dIso(140), kind: "insurance", action: "Review renewal", source: "Insurer site", href: "#insurer" },
      { label: "Ryan's driver's license", date: dIso(410), kind: "license", action: "Renew", source: "Utah DMV", href: "#utah-dmv" },
      { label: "Roadside membership", date: dIso(200), kind: "other", action: "Renew", source: "Roadside provider", href: "#roadside" },
    ],
    maintenance: [
      { item: "Oil change", dueDate: dIso(40), dueMiles: 130000, lastDone: dIso(-80) },
      { item: "Tire rotation", dueDate: dIso(40), dueMiles: 130000, lastDone: dIso(-80) },
      { item: "Cabin and engine filters", dueDate: dIso(120), dueMiles: 135000, lastDone: dIso(-300) },
      { item: "Brake inspection", dueDate: null, dueMiles: 140000, lastDone: dIso(-400) },
      { item: "Battery (age check)", dueDate: dIso(240), dueMiles: null, lastDone: dIso(-900) },
    ],
    documents: [
      { name: "Tahoe registration card", vault: "1Password", href: "#1p-tahoe-registration" },
      { name: "Tahoe insurance card", vault: "1Password", href: "#1p-tahoe-insurance" },
      { name: "Tahoe title", vault: "1Password", href: "#1p-tahoe-title" },
      { name: "Service records", vault: "Organized", href: "#finder-vehicles-tahoe" },
      { name: "Owner's manual", vault: "Organized", href: "#finder-vehicles-tahoe-manual" },
    ],
    reminders: [{ item: "Registration and inspection", lead: "30 days and 7 days" }, { item: "Insurance renewal", lead: "14 days" }, { item: "License", lead: "60 days" }, { item: "Maintenance", lead: "when due by date or within 500 miles, once" }, { item: "Recall", lead: "when found (monthly VIN check)" }],
    links: [{ label: "Utah DMV renewal", href: "#utah-dmv" }, { label: "Insurer", href: "#insurer" }, { label: "Shop booking", href: "#shop" }, { label: "Chevrolet owner site", href: "#gm-owner" }], addedBy: "Ryan · from Settings · 2026-10-18",
  },
  {
    id: "sienna", name: "2018 Toyota Sienna", short: "Sienna", year: 2018, make: "Toyota", model: "Sienna", plate: "[PLATE]", driver: "melissa",
    mileage: 98600, mileageAt: dIso(-30), mileageEstimated: true,
    expiries: [
      { label: "Registration renewal", date: dIso(150), kind: "registration", action: "Renew online", source: "Utah DMV", href: "#utah-dmv" },
      { label: "Safety and emissions", date: dIso(-5), kind: "emissions", action: "Book inspection", source: "Emissions station", href: "#emissions" },
      { label: "Insurance policy renewal", date: dIso(140), kind: "insurance", action: "Review renewal", source: "Insurer site", href: "#insurer" },
      { label: "Melissa's driver's license", date: dIso(900), kind: "license", action: "Renew", source: "Utah DMV", href: "#utah-dmv" },
    ],
    maintenance: [
      { item: "Oil change", dueDate: dIso(10), dueMiles: 99000, lastDone: dIso(-170) },
      { item: "Tire rotation", dueDate: dIso(10), dueMiles: 99000, lastDone: dIso(-170) },
      { item: "Transmission fluid", dueDate: null, dueMiles: 100000, lastDone: null },
      { item: "Wiper blades", dueDate: dIso(60), dueMiles: null, lastDone: dIso(-300) },
    ],
    documents: [
      { name: "Sienna registration card", vault: "1Password", href: "#1p-sienna-registration" },
      { name: "Sienna insurance card", vault: "1Password", href: "#1p-sienna-insurance" },
      { name: "Sienna title", vault: "1Password", href: "#1p-sienna-title" },
      { name: "Service records", vault: "Organized", href: "#finder-vehicles-sienna" },
    ],
    reminders: [{ item: "Registration and inspection", lead: "30 days and 7 days" }, { item: "Insurance renewal", lead: "14 days" }, { item: "License", lead: "60 days" }, { item: "Maintenance", lead: "when due by date or within 500 miles, once" }, { item: "Recall", lead: "when found (monthly VIN check)" }],
    links: [{ label: "Utah DMV renewal", href: "#utah-dmv" }, { label: "Insurer", href: "#insurer" }, { label: "Shop booking", href: "#shop" }, { label: "Toyota owner site", href: "#toyota-owner" }], addedBy: "Melissa · from Ask · 2026-10-18",
  },
];

const sampleDevices: Device[] = [
  { id: "d1", person: "ryan", name: "iPhone", kind: "phone", make: "Apple", status: "in use", serialLast4: "7K2Q", serialPointer: "1Password: Ryan iPhone", warrantyEnd: dIso(300), planName: "AppleCare+", planEnd: dIso(300), subscription: "Phone plan line ····01", note: null, openIn: { label: "Find My", href: "#findmy" }, addedBy: "Ryan · from receipt (Ryan's Gmail)" },
  { id: "d2", person: "ryan", name: "MacBook Pro", kind: "laptop", make: "Apple", status: "in use", serialLast4: "M9XD", serialPointer: "1Password: Ryan MacBook", warrantyEnd: dIso(30), planName: "Laptop protection plan", planEnd: dIso(30), subscription: null, note: "Decide: extend or let lapse", openIn: { label: "AppleCare", href: "#applecare" }, addedBy: "Ryan · from receipt (Ryan's Gmail)" },
  { id: "d3", person: "ryan", name: "Super73 S2", kind: "e-bike", make: "Super73", status: "in use", serialLast4: "S2A8", serialPointer: "Organized: Devices/Super73 receipt", warrantyEnd: dIso(-100), planName: null, planEnd: null, subscription: "Super73 app", note: "Warranty ended", openIn: { label: "Super73 app", href: "#super73" }, addedBy: "Ryan · from receipt (Ryan's Gmail)" },
  { id: "d4", person: "melissa", name: "iPhone", kind: "phone", make: "Apple", status: "in use", serialLast4: "P3LW", serialPointer: "1Password: Melissa iPhone", warrantyEnd: dIso(500), planName: "AppleCare+", planEnd: dIso(500), subscription: "Phone plan line ····02", note: null, openIn: { label: "Find My", href: "#findmy" }, addedBy: "Melissa · from receipt (Melissa's mail)" },
  { id: "d5", person: "melissa", name: "iPad", kind: "tablet", make: "Apple", status: "in use", serialLast4: "Q8RT", serialPointer: "1Password: Melissa iPad", warrantyEnd: dIso(-200), planName: null, planEnd: null, subscription: null, note: null, openIn: { label: "Find My", href: "#findmy" }, addedBy: "Melissa · from receipt (Melissa's mail)" },
  { id: "d6", person: "child1", name: "iPad (hand-me-down)", kind: "tablet", make: "Apple", status: "in use", serialLast4: "A1C3", serialPointer: "1Password: Child 1 iPad", warrantyEnd: dIso(-400), planName: null, planEnd: null, subscription: null, note: "Was Ryan's until 2025", openIn: { label: "Find My", href: "#findmy" }, addedBy: "Melissa · from Ask" },
  { id: "d7", person: "child2", name: "Kids watch", kind: "watch", make: "[Make]", status: "in use", serialLast4: "W4Z1", serialPointer: "Organized: Devices/watch receipt", warrantyEnd: dIso(12), planName: null, planEnd: null, subscription: "Watch plan line ····03", note: "Warranty ending", openIn: { label: "Carrier account", href: "#carrier" }, addedBy: "Melissa · from Ask" },
  { id: "d8", person: "household", name: "Mac mini", kind: "desktop", make: "Apple", status: "in use", serialLast4: "H7MN", serialPointer: "1Password: Mac mini", warrantyEnd: dIso(220), planName: null, planEnd: null, subscription: null, note: "Runs the dashboard agent", openIn: { label: "Apple devices", href: "#apple-devices" }, addedBy: "Ryan · from Settings" },
  { id: "d9", person: "household", name: "Rossiter 8TB", kind: "other", make: "[Make]", status: "in use", serialLast4: "8TB4", serialPointer: "Organized: Devices/8TB receipt", warrantyEnd: dIso(600), planName: null, planEnd: null, subscription: null, note: "Nightly mirror target", openIn: { label: "Manufacturer warranty", href: "#warranty" }, addedBy: "Ryan · from Settings" },
  { id: "d10", person: "household", name: "Refrigerator", kind: "appliance", make: "[Make]", status: "in use", serialLast4: "F2R9", serialPointer: "Organized: Home/Appliances", warrantyEnd: dIso(45), planName: null, planEnd: null, subscription: null, note: "Water filter every 6 months", openIn: { label: "Appliance app", href: "#appliance" }, addedBy: "Ryan · from Settings" },
  { id: "d11", person: "household", name: "Router", kind: "other", make: "[Make]", status: "in use", serialLast4: "R0UT", serialPointer: "Apple Passwords: Home Wi-Fi (shared)", warrantyEnd: null, planName: null, planEnd: null, subscription: "Internet ····44", note: null, openIn: { label: "Router app", href: "#router" }, addedBy: "Ryan · from Settings" },
  { id: "d12", person: "ryan", name: "Old iPhone", kind: "phone", make: "Apple", status: "retired", serialLast4: "O1D2", serialPointer: "1Password: Old iPhone", warrantyEnd: null, planName: null, planEnd: null, subscription: null, note: "Retired 2025", openIn: { label: "Find My", href: "#findmy" }, addedBy: "Ryan · from receipt (Ryan's Gmail)" },
];

const sampleMeds: Medication[] = [
  { id: "m1", person: "ryan", name: "[Medication A]", strength: "[strength]", dose: "1 tablet", times: ["8:00 am"], doctor: "[Dr. Name]", pharmacy: "[Pharmacy]", pharmacyHref: "#pharmacy", refillsRemaining: 2, refillDue: dIso(6), reminders: true, instructions: "With food", prescriptionPointer: "1Password: Rx A", addedBy: "Ryan · from label photo" },
  { id: "m2", person: "ryan", name: "[Supplement B]", strength: "[strength]", dose: "1 capsule", times: ["8:00 am", "8:00 pm"], doctor: "—", pharmacy: "[Retailer]", pharmacyHref: "#retailer", refillsRemaining: 0, refillDue: dIso(25), reminders: false, instructions: null, prescriptionPointer: "—", addedBy: "Ryan · from label photo" },
  { id: "m3", person: "melissa", name: "[Medication C]", strength: "[strength]", dose: "1 tablet", times: ["9:00 pm"], doctor: "[Dr. Name]", pharmacy: "[Pharmacy]", pharmacyHref: "#pharmacy", refillsRemaining: 1, refillDue: dIso(14), reminders: true, instructions: null, prescriptionPointer: "1Password: Rx C", addedBy: "Melissa · from Ask" },
  { id: "m4", person: "child1", name: "[Medication D]", strength: "[strength]", dose: "5 ml", times: ["7:30 am", "7:30 pm"], doctor: "[Dr. Name]", pharmacy: "[Pharmacy]", pharmacyHref: "#pharmacy", refillsRemaining: 3, refillDue: dIso(-2), reminders: true, instructions: "Avoid dairy for 1 hour", prescriptionPointer: "1Password: Rx D", addedBy: "Melissa · from Ask (for the child)" },
  { id: "m5", person: "child2", name: "[Vitamin E]", strength: "[strength]", dose: "1 gummy", times: ["7:30 am"], doctor: "—", pharmacy: "[Retailer]", pharmacyHref: "#retailer", refillsRemaining: 0, refillDue: dIso(40), reminders: false, instructions: null, prescriptionPointer: "—", addedBy: "Melissa · from Ask (for the child)" },
];

const sampleContacts: Contact[] = [
  { id: "c1", name: "[Family doctor]", kind: "Doctor", reach: "[phone] · patient portal", registers: ["Health: Ryan", "Health: Melissa"], notes: "Ask for the nurse line for refills", openIn: { label: "Apple Contacts", href: "#contacts" }, addedBy: "System · from email signature (Ryan's Gmail)" },
  { id: "c2", name: "[Pediatrician]", kind: "Doctor", reach: "[phone] · portal", registers: ["Health: [Child 1]", "Health: [Child 2]"], notes: null, openIn: { label: "Apple Contacts", href: "#contacts" }, addedBy: "Melissa · from Ask" },
  { id: "c3", name: "[Dentist]", kind: "Dentist", reach: "[phone]", registers: ["Health: all"], notes: "Cleanings every 6 months", openIn: { label: "Apple Contacts", href: "#contacts" }, addedBy: "Ryan · from Settings" },
  { id: "c4", name: "[Elementary school office]", kind: "School", reach: "[phone] · [portal]", registers: ["School: [Child 1]", "School: [Child 2]"], notes: "Office hours 7:30–3:30", openIn: { label: "School portal", href: "#school" }, addedBy: "System · from calendar invite (Melissa)" },
  { id: "c5", name: "[Soccer coach]", kind: "Coach", reach: "[phone] · team app", registers: ["Activities: [Child 1]"], notes: null, openIn: { label: "Team app", href: "#team" }, addedBy: "System · from email signature (Ryan's Gmail)" },
  { id: "c6", name: "[Insurance agent]", kind: "Insurer", reach: "[phone] · [email]", registers: ["Vehicles", "Home"], notes: "Policy numbers in 1Password", openIn: { label: "Apple Contacts", href: "#contacts" }, addedBy: "Melissa · from Ask" },
  { id: "c7", name: "[HVAC company]", kind: "Contractor", reach: "[phone]", registers: ["Home"], notes: "Fall tune-up each October", openIn: { label: "Apple Contacts", href: "#contacts" }, addedBy: "Ryan · from Settings" },
  { id: "c8", name: "[Plumber]", kind: "Contractor", reach: "[phone]", registers: ["Home"], notes: null, openIn: { label: "Apple Contacts", href: "#contacts" }, addedBy: "System · from calendar invite (Melissa)" },
  { id: "c9", name: "[Accountant]", kind: "Accountant", reach: "[email] · portal", registers: ["Money", "Emergency plan"], notes: "Tax year packets by March", openIn: { label: "Accountant portal", href: "#accountant" }, addedBy: "System · from email signature (Ryan's Gmail)" },
  { id: "c10", name: "[Power company]", kind: "Utility", reach: "[phone] · account ····21", registers: ["Home", "Money"], notes: null, openIn: { label: "Utility site", href: "#utility" }, addedBy: "Melissa · from Ask" },
  { id: "c11", name: "[Carpool family]", kind: "Carpool", reach: "[phone]", registers: ["Activities: [Child 1]"], notes: "Drives Tuesdays", openIn: { label: "Apple Contacts", href: "#contacts" }, addedBy: "Ryan · from Settings" },
  { id: "c12", name: "[Neighbor]", kind: "Neighbor", reach: "[phone]", registers: ["Emergency plan", "Trips"], notes: "Has a spare key", openIn: { label: "Apple Contacts", href: "#contacts" }, addedBy: "System · from calendar invite (Melissa)" },
];

const sampleHome: HomeItem[] = [
  { id: "h1", name: "Homeowner's insurance", system: "Policy", installed: null, lastService: dIso(-330), nextDue: dIso(35), company: "[Insurer]", openIn: { label: "Insurer site", href: "#insurer" }, addedBy: "Ryan · from receipt (Ryan's Gmail)" },
  { id: "h2", name: "Property tax", system: "Tax", installed: null, lastService: dIso(-340), nextDue: dIso(42), company: "Utah County", openIn: { label: "County tax site", href: "#county" }, addedBy: "Ryan · from Settings" },
  { id: "h3", name: "Furnace and filter", system: "HVAC", installed: "2015-09-01", lastService: dIso(-350), nextDue: dIso(15), company: "[HVAC company]", openIn: { label: "Contact", href: "/contacts" }, addedBy: "System · from service receipt (Ryan)" },
  { id: "h4", name: "Irrigation blow-out", system: "Irrigation", installed: null, lastService: dIso(-365), nextDue: dIso(8), company: "[Sprinkler company]", openIn: { label: "Irrigation controller app", href: "#irrigation" }, addedBy: "Melissa · from Ask" },
  { id: "h5", name: "Water heater", system: "Plumbing", installed: "2019-04-12", lastService: null, nextDue: dIso(180), company: "[Plumber]", openIn: { label: "Contact", href: "/contacts" }, addedBy: "Ryan · from receipt (Ryan's Gmail)" },
  { id: "h6", name: "Water softener salt", system: "Plumbing", installed: null, lastService: dIso(-40), nextDue: dIso(20), company: null, openIn: { label: "Receipt", href: "#finder-home" }, addedBy: "Ryan · from Settings" },
  { id: "h7", name: "Smoke and CO detector batteries", system: "Safety", installed: null, lastService: dIso(-200), nextDue: dIso(20), company: null, openIn: { label: "Calendar", href: "#calendar" }, addedBy: "System · from service receipt (Ryan)" },
  { id: "h8", name: "Gutter clean", system: "Exterior", installed: null, lastService: dIso(-380), nextDue: dIso(30), company: "[Gutter company]", openIn: { label: "Contact", href: "/contacts" }, addedBy: "Melissa · from Ask" },
  { id: "h9", name: "Roof", system: "Exterior", installed: "2012-06-01", lastService: dIso(-700), nextDue: dIso(400), company: null, openIn: { label: "Home folder", href: "#finder-home" }, addedBy: "Ryan · from receipt (Ryan's Gmail)" },
  { id: "h10", name: "Garage door", system: "Exterior", installed: null, lastService: dIso(-500), nextDue: dIso(230), company: null, openIn: { label: "Garage app", href: "#garage" }, addedBy: "Ryan · from Settings" },
];

const samplePlaces: Place[] = [
  { id: "p1", person: "ryan", name: "Home", meaning: "Home", indoors: true, usualActivity: "Work, family", visits: 999, addedBy: "System · learned from location (Ryan)" },
  { id: "p2", person: "ryan", name: "[Gym]", meaning: "Gym", indoors: true, usualActivity: "Workout, mornings", visits: 41, addedBy: "System · learned from location (Ryan)" },
  { id: "p3", person: "ryan", name: "[Coffee shop]", meaning: "Work spot", indoors: true, usualActivity: "Deep work", visits: 18, addedBy: "System · learned from location (Ryan)" },
  { id: "p4", person: "ryan", name: "[Costco]", meaning: "Groceries", indoors: true, usualActivity: "Shopping, weekends", visits: 12, addedBy: "System · learned from location (Ryan)" },
  { id: "p5", person: "ryan", name: "[Trailhead]", meaning: "Hike", indoors: false, usualActivity: "Hiking, Saturdays", visits: 7, addedBy: "System · learned from location (Ryan)" },
  { id: "p6", person: "melissa", name: "Home", meaning: "Home", indoors: true, usualActivity: "Family", visits: 999, addedBy: "System · learned from location (Melissa)" },
  { id: "p7", person: "melissa", name: "[School]", meaning: "School drop-off", indoors: false, usualActivity: "Drop-off and pickup", visits: 120, addedBy: "System · learned from location (Melissa)" },
  { id: "p8", person: "melissa", name: "[Soccer field]", meaning: "Practice", indoors: false, usualActivity: "Tuesdays and Thursdays", visits: 22, addedBy: "System · learned from location (Melissa)" },
];

const sampleSources: Source[] = [
  { id: "s1", group: "Calendar and schedule", name: "Google Calendar", account: "Ryan", reads: "Events feeding the schedule", lastSynced: "6:10 am", status: "ok", cadence: null, href: "#gcal-ryan", syncable: true, addedBy: "Ryan · from Settings" },
  { id: "s2", group: "Calendar and schedule", name: "Google Calendar", account: "Melissa", reads: "Events feeding the schedule", lastSynced: "6:10 am", status: "ok", cadence: null, href: "#gcal-melissa", syncable: true, addedBy: "Melissa · from Settings" },
  { id: "s3", group: "Calendar and schedule", name: "School calendar", account: "[School] (subscribed link)", reads: "Term dates, holidays", lastSynced: "yesterday", status: "ok", cadence: "School publishes weekly", href: "#school-cal", syncable: true, addedBy: "Ryan · from Settings" },
  { id: "s4", group: "Calendar and schedule", name: "Weather", account: "Orem, UT", reads: "Hourly forecast for schedule blocks", lastSynced: "6:00 am", status: "ok", cadence: null, href: "#weather", syncable: true, addedBy: "Ryan · from Settings" },
  { id: "s5", group: "Email", name: "Gmail", account: "[admin@shvr.co]", reads: "Summaries, attachments to file", lastSynced: "6:05 am", status: "ok", cadence: null, href: "#gmail-1", syncable: true, addedBy: "Ryan · from Settings" },
  { id: "s6", group: "Email", name: "Gmail", account: "[admin@medrepdesk.io]", reads: "Summaries, attachments to file", lastSynced: "6:05 am", status: "ok", cadence: null, href: "#gmail-2", syncable: true, addedBy: "Ryan · from Settings" },
  { id: "s7", group: "Email", name: "Gmail", account: "[rross15253@gmail.com]", reads: "Summaries, receipts", lastSynced: "yesterday 9:40 pm", status: "warn", cadence: null, href: "#gmail-3", syncable: true, addedBy: "Ryan · from Settings" },
  { id: "s8", group: "Email", name: "iCloud Mail", account: "[Ryan]", reads: "Summaries", lastSynced: "6:05 am", status: "ok", cadence: null, href: "#icloud-mail", syncable: true, addedBy: "Ryan · from Settings" },
  { id: "s9", group: "Email", name: "Melissa's mail", account: "[not connected]", reads: "—", lastSynced: "never", status: "warn", cadence: null, href: "/settings", syncable: false, addedBy: "Melissa · from Settings" },
  { id: "s10", group: "Money", name: "Tiller sheet", account: "Google Sheets: [Tiller]", reads: "Transactions, balances", lastSynced: "5:30 am", status: "ok", cadence: "Tiller pulls banks once a day", href: "#tiller", syncable: true, addedBy: "Ryan · from Settings" },
  { id: "s11", group: "Money", name: "Subscriptions register", account: "Google Sheets: [Subscriptions]", reads: "Recurring charges", lastSynced: "5:30 am", status: "ok", cadence: null, href: "#subs-sheet", syncable: true, addedBy: "Ryan · from Settings" },
  { id: "s12", group: "Money", name: "Amex", account: "····1004", reads: "Nothing (via Tiller)", lastSynced: "via Tiller", status: "ok", cadence: "Opens the Amex app; no deep link", href: "#amex", syncable: false, addedBy: "Ryan · from Settings" },
  { id: "s13", group: "Money", name: "Visa", account: "····[LAST4]", reads: "Nothing (via Tiller)", lastSynced: "via Tiller", status: "ok", cadence: "Opens the issuer app; no deep link", href: "#visa", syncable: false, addedBy: "Ryan · from Settings" },
  { id: "s14", group: "Money", name: "Checking (joint)", account: "[Bank] ····[LAST4]", reads: "Nothing (via Tiller)", lastSynced: "via Tiller", status: "ok", cadence: "Opens the bank site; no deep link", href: "#bank", syncable: false, addedBy: "Ryan · from Settings" },
  { id: "s15", group: "Money", name: "Statements and receipts", account: "Organized/Personal/Documents/Finance", reads: "Filed PDFs", lastSynced: "2:31 am (mirror)", status: "ok", cadence: null, href: "#finder-finance", syncable: true, addedBy: "Ryan · from Settings" },
  { id: "s16", group: "Family, home and system", name: "Messages mirror", account: "Ryan's iPhone", reads: "Thread reflection (F16)", lastSynced: "6:12 am", status: "ok", cadence: null, href: "#messages", syncable: true, addedBy: "Ryan · from Settings" },
  { id: "s17", group: "Family, home and system", name: "1Password", account: "Family vault (item names only)", reads: "Item names, never contents", lastSynced: "6:00 am", status: "ok", cadence: null, href: "#1password", syncable: true, addedBy: "Ryan · from Settings" },
  { id: "s18", group: "Family, home and system", name: "Apple Passwords", account: "Shared groups (names only)", reads: "Group names, never secrets", lastSynced: "—", status: "ok", cadence: "Opens the Passwords app", href: "#apple-passwords", syncable: false, addedBy: "Ryan · from Settings" },
  { id: "s19", group: "Family, home and system", name: "Mac mini mirror", account: "mirror-status.txt", reads: "Mirror result, free space, heartbeat", lastSynced: "2:31 am", status: "ok", cadence: "Nightly at 2:30 am", href: "/health", syncable: true, addedBy: "Ryan · from Settings" },
  { id: "s20", group: "Family, home and system", name: "Documents index", account: "Organized + 8TB", reads: "File names, locations, dates", lastSynced: "3:00 am", status: "ok", cadence: null, href: "#finder-organized", syncable: true, addedBy: "Ryan · from Settings" },
  { id: "s21", group: "Family, home and system", name: "Apple Contacts", account: "Ryan, Melissa", reads: "Names and contact routes", lastSynced: "6:00 am", status: "ok", cadence: null, href: "#contacts", syncable: true, addedBy: "Melissa · from Settings" },
];

export const EMERGENCY: EmergencySection[] = [
  { title: "People to call first", items: [{ name: "[Family member]", pointer: "Contacts", lastReviewed: dIso(-90) }, { name: "[Neighbor] (spare key)", pointer: "Contacts", lastReviewed: dIso(-90) }, { name: "[Accountant]", pointer: "Contacts", lastReviewed: dIso(-400) }] },
  { title: "Accounts and how to reach each", items: [{ name: "Accounts register", pointer: "Settings → Money set-up", lastReviewed: dIso(-60) }, { name: "Logins", pointer: "Apple Passwords shared groups", lastReviewed: dIso(-60) }] },
  { title: "The businesses", items: [{ name: "Veil Labs: what runs on its own", pointer: "Organized/Business/Veil Labs/01_Admin", lastReviewed: dIso(-200) }, { name: "SHVR, Et Al, Pixel Empire contacts", pointer: "Contacts (Work)", lastReviewed: dIso(-200) }] },
  { title: "Insurance and benefits", items: [{ name: "Policies list", pointer: "1Password: Insurance", lastReviewed: dIso(-120) }] },
  { title: "Legal documents", items: [{ name: "Will and trust", pointer: "1Password: Legal", lastReviewed: dIso(-500) }, { name: "Powers of attorney", pointer: "1Password: Legal", lastReviewed: dIso(-500) }, { name: "Medical directives", pointer: "1Password: Legal", lastReviewed: dIso(-500) }] },
  { title: "Vault recovery", items: [{ name: "1Password Emergency Kit", pointer: "[Filed location]", lastReviewed: dIso(-30) }, { name: "Apple ID recovery contact", pointer: "Settings → People and access", lastReviewed: dIso(-30) }] },
  { title: "The Mac mini, the 8TB and backups", items: [{ name: "How to get at the files", pointer: "Info → Where things live", lastReviewed: dIso(-20) }, { name: "Mirror and Time Machine", pointer: "/health", lastReviewed: dIso(-20) }] },
  { title: "The dashboard itself", items: [{ name: "Admin access and adding a person", pointer: "Settings → People and access", lastReviewed: dIso(-20) }] },
  { title: "First 72 hours checklist", items: [{ name: "Checklist", pointer: "Organized/Personal/Documents/Family/Emergency", lastReviewed: dIso(-90) }] },
];

const sampleSchedule: Record<PersonId, ScheduleBlock[]> = {
  ryan: [{ time: "7:00", title: "Gym", place: "[Gym]" }, { time: "9:00", title: "Deep work block", place: "Home" }, { time: "12:30", title: "Lunch", place: "Home" }, { time: "15:30", title: "Pickup", place: "[School]", who: "Ryan driving" }, { time: "18:00", title: "Dinner", place: "Home" }],
  melissa: [{ time: "8:00", title: "School drop-off", place: "[School]", who: "Melissa driving" }, { time: "10:00", title: "[Appointment]", place: "[Clinic]" }, { time: "16:30", title: "Soccer practice", place: "[Soccer field]", who: "Carpool family driving" }, { time: "18:00", title: "Dinner", place: "Home" }],
  child1: [{ time: "8:00", title: "School", place: "[School]" }, { time: "15:30", title: "Pickup", place: "[School]", who: "Ryan" }, { time: "16:30", title: "Soccer practice", place: "[Soccer field]", who: "Carpool" }],
  child2: [{ time: "8:00", title: "School", place: "[School]" }, { time: "15:30", title: "Pickup", place: "[School]", who: "Ryan" }, { time: "17:00", title: "Piano", place: "[Teacher's house]" }],
};
const sampleActivities: Record<PersonId, Activity[]> = {
  ryan: [{ name: "Hiking", season: "Spring to fall", checklist: ["Water", "Sun hat", "Trail shoes"], responsible: "ryan" }],
  melissa: [],
  child1: [{ name: "Soccer", season: "Aug to Nov", checklist: ["Cleats", "Shin guards", "Water bottle", "Uniform"], responsible: "melissa" }, { name: "Swim lessons", season: "Summer", checklist: ["Swimsuit", "Towel", "Goggles"], responsible: "melissa" }],
  child2: [{ name: "Piano", season: "All year", checklist: ["Lesson book", "Practice log"], responsible: "ryan" }],
};
const sampleOpenItems: Record<PersonId, OpenItem[]> = {
  ryan: [{ id: "o1", kind: "reply", title: "Insurance renewal question", due: dIso(1), who: "For Ryan · from email (Ryan's Gmail)" }, { id: "o2", kind: "decide", title: "Extend the laptop protection plan?", due: dIso(30), who: "System · from Devices register" }, { id: "o3", kind: "do", title: "Tahoe: book inspection", due: dIso(23), who: "System · from Vehicles" }],
  melissa: [{ id: "o4", kind: "do", title: "Sienna: emissions overdue, book it", due: dIso(-5), who: "System · from Vehicles" }, { id: "o5", kind: "do", title: "Sign the field-trip permission form", due: dIso(4), who: "For Melissa · from email (school office)" }],
  child1: [{ id: "o6", kind: "do", title: "Return library book", due: dIso(2), who: "Melissa asked · from Ask · 7:52" }],
  child2: [],
};

// ---- readers ----
async function table<T>(name: string, sample: T[], filter?: (q: any) => any): Promise<T[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!hasSupabaseEnv()) return sample;
  try {
    const sb = await createClient();
    let q = sb.from(name).select("*");
    if (filter) q = filter(q);
    const { data } = await q;
    return (data ?? []) as T[]; // live mode: an empty table is empty, never the sample
  } catch { return []; }
}

// The household's people. Real mode reads profiles (parents first); each gets a short id from the first name ("Ryan" -> "ryan", a second "Sam" -> "sam-2")
// so existing links and sample data keyed by name keep working, and a `uuid` for database queries. Sample mode and an empty table use the sample people.
export async function getPeople(): Promise<Person[]> {
  if (!hasSupabaseEnv()) return PEOPLE;
  try {
    const sb = await createClient();
    const [{ data }, { data: kids }] = await Promise.all([sb.from("profiles").select("id, display_name, role, created_at").order("created_at"), sb.from("children").select("id, display_name, profile_id").is("archived_at", null).order("birth_year")]);
    if (!data?.length) return PEOPLE;
    // Children with a login are already profiles; the rest (no login yet) are added after them so the whole family is listed.
    const rows = [...data.map((r) => ({ uuid: String(r.id), name: String(r.display_name ?? ""), role: String(r.role), childId: undefined as string | undefined })), ...(kids ?? []).filter((k) => !k.profile_id).map((k) => ({ uuid: undefined as string | undefined, name: String(k.display_name ?? ""), role: "child", childId: String(k.id) }))];
    const rank = (r: string) => (r === "child" ? 1 : 0);
    const used = new Map<string, number>();
    const people = rows.sort((a, b) => rank(a.role) - rank(b.role)).map((r) => {
      const name = r.name.trim() || "Member";
      const base = name.split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, "") || "member";
      const n = (used.get(base) ?? 0) + 1; used.set(base, n);
      const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
      return { id: n === 1 ? base : `${base}-${n}`, name, role: (r.role === "child" ? "child" : "parent") as Person["role"], initials, uuid: r.uuid, childId: r.childId } satisfies Person;
    });
    setRoster(people);
    return people;
  } catch { return PEOPLE; }
}
export async function getViewer(): Promise<Person> {
  const people = await getPeople();
  if (!hasSupabaseEnv()) return people[0];
  try {
    const user = await getRequestUser();
    if (!user) return people[0];
    return people.find((p) => p.uuid === user.id) ?? people[0];
  } catch { return people[0]; }
}
// Real rows are snake_case with a profile uuid as driver; the pages read the camelCase Vehicle shape.
// An empty table shows the sample (preview/demo); a table with rows never does.
export async function getVehicles(): Promise<Vehicle[]> {
  if (!hasSupabaseEnv()) return sampleVehicles;
  try {
    const sb = await createClient();
    const [{ data }, people] = await Promise.all([sb.from("vehicles").select("*").order("created_at"), getPeople()]);
    if (!data || !data.length) return sampleVehicles;
    return (data as Array<Record<string, unknown>>).map((r) => {
      const driver: PersonId = people.find((p) => p.uuid === String(r.driver ?? ""))?.id ?? people[0].id;
      return {
        id: String(r.id), name: String(r.name), short: String(r.short), year: Number(r.year ?? 0), make: String(r.make ?? ""), model: String(r.model ?? ""),
        plate: r.plate ? String(r.plate) : "not recorded", driver, driverId: (r.driver as string | null) ?? null, mileage: Number(r.mileage ?? 0), mileageKnown: r.mileage != null, mileageAt: r.mileage_at ? String(r.mileage_at) : "",
        mileageEstimated: Boolean(r.mileage_estimated),
        expiries: (r.expiries as Vehicle["expiries"]) ?? [], maintenance: (r.maintenance as Vehicle["maintenance"]) ?? [], documents: (r.documents as Vehicle["documents"]) ?? [],
        reminders: (r.reminders as Vehicle["reminders"]) ?? [], links: (r.links as Vehicle["links"]) ?? [],
        addedBy: String(r.added_by ?? ""), details: (r.details as Record<string, unknown>) ?? {}, vinPointer: (r.vin_pointer as string | null) ?? null,
      } satisfies Vehicle;
    });
  } catch { return sampleVehicles; }
}
export async function getDevices(): Promise<Device[]> {
  if (!hasSupabaseEnv()) return sampleDevices;
  const rows = await table<Record<string, unknown>>("devices", []);
  const people = await getPeople(); // real rows carry the profile uuid (null = household); the pages use the short ids
  const str = (v: unknown) => (v == null || v === "" ? null : String(v));
  return rows.map((r) => {
    const u = r.person as string | null;
    const open = r.open_in as { label?: string; href?: string } | null;
    return {
      id: String(r.id), person: (u ? people.find((p) => p.uuid === u)?.id ?? u : "household") as Device["person"], name: String(r.name), kind: String(r.kind), make: String(r.make ?? ""),
      status: r.status as Device["status"], serialLast4: str(r.serial_last4), serialPointer: str(r.serial_pointer), warrantyEnd: str(r.warranty_end), planName: str(r.plan_name), planEnd: str(r.plan_end),
      subscription: str(r.subscription), note: str(r.note), openIn: open?.label ? { label: open.label, href: open.href ?? "#" } : { label: "Receipts (Organized)", href: "#finder-devices" }, addedBy: String(r.added_by ?? ""),
    } as Device;
  }).sort((a, b) => a.name.localeCompare(b.name));
}
export async function getMedications(person?: PersonId): Promise<Medication[]> {
  const people = await getPeople();
  const uuid = person ? people.find((p) => p.id === person)?.uuid : undefined;
  const rows = await table<Medication>("medications", person ? sampleMeds.filter((m) => m.person === person) : sampleMeds, person && uuid ? (q) => q.eq("person", uuid) : undefined);
  return hasSupabaseEnv() && person ? rows.map((m) => ({ ...m, person })) : rows;
}
export const getContacts = () => table<Contact>("contacts", sampleContacts);
export const getHomeItems = () => table<HomeItem>("home_items", sampleHome);
// Real rows come back under RLS (own + shared), so no person filter is needed; `person` only narrows the sample.
// Column names are mapped here because the page reads camelCase; an empty table is empty, not the sample.
export async function getPlaces(person?: PersonId): Promise<Place[]> {
  if (!hasSupabaseEnv()) return person ? samplePlaces.filter((p) => p.person === person) : samplePlaces;
  try {
    const sb = await createClient();
    const [{ data }, people] = await Promise.all([sb.from("places").select("id, person, name, meaning, indoors, usual_activity, visits, added_by, confirmed").order("visits", { ascending: false }), getPeople()]);
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id), person: (people.find((p) => p.uuid === String(r.person ?? ""))?.id ?? person ?? people[0].id) as PersonId, name: String(r.name), meaning: String(r.meaning ?? ""), indoors: r.indoors as boolean,
      usualActivity: String(r.usual_activity ?? ""), visits: Number(r.visits ?? 0), addedBy: r.added_by === "answer" ? "You · from a question" : r.added_by === "calendar" ? "System · from Calendar" : `System · ${String(r.added_by ?? "learned")}`,
    }));
  } catch { return []; }
}
export const getSources = () => table<Source>("sources", sampleSources);
export const getSchedule = async (person: PersonId) => sampleSchedule[person] ?? [];
export const getActivities = async (person: PersonId) => sampleActivities[person] ?? [];
export const getOpenItems = async (person: PersonId) => sampleOpenItems[person] ?? [];

// ---- derived ----
export function vehicleStatus(v: Vehicle): { state: "ok" | "warn" | "error"; text: string } {
  const all = [...v.expiries.map((e) => ({ label: e.label, date: e.date })), ...v.maintenance.filter((m) => m.dueDate).map((m) => ({ label: m.item, date: m.dueDate! }))];
  const overdue = all.filter((x) => (daysUntil(x.date) ?? 1) < 0).sort((a, b) => a.date.localeCompare(b.date));
  if (overdue.length) return { state: "error", text: `${overdue[0].label} overdue` };
  const soon = all.filter((x) => (daysUntil(x.date) ?? 99) <= 30).sort((a, b) => a.date.localeCompare(b.date));
  if (soon.length) return { state: "warn", text: `${soon[0].label} ${dueText(soon[0].date)}` };
  return { state: "ok", text: "Nothing due" };
}
export function deviceDue(d: Device): { label: string; date: string } | null {
  const c = [d.planEnd && { label: `${d.planName} ends`, date: d.planEnd }, d.warrantyEnd && { label: "Warranty ends", date: d.warrantyEnd }].filter(Boolean) as { label: string; date: string }[];
  const inWindow = c.filter((x) => { const n = daysUntil(x.date)!; return n <= 30 && n >= -14; }).sort((a, b) => a.date.localeCompare(b.date));
  return d.status === "retired" ? null : inWindow[0] ?? null;
}

// F25: the person's own Apple Contacts, synced by scripts/contacts-sync.mjs.
export type ContactCard = {
  id: string; fullName: string; firstName: string | null; lastName: string | null; nickname: string | null; org: string | null;
  phones: { label: string; number: string; digits: string }[]; emails: { label: string; address: string }[];
  addresses: { label: string; street: string; city: string; state: string; zip: string }[];
  birthday: string | null; notes: string | null;
  etag: string | null; provider: "icloud" | "google"; mine: boolean; pending: boolean;   // mine = in my own address book (editable); pending = an edit is waiting for the Mac mini
};
export type ContactEditNote = { id: string; status: "conflict" | "error"; note: string; summary: string | null; at: string };
export async function getContactEditNotes(): Promise<ContactEditNote[]> {
  if (!hasSupabaseEnv()) return [];
  try {
    const sb = await createClient();
    const since = new Date(Date.now() - 3 * 864e5).toISOString();
    const { data } = await sb.from("contact_edits").select("id,status,note,summary,created_at").in("status", ["conflict", "error"]).gte("created_at", since).order("created_at", { ascending: false }).limit(5);
    return (data ?? []).map((r) => ({ id: r.id, status: r.status, note: r.note ?? "", summary: r.summary, at: r.created_at }));
  } catch { return []; }
}
export async function getPendingNewContacts(): Promise<string[]> {
  if (!hasSupabaseEnv()) return [];
  try {
    const sb = await createClient();
    const { data } = await sb.from("contact_edits").select("summary").eq("status", "pending").eq("op", "create").order("created_at");
    return (data ?? []).map((r) => String(r.summary ?? "new contact").replace(/^new contact /, ""));
  } catch { return []; }
}
export async function getContactCards(): Promise<ContactCard[]> {
  if (!hasSupabaseEnv()) return [];
  try {
    const sb = await createClient();
    const out: ContactCard[] = [];
    const { data: { user } } = await sb.auth.getUser();
    const { data: waiting } = await sb.from("contact_edits").select("card_id").eq("status", "pending");
    const pend = new Set((waiting ?? []).map((w) => w.card_id));
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from("contact_cards").select("id,person,etag,provider,full_name,first_name,last_name,nickname,org,phones,emails,addresses,birthday,notes").is("deleted_at", null).order("last_name", { nullsFirst: false }).range(from, from + 999);
      if (error || !data) break;
      for (const r of data) out.push({ id: r.id, fullName: r.full_name, firstName: r.first_name, lastName: r.last_name, nickname: r.nickname, org: r.org, phones: r.phones ?? [], emails: r.emails ?? [], addresses: r.addresses ?? [], birthday: r.birthday, notes: r.notes, etag: r.etag, provider: r.provider === "google" ? "google" : "icloud", mine: !!user && r.person === user.id, pending: pend.has(r.id) });
      if (data.length < 1000) break;
    }
    return out;
  } catch { return []; }
}
