// The approved master folder tree (decision D33) and the rules that place each bookmark in it. Pure functions, no browser or network access.
// classify(bookmark) -> { target, confidence: 'high'|'medium'|'low', reason }.  Anything the rules cannot place goes to Inbox (low), never guessed.
const S = " › ";
const F = "Ventures" + S + "Fairpoint" + S + "Construction" + S, L = "Ventures" + S + "Little Miss Lorynn" + S, LO = "Ventures" + S + "Love and Ocean" + S;
const MR = "Ventures" + S + "MedRepDesk" + S, VL = "Ventures" + S + "Veil Labs" + S, HF = "Home & Family" + S, LE = "Learn" + S, TL = "Tools" + S, AR = "Archive" + S, MO = "Money" + S;
export const TREE = [
  "Pinned", "Inbox",
  ...["Materials & Suppliers", "Architects & Designers", "Solar & Energy", "Pools & Outdoor", "Permits & Agencies", "Subcontractors", "Business Ops", "Legal & Finance", "Inspiration & Costs"].map((x) => F + x),
  "Ventures" + S + "Fairpoint" + S + "Development", "Ventures" + S + "Fairpoint" + S + "Management",
  L + "Sourcing" + S + "Alibaba", L + "Sourcing" + S + "Wholesale clothing", L + "Sourcing" + S + "Fabric", L + "Packaging & Printing", L + "Direct Sales & MLM", L + "Marketing & Social", L + "Legal & Trademark", L + "Patterns & Sewing", L + "Reference",
  LO + "Sourcing", LO + "Printing", LO + "Reference",
  MR + "Daily", MR + "Weekly", MR + "As Needed", MR + "Reference",
  VL + "AI APIs", VL + "Local dashboards", "Ventures" + S + "SHVR", "Ventures" + S + "StewardOS",
  MO + "Banking & Cards", MO + "Crypto & Markets",
  ...["Health & Fitness", "Hobbies", "Shopping", "Faith & Community", "Music", "Preparedness & Outdoors", "Travel", "Auto", "Home & Property"].map((x) => HF + x),
  ...["News", "Reference", "Tutorials", "Business Know-how"].map((x) => LE + x),
  ...["AI & APIs", "Dev & Hosting", "Business Software", "Web & Ecommerce", "Design Assets"].map((x) => TL + x),
  AR + "For review", AR + "Dead links", AR + "Browser defaults",
];
const TREE_SET = new Set(TREE);

