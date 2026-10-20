// One list drives the vehicle form AND the details card, so a field added here appears in both.
// Rule: pointers, not secrets. No VIN, policy number, loan number, or garage code is ever stored;
// those live in 1Password and the form asks only for the item's name.
export type VField = { key: string; label: string; type?: "text" | "date" | "number" | "select" | "textarea" | "tel"; hint?: string; options?: string[]; placeholder?: string };
export type VSection = { id: string; title: string; blurb?: string; fields: VField[] };

export const VEHICLE_SECTIONS: VSection[] = [
  { id: "identity", title: "The vehicle", fields: [
    { key: "nickname", label: "Nickname", placeholder: "e.g. the family truck" },
    { key: "trim", label: "Trim / package", placeholder: "LT, Limited, XLE…" },
    { key: "color", label: "Color" },
    { key: "plateState", label: "Plate state", placeholder: "UT" },
    { key: "bodyStyle", label: "Body style", type: "select", options: ["SUV", "Minivan", "Sedan", "Truck", "Coupe", "Wagon", "Van", "Motorcycle", "E-bike", "Trailer", "Other"] },
    { key: "fuelType", label: "Fuel", type: "select", options: ["Gasoline", "Diesel", "Hybrid", "Plug-in hybrid", "Electric", "Other"] },
    { key: "fuelGrade", label: "Fuel grade", hint: "e.g. regular 87, premium 91" },
    { key: "engine", label: "Engine / drivetrain", placeholder: "5.3L V8, 4WD" },
    { key: "seats", label: "Seats", type: "number" },
    { key: "towCapacity", label: "Towing capacity (lb)", type: "number" },
    { key: "annualMiles", label: "Miles per year (typical)", type: "number" },
    { key: "parking", label: "Where it is usually parked", placeholder: "Garage, driveway" },
  ] },
  { id: "buying", title: "Purchase and ownership", fields: [
    { key: "purchaseDate", label: "Purchase date", type: "date" },
    { key: "purchasedFrom", label: "Bought from", placeholder: "Dealer or seller" },
    { key: "newOrUsed", label: "New or used", type: "select", options: ["New", "Used", "Certified pre-owned"] },
    { key: "purchasePrice", label: "Price paid ($)", type: "number" },
    { key: "odoAtPurchase", label: "Mileage at purchase", type: "number" },
    { key: "titleHolders", label: "Names on the title" },
    { key: "titleLocation", label: "Where the title is kept", placeholder: "Safe, 1Password item, lender holds it" },
    { key: "lienholder", label: "Lender (if financed)" },
    { key: "loanPointer", label: "Loan account: 1Password item name", hint: "The item's name only, never the number." },
  ] },
  { id: "dates", title: "Renewals and inspections", blurb: "These feed the due-soon reminders on this page and the calendar.", fields: [
    { key: "regExpiry", label: "Registration expires", type: "date" },
    { key: "inspectionExpiry", label: "Safety inspection due", type: "date" },
    { key: "emissionsExpiry", label: "Emissions test due", type: "date" },
    { key: "insuranceRenewal", label: "Insurance renews", type: "date" },
    { key: "lastRecallCheck", label: "Last recall check", type: "date" },
  ] },
  { id: "insurance", title: "Insurance", fields: [
    { key: "insurer", label: "Insurance company" },
    { key: "policyPointer", label: "Policy: 1Password item name", hint: "The item's name only, never the policy number." },
    { key: "agentName", label: "Agent" },
    { key: "agentPhone", label: "Agent phone", type: "tel" },
    { key: "claimsPhone", label: "Claims phone", type: "tel" },
    { key: "deductibleCollision", label: "Collision deductible ($)", type: "number" },
    { key: "deductibleComp", label: "Comprehensive deductible ($)", type: "number" },
    { key: "coverageNotes", label: "Coverage notes", type: "textarea", placeholder: "Rental reimbursement, glass, roadside included…" },
  ] },
  { id: "roadside", title: "Roadside help", fields: [
    { key: "roadsideProvider", label: "Provider", placeholder: "AAA, insurer, manufacturer" },
    { key: "roadsideLevel", label: "Plan level", placeholder: "Basic, Plus, Premier" },
    { key: "roadsidePointer", label: "Membership: 1Password item name", hint: "The item's name only." },
    { key: "roadsidePhone", label: "Roadside phone", type: "tel" },
    { key: "roadsideNotes", label: "What it covers", type: "textarea", placeholder: "Tow miles, battery service, lockout, reimbursement rules" },
  ] },
  { id: "parts", title: "Parts and specs", blurb: "So anyone can buy the right thing without looking it up.", fields: [
    { key: "oilType", label: "Oil", placeholder: "5W-30 full synthetic" },
    { key: "oilCapacity", label: "Oil capacity (qt)" },
    { key: "oilFilter", label: "Oil filter part number" },
    { key: "airFilter", label: "Air filter part number" },
    { key: "cabinFilter", label: "Cabin filter part number" },
    { key: "batteryType", label: "Battery group size / type", placeholder: "Group 78, AGM" },
    { key: "tireSize", label: "Tire size", placeholder: "275/55R20" },
    { key: "tirePressure", label: "Tire pressure (psi)", placeholder: "Front 35, rear 35" },
    { key: "wipers", label: "Wiper sizes", placeholder: "Driver 22, passenger 20, rear 12" },
    { key: "keys", label: "Keys / fobs", placeholder: "2 fobs, 1 valet key; where the spares are" },
    { key: "spareTire", label: "Spare tire and jack location" },
    { key: "lugTorque", label: "Lug nut torque (ft-lb)" },
  ] },
  { id: "shop", title: "Who works on it", fields: [
    { key: "shopName", label: "Usual shop" },
    { key: "shopPhone", label: "Shop phone", type: "tel" },
    { key: "shopAddress", label: "Shop address" },
    { key: "dealerName", label: "Dealer (warranty work)" },
    { key: "dealerPhone", label: "Dealer phone", type: "tel" },
  ] },
  { id: "notes", title: "Anything else", fields: [
    { key: "otherDrivers", label: "Other regular drivers" },
    { key: "notes", label: "Notes", type: "textarea", placeholder: "Quirks, known issues, aftermarket changes" },
  ] },
];

// Repeatable lists. Warranties are what the receipt filing links to; the service log is what it appends to.
export type Warranty = { item: string; provider: string; start: string; end: string; miles: string; terms: string; proof: string };
export type ServiceEntry = { date: string; miles: string; what: string; shop: string; cost: string; proof: string };
export const EMPTY_WARRANTY: Warranty = { item: "", provider: "", start: "", end: "", miles: "", terms: "", proof: "" };
export const EMPTY_SERVICE: ServiceEntry = { date: "", miles: "", what: "", shop: "", cost: "", proof: "" };

// Dates that become reminders (Vehicle.expiries) when saved.
export const EXPIRY_KEYS: { key: string; label: string; kind: "registration" | "insurance" | "inspection" | "emissions"; action: string; source: string }[] = [
  { key: "regExpiry", label: "Registration", kind: "registration", action: "Renew", source: "Utah DMV" },
  { key: "inspectionExpiry", label: "Safety inspection", kind: "inspection", action: "Book it", source: "Shop booking" },
  { key: "emissionsExpiry", label: "Emissions test", kind: "emissions", action: "Book it", source: "Shop booking" },
  { key: "insuranceRenewal", label: "Insurance renewal", kind: "insurance", action: "Review", source: "Insurer" },
];
