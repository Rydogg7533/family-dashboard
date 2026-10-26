// The household's spending categories. ONE list, maintainer-owned (D82 applied to schema): the receipt reader's
// prompt, line rules, the budget, the receipt page and Ask all read it from here, so the model and a person
// categorise from the same text. Users request a category; they never add one. Ids are stable; labels may change.
//
// Every entry carries its BOUNDARY, not just its name -- what it is not, and where the line with its neighbour
// falls -- because that is what people and models actually need. "Other" is the escape valve and is reviewed
// weekly: what lands there is how a missing category is discovered. About twenty, one level; sub-categories are
// where drift lives. Decisions log 2026-10-26h, D100a.
//
// Category is one axis. Entity (personal / which business), person and tax flag are separate columns and never
// folded in here: there is no "business meals", only dining plus entity.

export type Category = { id: string; label: string; means: string; not: string; examples: string[] };

export const CATEGORIES: readonly Category[] = [
  { id: "groceries", label: "Groceries", means: "Food and drink bought to eat at home.", not: "Restaurant or delivered meals (Dining). Paper, cleaning, toiletries (Household supplies, Personal care).", examples: ["weekly shop at Smith's", "Costco produce and meat", "coffee beans"] },
  { id: "dining", label: "Dining", means: "Food and drink eaten out or delivered.", not: "Groceries, even from the same store.", examples: ["a restaurant meal", "DoorDash", "a coffee shop"] },
  { id: "household_supplies", label: "Household supplies", means: "Consumables that keep the house running and are not food.", not: "Repairs and materials for the building (Home & repairs). Furniture or appliances.", examples: ["paper towels", "detergent", "trash bags", "light bulbs"] },
  { id: "home_repairs", label: "Home & repairs", means: "Work and materials on the house itself and what is attached to it.", not: "Furniture and appliances. Consumable supplies. HOA and utilities (Utilities & services).", examples: ["a plumber", "roof repair", "paint and lumber", "HVAC service", "landscaping"] },
  { id: "furniture_appliances", label: "Furniture & appliances", means: "Things that furnish the house, and major appliances.", not: "Computers, phones, TVs (Electronics). Repairs to the building.", examples: ["a couch", "a mattress", "a refrigerator", "a washer", "a lawn mower"] },
  { id: "electronics", label: "Electronics", means: "Computers, phones, TVs, cameras, and their accessories.", not: "Kitchen and laundry appliances (Furniture & appliances). Streaming and apps (Entertainment & subscriptions).", examples: ["an iPhone", "a laptop", "a TV", "cables", "a printer"] },
  { id: "clothing", label: "Clothing", means: "Clothes, shoes and accessories for anyone in the household.", not: "Sports equipment (Entertainment & subscriptions). School uniforms still count here.", examples: ["shoes", "a jacket", "kids' clothes"] },
  { id: "health_pharmacy", label: "Health & pharmacy", means: "Medical, dental and vision care, prescriptions, and over-the-counter medicine.", not: "Toiletries and grooming (Personal care). Insurance premiums (Insurance). A gym (Entertainment & subscriptions).", examples: ["a copay", "a prescription", "contact lenses", "vitamins"] },
  { id: "personal_care", label: "Personal care", means: "Grooming, toiletries, hair and cosmetics.", not: "Medicine or anything prescribed (Health & pharmacy).", examples: ["a haircut", "shampoo", "razors", "cosmetics"] },
  { id: "kids_school", label: "Kids & school", means: "Costs that exist because of the children: school, activities, childcare, supplies.", not: "Their clothes (Clothing) or their food (Groceries, Dining).", examples: ["tuition", "a field trip", "soccer registration", "a babysitter", "school supplies"] },
  { id: "pets", label: "Pets", means: "Everything for an animal.", not: "", examples: ["pet food", "the vet", "grooming", "boarding"] },
  { id: "vehicle", label: "Vehicle", means: "Owning and keeping a vehicle, including registration.", not: "Fuel (Fuel). Parking, tolls, rides (Transport). The premium (Insurance).", examples: ["an oil change", "tires", "registration renewal", "a car wash", "a repair"] },
  { id: "fuel", label: "Fuel", means: "Gas, diesel or charging for your own vehicles.", not: "Anything else bought at the gas station (Groceries, Dining).", examples: ["Chevron", "Costco gas", "a Supercharger"] },
  { id: "transport", label: "Transport", means: "Getting around without your own vehicle, and the costs of parking it.", not: "Fuel. Flights and hotels (Travel).", examples: ["parking", "tolls", "an Uber", "transit", "airport parking"] },
  { id: "travel", label: "Travel", means: "Trips away from home: flights, lodging, rental cars, trip fees.", not: "Local transport. Meals while travelling are still Dining.", examples: ["flights", "a hotel", "an Airbnb", "a rental car"] },
  { id: "entertainment_subscriptions", label: "Entertainment & subscriptions", means: "Fun, hobbies, media, and recurring services that are not utilities.", not: "Internet and phone plans (Utilities & services). Devices (Electronics). Hosting, developer tools and work software (Software & services).", examples: ["Netflix", "Spotify", "a concert", "video games", "a gym membership", "books"] },
  { id: "gifts_giving", label: "Gifts & giving", means: "Gifts to other people, and charitable or religious giving.", not: "", examples: ["a birthday present", "tithing", "a donation"] },
  { id: "insurance", label: "Insurance", means: "Premiums of any kind.", not: "A claim payout or deductible, which follows the thing it was for (Vehicle, Home & repairs, Health & pharmacy).", examples: ["home insurance", "auto insurance", "life insurance", "a health premium"] },
  { id: "utilities_services", label: "Utilities & services", means: "The house's recurring services.", not: "Streaming and apps (Entertainment & subscriptions).", examples: ["power", "gas", "water", "trash", "internet", "a mobile phone plan", "HOA dues"] },
  { id: "software_services", label: "Software & services", means: "Hosting, cloud, developer tools, domains, and software used for work or projects.", not: "Media and fun subscriptions (Entertainment & subscriptions). Internet and phone (Utilities & services).", examples: ["Render", "Supabase", "Vercel", "GitHub", "a domain renewal", "Google Workspace", "an API bill"] },
  { id: "fees_interest", label: "Fees & interest", means: "Charges from banks and cards for having or using money.", not: "", examples: ["an annual card fee", "interest", "an ATM fee", "a late fee", "an overdraft"] },
  { id: "taxes_government", label: "Taxes & government", means: "Taxes and government charges.", not: "Vehicle registration (Vehicle).", examples: ["property tax", "an income tax payment", "a passport", "a permit"] },
  { id: "other", label: "Other", means: "Nothing above fits. Reviewed weekly; a category that keeps landing here gets proposed.", not: "", examples: [] },
];