const R = (re) => new RegExp(re, "i");
// Domain-or-title keyword rules, tried in order inside a group. First hit wins.
const STRAY = [
  [AR + "For review", R("isohunt|aMule|cracked")],
  [TL + "Design Assets", R("iconarchive|iconfinder|bgpatterns|patterncooler|audiojungle|artlist")],
  [LE + "Tutorials", R("osxdaily|imafish|ehow")],
  [HF + "Shopping", R("doublehelixcables|nycartridgeoutlet|gainsaver|crucial|monoprice|corsair|vengeance|jomashop")],
  [AR + "For review", R("softonic|sourceforge|iusethis|panic\\.com|candybar")],
  [TL + "Web & Ecommerce", R("mudcu|speckyboy|cmscritic|tipsandtricks|blockergroup|kernbranding|adbeat|mpix")],
  [TL + "Business Software", R("dropbox|mailchimp")],
  [HF + "Health & Fitness", R("barbrothers|simplyshredded|calisthenics")],
  [AR + "For review", R("careerbuilder|monster\\.com|timetohire|fameswap|chrismccombs|msn\\.com|harborhousecafe|sushiplantation|table-q|walmart|uncrate")],
];
const CONSTRUCTION = [
  [F + "Business Ops", R("fairpointconstruction|staples|bizchair|officechairs|drafting stool|inmodehome|binder|pendaflex|zebra")],
  [F + "Subcontractors", R("storypole|story pole|mapping|radius|survey|\\bpods\\b|upack|moving|excavat|designescrow")],
  [F + "Inspiration & Costs", R("photograph|video services|whitespacestudios|brianthomasjones|quazmo")],
  [F + "Permits & Agencies", R("\\.gov|cityof|county|socalgas|permit|title24|adapacific|energy\\.ca|ipermit|assessor|\\.ca\\.gov")],
  [F + "Solar & Energy", R("solar|inverter|photovoltaic|sma-america|ekotrope|microgeneration|perlight|prosolar|mysolarbackup|wholesalesolar|findthebest|ncalculators|howstuffworks|northerntool")],
  [F + "Pools & Outdoor", R("pool|waterscape|water ?garden|pond|paver|belgard|hardscape|rockscape|patio|rustic ?stone|urbanlandscape|richardlusk|boydjohnson|acochran|lightfaktor|grassy|resedapottery|igastone")],
  [F + "Business Ops", R("quickbooks|crm|salesforce|insight\\.ly|highrise|isqft|buildtools|myerp|reallysimple|swizznet|mangosoft|novelaspect|bidding|myrealdata|reedconstructiondata|nationalbuilderscontrol|bdiinc|greenhalo|jobsitevisions|b4ubuild|propay|wepay|mailboxes|dymo")],
  [F + "Legal & Finance", R("ciclaw|glfsite|lafcu|credit ?union|royalbusiness|mortgage|constructionloan|lawinfo|clarktrev|ppmfast|\\battorney|\\blaw\\b|llc|primebuyers")],
  [F + "Inspiration & Costs", R("houzz|hgtv|freshome|pantone|design-seeds|homewyse|jlconline|decorpad|olioboard|luxesource|invesp|rankedcontractors|homeadvisor|stumbleupon|pearltrees|fredmarion|homeportfolio")],
  [F + "Architects & Designers", R("architect|interior|landscape architecture|design ?(inc|group|studio)|designs?\\b.*(los angeles|laguna)|studio|abramson|belzberg|dahl|vandevelde|horst|jvca|lcra|sinclair|tekstra|tgarch|thorpe|watsonarchitect|williamhefner|dejager|landry|mueller|marisamiller|marlasher|joanbehnke|jenniferbevan|saraingrassia|tommychambers|timbarber|penelopefrancis|andrade|alysedwards|irannarges|isadora|brown design|muellerdesign|residentialrendering|dimensionicad|cadinstitute")],
  [F + "Subcontractors", R("removal|abatement|asbestos|mold|polishing|gutter|garage ?door|framing|carpentry|plumbing|electric|engineering|surveying|waterproof|construction\\b.*(masonry|concrete)|davepycz|fresh ?air|alliance-enviro|teecor|socalengineering|callandeng|smith-bros|larrabure|wcgarage|coastalca|jobsite")],
];
const LML = [
  [L + "Direct Sales & MLM", R("lularoe|network marketing|recruiting superstar|party girl|selling it softly|rep_agree|sales rep agreement|mlmconsultant|mlm law|compensation pay plan")],
  [L + "Patterns & Sewing", R("pattern|sewing|tutorial.*(skirt|dress)|(skirt|dress).*tutorial|maxi|lady skater|craftymom|asmallsnippet|deliacreates|simplicity|kitschy|winthrop|dress\\??\\b")],
  [AR + "For review", R("blackhat|instaget|instaliker|boostlikes|boostagram|followliker|autobot|ghosttweeting|instabrand|softigniter|socialkaty|fameswap|matrixproject|alien seo|tiered link|instagram (bot|mega)|bot\\b")],
  [L + "Sourcing" + S + "Alibaba", R("alibaba")],
  [L + "Sourcing" + S + "Fabric", R("fabric|textile|prints?\\b|minky|ezfabric|myfabric|shavali|bluemoon|mytextile")],
  [L + "Sourcing" + S + "Wholesale clothing", R("dhgate|leggings|wholesale|fashion|clothing|skirt|boutique|apparel|garment|tie ?factory|neck tie|rosewholesale|orangeshine|trendystyle|plussize|lwjewelry|offprice|mio")],
  [L + "Packaging & Printing", R("\\bbag\\b|bags|packag|plastic|uline|grainger|ppisupply|royalbag|greatampack|boxes|finn|dirtcheap|jakprints|vistaprint|hydro|liquidprint|prostreetgraphix|hgarts|acorn-paper|shooting tents")],
  [L + "Direct Sales & MLM", R("mlm|party ?plan|direct ?sell|direct sales|dsa\\.org|dswa|stelladot|stella|launchsmart|quarles|thompsonburton|twoguys|findpartyplan|independed|honeyandlace")],
  [L + "Legal & Trademark", R("uspto|trademark|onecle|biztree|wsj|agreement")],
  [TL + "Web & Ecommerce", R("shopify|wordpress|diythemes|themeforest|wpresponsive|netstores|webshopmanager|61extensions|fishbowl|salesbinder|shippingeasy|trueship|sendfromchina|etoec|ddilogistics|jumptech|woocommerce|trustwave|friendbuy|osiaffiliate|moowebdesign|isadora|en\\.gg|freewebsitereport")],
  [TL + "Design Assets", R("vectorstock|depositphotos|graphicriver|istock|dafont|fontspace|clipart|patterncooler|mudcu|mycutegraphics|incompetech|iconarchive|bgpatterns|bannercreator|1stwebdesigner|animoto|goanimate|powtoon|tilemachine|pearltrees|dymo")],
  [L + "Marketing & Social", R("seo|moz\\.com|crazyegg|social|affiliate|blog|outbrain|viperchill|alexa|elance|fiverr|iwriter|wishpond|sproutsocial|tintup|top-hashtags|mommy|hashtag|resultfirst|maxinbound|paypersale|heartifb|odigger|fashiontraffic|neverblue|alirittenhouse|abetterlemonade|matthewwoodward|smashing")],
];
const LOVE = [
  [LO + "Printing", R("print|screen|ssactivewear|activewear|embroid|deluxe")],
  [LO + "Sourcing", R("jewel|fabric|wholesale|mimi|initials|type\\.is|alibaba|bead|charm|supply|trim")],
  [HF + "Faith & Community", R("lds\\.org|ldssplash|deseret|scouting")],
];