// A receipt that holds clearly different kinds of purchase. A receipt-level state, not a line category.
export const MIXED = "mixed";

export const CATEGORY_IDS: readonly string[] = CATEGORIES.map((c) => c.id);
export const byId = (id: string): Category | undefined => CATEGORIES.find((c) => c.id === id);

// The reader's first list (capture-read-v5 and earlier), mapped onto this one so stored lines keep working.
const LEGACY: Record<string, string> = {
  grocery_food: "groceries", appliance_electronics: "electronics", home: "home_repairs", health: "health_pharmacy",
  vehicle: "vehicle", dining: "dining", fuel: "fuel", other: "other",
};

// Any category string, from any version of the reader or a person, to a current id. Unknown becomes "other".
export function normalizeCategory(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (s === MIXED) return MIXED;
  if (CATEGORY_IDS.includes(s)) return s;
  return LEGACY[s] ?? "other";
}

// The definitions as the reader prompt carries them: the same text a person sees, verbatim.
export function categoryPromptBlock(): string {
  const lines = CATEGORIES.map((c) => `  "${c.id}": ${c.means}${c.not ? ` Not: ${c.not}` : ""}${c.examples.length ? ` e.g. ${c.examples.join(", ")}.` : ""}`);
  return `category: exactly one of these ids, chosen by the definition (the examples are illustrations, not a list to match):\n${lines.join("\n")}\n  "${MIXED}": the receipt holds clearly different kinds of purchase (for example groceries and tires); then give the lines.`;
}