// Whole existing folders that map directly. Matched against "Browser/Profile › Folder" prefixes, most specific first.
const FOLDER_MAP = [
  [/^Chrome\/[^›]+› Bookmarks Bar › MedRepDesk — Daily/i, MR + "Daily"], [/^Chrome\/[^›]+› Bookmarks Bar › MedRepDesk — Weekly/i, MR + "Weekly"], [/^Chrome\/[^›]+› Bookmarks Bar › MedRepDesk — As Needed/i, MR + "As Needed"],
  [/^Safari\/[^›]+› Veil Labs › MedRepDesk/i, MR + "Reference"],
  [/^Firefox\/[^›]+› Bookmarks Menu › Mozilla Firefox/i, AR + "Browser defaults"],
  [/^Safari\/[^›]+› Personal › (Exercise & Fitness|Diet & Health)/i, HF + "Health & Fitness"], [/^Safari\/[^›]+› Favorites › Exercise & Fitness/i, HF + "Health & Fitness"],
  [/^Safari\/[^›]+› Personal › Hobbies/i, HF + "Hobbies"], [/^Safari\/[^›]+› Personal › Music/i, HF + "Music"], [/^Safari\/[^›]+› Personal › Religious/i, HF + "Faith & Community"],
  [/^Safari\/[^›]+› Personal › (Survival|Camping & Hiking|Organizational|Patriotic)/i, HF + "Preparedness & Outdoors"], [/^Safari\/[^›]+› Personal › Auto/i, HF + "Auto"],
  [/^Safari\/[^›]+› (Personal › (Shopping|China Shopping)|Favorites › Shopping)/i, HF + "Shopping"], [/^Safari\/[^›]+› Favorites › Travel/i, HF + "Travel"],
  [/^Safari\/[^›]+› Favorites › Banking/i, MO + "Banking & Cards"], [/^Safari\/[^›]+› (Favorites › Crypto|Personal › Financial)/i, MO + "Crypto & Markets"],
  [/^Safari\/[^›]+› (Favorites|Personal) › News/i, LE + "News"],
  [/^Safari\/[^›]+› Business › Fairpoint Development/i, "Ventures" + S + "Fairpoint" + S + "Development"], [/^Safari\/[^›]+› Business › Fairpoint Management/i, "Ventures" + S + "Fairpoint" + S + "Management"],
  [/^Safari\/[^›]+› Broadbeach Malibu Cold Calls/i, F + "Subcontractors"],
];
// General rules for loose items (Link Dump, unfiled, Favorites root, Personal root, Chrome/Firefox leftovers).
const LOOSE = [
  [AR + "For review", R("buypsychedelic|instaautomator|blackhatworld")],
  [MO + "Crypto & Markets", R("bitcoin|crypto|coingecko|ripple|defi|yield farming|avax|mstr|strategy\\.com|short ?interest|viewbase|poap|theblockcrypto|libertyblitz|stock")],
  [HF + "Health & Fitness", R("hemocue|mitozen|fatcalc|dickssporting|fitness|workout|calorie|vitamin")],
  [HF + "Travel", R("tripadvisor|expedia|airbnb|orbitz|jetblue|hotel")],
  [HF + "Music", R("music|choir|anthem|clarkelane")],
  [HF + "Home & Property", R("airfilters|repairclinic|searspartsdirect|thepartsbiz|corecentric|repairsuniverse|appliance")],
  [HF + "Shopping", R("touchofmodern|taylorstitch|kustomfootwear|craigslist|kanex|dcables|ebay|amazon\\.com")],
  [LE + "Business Know-how", R("inc\\.com|entrepreneur|businessinsider|altucher|internetretailer|about\\.com|bigthink|forbes|thecoolhunter")],
  [LE + "News", R("petersantilli|disclose\\.tv|theblaze|squidoo|breitbart|drudge|foxnews")],
  [LE + "Tutorials", R("w3schools|maclife|tuaw|osxdaily|terminal 101")],
  [TL + "Design Assets", R("fontsquirrel|lightroom|preset|totally ?rad|fadedandblurred|vsco|replichrome|photographyconcentrate|coolhunter")],
  [TL + "AI & APIs", R("vidyo\\.ai|opus\\.pro|reworkd|agentgpt")],
  [TL + "Web & Ecommerce", R("hypefury|viralfindr|pickfu|refersion|squarespace|uxthemes|flipsnack|shophunter|queue-it")],
  [TL + "Business Software", R("whispersystems|silentcircle|spideroak|ontraport|neutroninteractive|wetransfer|trello|flourish|idstc|powtoon")],
  ["Pinned", R("apple\\.com|icloud|bing\\.com")],
  [F + "Subcontractors", R("excavat|knockonwood|radiusmaps|manta\\.com")],
];
// Checked before folder maps: items that sit in the wrong old folder.
const OVERRIDE = [
  [HF + "Shopping", R("jomashop")],
  [LE + "Business Know-how", R("basicbizsolutions|forbes\\.com")],
  [F + "Business Ops", R("facebook.*fairpoint|pinterest.*fairpoint|fairpoint.*(facebook|pinterest|instagram)")],
  [HF + "Home & Property", R("paccoastplumbing")],
];
const MEDREP_SITES = /(^|\.)(notion|supabase|vercel|github|stripe|brand24|beehiiv|buffer|sentry|betterstack|resend)\./i;

export function classify(b) {
  const where = `${b.browser}/${b.profile} › ${b.folder || ""}`;
  const text = `${b.site} ${b.host} ${b.title}`;
  const hit = (list) => { for (const [t, re] of list) if (re.test(text)) return t; return null; };
  const done = (target, confidence, reason) => { if (!TREE_SET.has(target)) throw new Error(`target not in tree: ${target}`); return { target, confidence, reason }; };

  const ov = hit(OVERRIDE); if (ov) return done(ov, "medium", "moved out of an old folder it did not belong in");
  for (const [re, target] of FOLDER_MAP) if (re.test(where)) return done(target, "high", "its current folder maps directly");
  if (/localhost|127\.0\.0\.1/.test(b.host)) return done(VL + "Local dashboards", "high", "a link to a service on this Mac");
  if (/^Chrome\/shvr\.co › Other Bookmarks/i.test(where) || /^Chrome\/medrepdesk\.io/i.test(where)) { if (MEDREP_SITES.test(b.host + ".") || /medrepdesk|drive/i.test(text)) return done(MR + "Reference", "medium", "MedRepDesk tool already in the Daily/Weekly set (same site)"); return done(TL + "AI & APIs", "medium", "work-profile tool"); }
  if (/^Safari\/[^›]+› Veil Labs$/i.test(where)) return done(VL + "AI APIs", "high", "Veil Labs tool");
  if (/moonshot|continuas|promptcowboy|fal\.ai|firecrawl|exa\.ai|inngest|anthropic|claude\.com|openai/i.test(b.host)) return done(/inngest|firecrawl|exa\.ai|fal\.ai/i.test(b.host) ? VL + "AI APIs" : TL + "AI & APIs", "medium", "AI service");
  if (/hetzner|linqapp/i.test(b.host)) return done(TL + "Dev & Hosting", "medium", "hosting or API service");
  if (/medrepdesk\.io|medreps\.com/.test(b.host)) return done(MR + "Reference", "medium", "MedRepDesk");

  const inFolder = (re) => re.test(where);
  if (inFolder(/Business › Fairpoint Contstruction|Favorites › Fairpoint/i)) { const t = hit([...STRAY, ...CONSTRUCTION]); return t ? done(t, "medium", "matched on site/title keywords") : done(F + "Materials & Suppliers", "low", "default for this folder; no keyword matched"); }
  if (inFolder(/Business › Little Miss Lorynn/i)) { const t = hit(LML); return t ? done(t, "medium", "matched on site/title keywords") : done(L + "Reference", "low", "in the Little Miss Lorynn folder; no rule matched"); }
  if (inFolder(/Love and Ocean/i)) { const t = hit(LOVE); return t ? done(t, "medium", "matched on site/title keywords") : done(LO + "Reference", "low", "in the Love and Ocean folder; no rule matched"); }

  // Loose items (Link Dump, no folder, Favorites root, untitled, Personal root, Chrome other, etc.): try every group, venture folders first.
  const t = hit([...LOOSE, ...LML, ...LOVE, ...CONSTRUCTION.filter(([x]) => x !== F + "Materials & Suppliers")]);
  if (t) return done(t, "low", "loose item placed by keywords; please confirm");
  if (/youtube\.com|vimeo\.com/.test(b.host)) return done("Inbox", "low", "video: needs a human to say which topic");
  if (/facebook|instagram|pinterest|twitter|linkedin|google\.com|yahoo|wikipedia|flickr|weather|rottentomatoes|disney|ebay|craigslist|yelp/.test(b.host) && /Favorites/.test(where)) return done(LE + "Reference", "medium", "general web link from Favorites; you may want some Pinned");
  return done("Inbox", "low", "no rule matched");
}

export function buildPlan(bookmarks) {
  const rows = bookmarks.map((b) => ({ b, ...classify(b) }));
  const byTarget = new Map(); for (const r of rows) byTarget.set(r.target, (byTarget.get(r.target) || 0) + 1);
  const conf = { high: 0, medium: 0, low: 0 }; for (const r of rows) conf[r.confidence]++;
  return { rows, byTarget, conf };
}
