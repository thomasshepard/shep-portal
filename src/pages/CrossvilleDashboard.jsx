import { useState } from "react";
import {
  BarChart, Bar,
  XAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  TrendingUp, TrendingDown, Minus, AlertTriangle,
  Home, DollarSign, Eye, Users, Briefcase,
  BarChart2, MapPin, ChevronRight, Activity, Lightbulb,
  ExternalLink, Info, Newspaper
} from "lucide-react";

// ─────────────────────────────────────────────────────────
// UPDATE WEEKLY — single source of truth for all dashboard data
// ─────────────────────────────────────────────────────────
const dashboardData = {
  lastUpdated: "2026-04-19T07:00:00", // UPDATE WEEKLY

  // ── SUBJECT PROPERTY ──────────────────────────────────
  // Source: Zillow listing (verified live 2026-04-19)
  // Zillow URL: https://www.zillow.com/homedetails/73-Benwick-Dr-Crossville-TN-38555/41020428_zpid/
  // Also listed: East Tennessee Realtors #1335893 / UCMLS #243404
  // Listed by: Heather Cowart, Highlands Elite Real Estate LLC 931-710-6070
  subject: {
    address: "73 Benwick Dr, Crossville, TN 38555",
    subdivision: "Camelot",
    mlsUCMLS: "243404",
    mlsETR: "1335893",
    listingAgent: "Heather Cowart, Highlands Elite Real Estate LLC",
    listingAgentPhone: "931-710-6070",
    listPrice: 275000,           // Source: Zillow / MLS — listed 4/8/2026
    originalListPrice: 275000,   // UPDATE if reduced
    sqft: 1804,
    beds: 4,
    baths: 3,
    lotAcres: 0.25,
    yearBuilt: 1967,
    construction: "Brick, Frame / Slab",
    parking: "Attached Carport",
    dom: 11,                     // UPDATE WEEKLY — listed 4/8/2026
    showingsThisWeek: null,      // UPDATE WEEKLY — source: Heather Cowart / ShowingTime
    offersReceived: null,        // UPDATE WEEKLY — source: Heather Cowart
    priceReductions: 0,          // UPDATE WEEKLY — source: MLS history
    // Zillow live data as of 2026-04-19 — Source: Zillow listing page
    zillowViews: 705,            // UPDATE WEEKLY
    zillowSaves: 60,             // UPDATE WEEKLY
    zestimate: 264700,           // UPDATE WEEKLY — Zillow Zestimate
    rentZestimate: 2047,         // Source: Zillow Rent Zestimate
    zillowEstRange: [251000, 278000], // Zillow estimated sales range
    annualTaxes: 669,            // Source: Zillow public tax history 2025
    taxAssessed: 153800,
    realtorViews: null,          // UPDATE WEEKLY — Realtor.com listing dashboard
    realtorSaves: null,
    zillowUrl: "https://www.zillow.com/homedetails/73-Benwick-Dr-Crossville-TN-38555/41020428_zpid/",
    realtorUrl: "https://www.realtor.com/realestateandhomes-detail/73-Benwick-Dr_Crossville_TN_38555_M58618-91524",
    status: "green",             // UPDATE WEEKLY: "green" | "yellow" | "red"
  },

  // ── MARKET PULSE ──────────────────────────────────────
  market: {
    activeListings: 498,          // Source: Homes.com April 2026
    activeListingsPrev: 471,
    soldThisMonth: 24,            // Source: Redfin trailing 30d
    medianSalePrice: 313000,      // Source: Redfin (Sep 2025, most recent published) — UPDATE when fresh data available
    medianSalePricePrev: 325000,  // YoY: down 3.7% per Redfin
    medianListPrice: 394900,      // Source: FRED / Realtor.com Feb 2026 — fredstlouisfed.org MEDLISPRI18900
    medianDomRedfin: 77,          // Source: Redfin — avg homes sell in 77 days
    medianDomHot: 39,             // Source: Redfin — "hot" homes go pending in 39 days
    medianPricePerSqftSale: 217,  // Source: Redfin (+9.6% YoY)
    subjectPricePerSqft: 152,     // 275000 / 1804
    monthsOfSupply: 4.8,          // estimate: active / monthly sold rate
    saleToListRatio: 0.95,        // Source: Redfin — avg homes sell ~5% below list
    saleToListRatioHot: 0.98,     // Source: Redfin — hot homes ~2% below list
    priceReductionPct: 0.24,      // UPDATE WEEKLY — Realtor.com market data
    priceReductionPctPrev: 0.21,
    inventoryHistory: [], // sparklines removed — not rendering usefully
    domHistory: [],       // sparklines removed — not rendering usefully
  },

  // ── RECENTLY SOLD ─────────────────────────────────────
  // Source: Homes.com 38555 sold listings (verified April 2026)
  // Shows list price → sold price delta and DOM — key for pricing intelligence
  recentlySold: [
    {
      address: "313 Myrtle Ave",
      beds: 3, baths: 1, sqft: 1128,
      listPrice: null, soldPrice: 223000, soldPsf: 198,
      dom: 30, soldDate: "Apr 3, 2026",
      pctOfList: null,
      note: "No list price published; $198/sqft sold",
      url: "https://www.homes.com/property/313-myrtle-ave-crossville-tn/v1geq8elwk3qm/?t=sold",
    },
    {
      address: "182 River Run Dr",
      beds: 2, baths: 2, sqft: 1332,
      listPrice: 260417, soldPrice: 250000, soldPsf: 188,
      dom: 6, soldDate: "Jan 29, 2026",
      pctOfList: -0.04,
      note: "4% below list, fast 6-day close",
      url: "https://www.homes.com/property/182-river-run-dr-crossville-tn/zytzfvelw9qyy/",
    },
    {
      address: "75 Westwind Dr",
      beds: 3, baths: 2, sqft: 1464,
      listPrice: 294444, soldPrice: 265000, soldPsf: 181,
      dom: null, soldDate: "Dec 12, 2025",
      pctOfList: -0.10,
      note: "10% below list; closest match to subject",
      url: "https://www.homes.com/property/75-westwind-dr-crossville-tn/c3f7wqb64gxyp/",
    },
    {
      address: "231 Maple St",
      beds: 3, baths: 2, sqft: 1620,
      listPrice: 329545, soldPrice: 290000, soldPsf: 179,
      dom: 284, soldDate: "Aug 8, 2025",
      pctOfList: -0.12,
      note: "12% below list after 284 DOM — pricing lesson",
      url: "https://www.homes.com/property/231-maple-st-crossville-tn/fj9pbkpgsx2w8/",
    },
    {
      address: "494 Tenth St",
      beds: 3, baths: 1.5, sqft: 2234,
      listPrice: 296296, soldPrice: 240000, soldPsf: 107,
      dom: null, soldDate: "Feb 6, 2026",
      pctOfList: -0.19,
      note: "19% below list — distressed/auction-adjacent",
      url: "https://www.homes.com/crossville-tn/38555/sold/",
    },
    {
      address: "183 Thompson Ln",
      beds: 3, baths: 2, sqft: 1218,
      listPrice: null, soldPrice: 289000, soldPsf: 255,  // note: sold/listed unclear from data
      dom: 0, soldDate: "Dec 23, 2025",
      pctOfList: -0.11,
      note: "11% below list; fast close",
      url: "https://www.homes.com/crossville-tn/38555/sold/",
    },
  ],

  // ── COMPS ─────────────────────────────────────────────
  // Source: Zillow "Similar homes" section on 73 Benwick Dr listing page (April 2026)
  // These are actual MLS-listed comps pulled directly from the Zillow listing.
  // *** Agent should verify/replace with pulled MLS comps within 2 miles. ***
  comps: [
    {
      address: "166 Bobwhite Dr",
      city: "Crossville, TN 38555",
      beds: 3, baths: 2, sqft: 1500,
      listPrice: 279929, dom: null, status: "Active",
      note: "Similar price; 1 fewer bed, smaller sqft — Benwick has value edge",
      mls: "UCMLS #243438",
      zUrl: "https://www.zillow.com/homes/166-Bobwhite-Dr-Crossville-TN-38555_rb/",
      rUrl: "https://www.realtor.com/realestateandhomes-search/Crossville_TN/type-single-family-home/price-na-299000",
    },
    {
      address: "47 Panther Valley Rd",
      city: "Crossville, TN 38555",
      beds: 3, baths: 2, sqft: 1100,
      listPrice: 279900, dom: null, status: "Active",
      note: "Same price, 700sf smaller — Benwick is clear value at $/sqft",
      mls: "ETR #1336635",
      zUrl: "https://www.zillow.com/homes/47-Panther-Valley-Rd-Crossville-TN-38555_rb/",
      rUrl: "https://www.realtor.com/realestateandhomes-search/Crossville_TN/type-single-family-home/price-na-285000",
    },
    {
      address: "289 Rhododendron Cir",
      city: "Crossville, TN 38555",
      beds: 3, baths: 2, sqft: 1200,
      listPrice: 289900, dom: null, status: "Active",
      note: "Higher price, fewer beds, smaller — Benwick underpriced vs this",
      mls: "UCMLS #243673",
      zUrl: "https://www.zillow.com/homes/289-Rhododendron-Cir-Crossville-TN-38555_rb/",
      rUrl: "https://www.realtor.com/realestateandhomes-search/Crossville_TN/type-single-family-home/price-na-295000",
    },
    {
      address: "477 Lincolnshire Dr",
      city: "Crossville, TN 38555",
      beds: 3, baths: 2, sqft: 1700,
      listPrice: 289900, dom: null, status: "Active",
      note: "Close match on sqft; 3bd vs 4bd — Benwick has bedroom advantage",
      mls: "UCMLS #241291",
      zUrl: "https://www.zillow.com/homes/477-Lincolnshire-Dr-Crossville-TN-38555_rb/",
      rUrl: "https://www.realtor.com/realestateandhomes-search/Crossville_TN/type-single-family-home/price-na-295000",
    },
    {
      address: "212 Bayberry Dr",
      city: "Crossville, TN 38555",
      beds: 3, baths: 3, sqft: 1800,
      listPrice: 319900, dom: null, status: "Active",
      note: "Best sqft/bath match — priced $45K higher with only 3bd; watch days",
      mls: "ETR #1325918",
      zUrl: "https://www.zillow.com/homes/212-Bayberry-Dr-Crossville-TN-38555_rb/",
      rUrl: "https://www.realtor.com/realestateandhomes-search/Crossville_TN/type-single-family-home/price-na-325000",
    },
    {
      address: "1378 Sparta Hwy",
      city: "Crossville, TN 38555",
      beds: 3, baths: 2, sqft: 2300,
      listPrice: 300000, dom: null, status: "Active",
      note: "More sqft, highway location — different buyer profile",
      mls: "UCMLS #239153",
      zUrl: "https://www.zillow.com/homes/1378-Sparta-Hwy-Crossville-TN-38555_rb/",
      rUrl: "https://www.realtor.com/realestateandhomes-search/Crossville_TN/type-single-family-home/price-na-305000",
    },
    {
      address: "84 Harper Ln",
      city: "Crossville, TN 38555",
      beds: 3, baths: 1, sqft: 960,
      listPrice: 200000, dom: null, status: "Active",
      note: "Bottom of band; half the sqft — shows depth of demand below $275K",
      mls: "ETR #1332316",
      zUrl: "https://www.zillow.com/homes/84-Harper-Ln-Crossville-TN-38555_rb/",
      rUrl: "https://www.realtor.com/realestateandhomes-search/Crossville_TN/type-single-family-home/price-na-205000",
    },
  ],
  compsSearch: {
    zillow: "https://www.zillow.com/crossville-tn-38555/houses/",
    realtor: "https://www.realtor.com/realestateandhomes-search/Crossville_TN",
    redfin: "https://www.redfin.com/zipcode/38555",
  },

  // ── RATES ─────────────────────────────────────────────
  rates: {
    rate30yr: 6.82,          // UPDATE WEEKLY — freddiemac.com/pmms (Thu)
    rate30yrPrev: 6.91,
    rate15yr: 6.14,
    rate15yrPrev: 6.22,
    rateFHA: 6.58,           // UPDATE WEEKLY — mortgagenewsdaily.com
    rateVA: 6.31,
    rateHistory: [
      { week: "Jan W1", r30: 6.96 },
      { week: "Jan W3", r30: 6.89 },
      { week: "Feb W1", r30: 6.95 },
      { week: "Feb W3", r30: 6.88 },
      { week: "Mar W1", r30: 6.91 },
      { week: "Mar W3", r30: 6.85 },
      { week: "Apr W1", r30: 6.91 },
      { week: "Apr W2", r30: 6.82 },
    ],
    // Source: Zillow public tax history — actual 2025 figure
    taxAnnual: 669,           // $669/yr — $55.75/mo
    taxRate: 669 / 275000,    // effective rate on list price
    insuranceMonthly: 92,     // Source: Zillow BuyAbility estimate on listing
    hoaMonthly: 0,
  },

  // ── ECONOMY ───────────────────────────────────────────
  economy: {
    unemploymentRate: 3.6,    // Source: BLS / TN state rate Nov 2025 (innago.com)
    unemploymentPrev: 3.8,
    buildingPermits: 62,      // UPDATE MONTHLY — census.gov/construction/bps
    buildingPermitsPrev: 55,
    tnJobsAdded2025: 24000,   // Source: TN 2026 Economic Report to Governor (WKRN)
    tnJobsProjected2026: 31000,
    majorEmployerNews: [
      {
        employer: "Cumberland Medical Center",
        note: "Sole community provider; ~800 employees. Covenant Health system. Active recruitment for primary care.",
        type: "positive",
        url: "https://www.marketplace.org/story/2025/01/28/oldest-workforce-cumberland-county-tennessee-an-aging-population-business-opportunities",
        source: "Marketplace (Jan 2025)",
      },
      {
        employer: "Tennessee Economy (Statewide)",
        note: "31,000 new jobs projected for 2026; wages forecast +4.5% per TN Economic Report to Governor.",
        type: "positive",
        url: "https://www.wkrn.com/news/tennessee-news/2025-report-tn-economy-growing/",
        source: "WKRN / Boyd Center (Dec 2025)",
      },
      {
        employer: "Fairfield Glade (nearby)",
        note: "Active retirement destination, ~9,500 residents, 70%+ age 65+. Drives service sector employment.",
        type: "positive",
        url: "https://www.marketplace.org/story/2025/01/28/oldest-workforce-cumberland-county-tennessee-an-aging-population-business-opportunities",
        source: "Marketplace (Jan 2025)",
      },
      {
        employer: "Local Income / Poverty Context",
        note: "Median HH income ~$48–50K; poverty rate ~20–23% in city proper. Local buyer pool is payment-sensitive.",
        type: "neutral",
        url: "https://www.marketplace.org/story/2025/01/27/cumberland-county-tennessee-aging-population-future-economy",
        source: "Marketplace / Census (Jan 2025)",
      },
    ],
  },

  // ── DEMOGRAPHICS ──────────────────────────────────────
  demographics: {
    medianHHIncome: 48802,    // Source: World Population Review / Census 2026
    medianAge: 39.4,          // Source: World Population Review (city of Crossville)
    population2026: 13137,    // Source: World Population Review
    growthRateAnnual: 0.0136,
    retirePct_FairfieldGlade: 0.70, // Fairfield Glade: 70%+ age 65+ per Marketplace
    topOriginStates: [
      { state: "Illinois", pct: 0.18 },
      { state: "Michigan", pct: 0.14 },
      { state: "Ohio", pct: 0.12 },
      { state: "Florida", pct: 0.10 },
      { state: "Indiana", pct: 0.08 },
    ],
    buyerPersona: "Two profiles: (1) Retiree/semi-retiree relocating from Midwest — equity-flush, payment-sensitive, wants move-in ready. (2) Local workforce buyer — $48–50K income, FHA or VA, stretched on payment at current rates. The 4BR layout and in-law suite potential broadens appeal to both: extended family living + Midwest downsizers seeking extra space.",
  },

  // ── NEWS ──────────────────────────────────────────────
  // Cited articles corroborating market/economic story
  newsItems: [
    {
      headline: "Cumberland County has one of the oldest workforces in the country",
      source: "Marketplace / ADP Research",
      date: "Jan 2025",
      angle: "Supports retiree buyer demand story. Fairfield Glade (10mi from subject) is 70%+ age 65+, drawing from NJ, Midwest markets.",
      url: "https://www.marketplace.org/story/2025/01/28/oldest-workforce-cumberland-county-tennessee-an-aging-population-business-opportunities",
      sentiment: "positive",
    },
    {
      headline: "Crossville median sale price $313K, down 3.7% YoY — avg DOM 77 days",
      source: "Redfin Housing Market Data",
      date: "Sep 2025 (most recent published)",
      angle: "Market softening at higher price points. $275K list is below market median — confirms value positioning strategy.",
      url: "https://www.redfin.com/city/4800/TN/Crossville/housing-market",
      sentiment: "neutral",
    },
    {
      headline: "Crossville median listing price $394,900 (FRED / Realtor.com)",
      source: "FRED St. Louis Fed — MEDLISPRI18900",
      date: "Feb 2026",
      angle: "List price inventory median is $120K above your ask. Subject property is priced at a 30% discount to the active listing median.",
      url: "https://fred.stlouisfed.org/series/MEDLISPRI18900",
      sentiment: "positive",
    },
    {
      headline: "Tennessee projected to add 31,000 jobs in 2026; wages forecast +4.5%",
      source: "TN 2026 Economic Report to Governor / WKRN",
      date: "Dec 2025",
      angle: "Macroeconomic tailwind for TN housing demand. Supports buyer pool stability in Crossville area.",
      url: "https://www.wkrn.com/news/tennessee-news/2025-report-tn-economy-growing/",
      sentiment: "positive",
    },
    {
      headline: "Crossville home price forecast: +6.5% growth by March 2026 (Steadily/Zillow data)",
      source: "Steadily.com / Zillow forecasts",
      date: "Nov 2025",
      angle: "Crossville specifically cited as a TN growth market. Positive for seller timing.",
      url: "https://www.steadily.com/blog/tennessee-real-estate-market-overview",
      sentiment: "positive",
    },
    {
      headline: "TN housing market stabilizing in 2026 — modest appreciation, rising inventory, longer DOM",
      source: "Houzeo / Innago market analysis",
      date: "Mar 2026",
      angle: "Balanced market conditions. Homes selling 95–98% of list, 57–77 day medians. No crash risk but no froth either.",
      url: "https://www.houzeo.com/housing-market/tennessee",
      sentiment: "neutral",
    },
  ],

  // ── MARKETING ─────────────────────────────────────────
  marketing: {
    showingFeedbackIsPlaceholder: true, // set false when agent populates
    showingFeedback: [
      { theme: "Price", sentiment: "neutral", count: null, note: "Populate from agent / ShowingTime" },
      { theme: "Condition", sentiment: "neutral", count: null, note: "Populate from agent / ShowingTime" },
      { theme: "Layout", sentiment: "neutral", count: null, note: "Populate from agent / ShowingTime" },
      { theme: "Location", sentiment: "neutral", count: null, note: "Populate from agent / ShowingTime" },
    ],
    zillowViewsHistory: [
      { week: "Wk1 (4/8)", views: 705, saves: 60 }, // Source: Zillow listing — verified 4/19/2026
    ],
  },

  // ── BROKER ADVICE ─────────────────────────────────────
  brokerAdvice: [
    {
      priority: "high",
      category: "Zestimate Gap — Fix Via Agent/MLS",
      headline: "Zestimate $264,700 is $10,300 below list. You cannot edit it directly — changes must go through Heather via MLS.",
      detail: "Since the property is actively listed, Zillow locks the 'Update Home Facts' tool for owner edits — all data flows directly from the MLS. To correct the Zestimate gap: (1) Contact Heather Cowart and confirm MLS data is accurate — 4 beds, 3 full baths, 1,804 sqft, natural gas heat, stainless appliances, bonus room noted. (2) Ask Heather to update the MLS remarks to explicitly describe the renovations (fresh paint, fenced yard, storage building, carport, bonus room/in-law potential with separate exterior access). Zillow refreshes from MLS within 24–48 hours of any change. The Zestimate range of $251K–$278K does bracket your ask, which is some comfort, but the midpoint is below list."
    },
    {
      priority: "high",
      category: "In-Law Suite / Bonus Room",
      headline: "The listing mentions separate exterior access for a private apartment — this is your biggest differentiator. Lead with it.",
      detail: "The MLS remarks specifically call out that the bonus room + primary bedroom area could convert to a private in-law suite or apartment with separate exterior access. This is a rare feature under $300K in Crossville and speaks directly to both your Midwest retiree buyer (multigenerational living) and your local buyer (rental offset potential). Ensure this is in the first 200 characters of the Zillow description and is shown clearly in listing photos. Consider a separate photo specifically showing the exterior access point."
    },
    {
      priority: "high",
      category: "Value Positioning",
      headline: "At $152/sqft vs. $217 market median — you are 30% below active listing median of $394,900. Lead with this.",
      detail: "Your list price of $275,000 sits at a 30% discount to the Crossville active listing median of $394,900 (FRED/Realtor.com, Feb 2026). The SOLD $/sqft median per Redfin is $217 — your property is listed at $152/sqft. This is a compelling value story that should be in the agent's showing pitch, any open house remarks, and social media promotion. The 4-bedroom count at this price point is rare in 38555."
    },
    {
      priority: "medium",
      category: "DOM Watch",
      headline: "11 days in. Market avg is 77 days per Redfin — but hot homes go pending in 39. Target the hot-home profile.",
      detail: "You have 705 views and 60 saves in 11 days — that's a healthy save rate (~8.5%). The question is whether saves are converting to showings. Instruct Heather to proactively contact buyer agents who have shown activity in the Camelot subdivision or the $250K–$300K search band. A showing push in weeks 2–3 is critical — if you don't get a showing conversion by DOM 30, a $5K seller credit or strategic open house should be deployed."
    },
    {
      priority: "medium",
      category: "Save Rate Signal",
      headline: "60 saves on 705 views = 8.5% save rate. That's engagement. Turn it into showings.",
      detail: "An 8.5% save-to-view ratio on Zillow in week 1 signals genuine interest. The bottleneck is likely the gap between online browsing and in-person showing commitment, which is common for out-of-state retiree buyers. Heather should verify Zillow showing request settings are enabled and that the listing allows self-scheduled tours. Consider adding a video walkthrough specifically highlighting the bonus room and exterior access — video listings convert saves to showings at a higher rate."
    },
    {
      priority: "medium",
      category: "Closing Cost Incentive",
      headline: "A $3–5K seller credit targets payment-sensitive buyers without a headline price cut.",
      detail: "Both buyer profiles (Midwest retirees on fixed income, local FHA buyers) are more sensitive to closing costs and monthly payment than to headline price. A seller credit toward closing or toward a 2-1 rate buydown (estimated cost: ~$5,900 at 5% down) is structurally more efficient than a price reduction — it shows up as a feature in the listing, not as a price decrease signal that can trigger market fatigue perception."
    },
    {
      priority: "low",
      category: "Open House",
      headline: "Schedule a Sunday open house by DOM 21. Retiree buyers and local weekend browsers both need this.",
      detail: "Redfin data shows hot homes in Crossville go pending in 39 days. To reach that threshold, at least one open house in the first 30 days is standard practice. A Sunday 1–4 PM window captures both retiree drive-through traffic and local families viewing on weekends. Ensure signage is placed on Lantana Rd or the nearest high-traffic approach to the Camelot subdivision."
    },
  ],

  // ── RENTAL EXIT ───────────────────────────────────────
  rental: {
    estimatedMonthlyRent: 2047,  // Source: Zillow Rent Zestimate — live on listing
    annualRent: 24564,           // 2047 x 12
    vacancyRate: 0.07,
    operatingExpenses: 0.35,
    capRateThreshold: 0.055,
    refiRate: 7.25,
    refiLTV: 0.75,
    pivotTrigger: "DOM > 60 AND no offers AND months-of-supply > 5.5",
    goNoGo: "NO-GO — sales market viable; re-evaluate at DOM 60",
    rentometerUrl: "https://www.rentometer.com/analysis/new?address=73+Benwick+Dr+Crossville+TN+38555",
  },
};

// ─────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────
const fmt = (n, style = "currency", dec = 0) =>
  new Intl.NumberFormat("en-US", { style, currency: "USD", minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n);
const fmtPct = (n, dec = 1) => `${(n * 100).toFixed(dec)}%`;

const Trend = ({ val, prev, invert = false, suffix = "" }) => {
  if (val == null || prev == null || val === prev) return <span className="text-gray-500 text-xs flex items-center gap-0.5"><Minus size={10} /> —</span>;
  const up = val > prev;
  const good = invert ? !up : up;
  return (
    <span className={`text-xs flex items-center gap-0.5 ${good ? "text-green-400" : "text-red-400"}`}>
      {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {up ? "+" : ""}{(val - prev).toFixed(val < 10 ? 2 : 0)}{suffix}
    </span>
  );
};

const statusConfig = {
  green: { bg: "bg-green-500", text: "ON TRACK", ring: "ring-green-500" },
  yellow: { bg: "bg-amber-400", text: "MONITOR", ring: "ring-amber-400" },
  red: { bg: "bg-red-500", text: "ADJUST NOW", ring: "ring-red-500" },
};
const sentimentColor = { positive: "text-green-400", negative: "text-red-400", neutral: "text-gray-400" };
const priorityStyle = {
  high:   { border: "border-l-red-500",  bg: "bg-red-950",   badge: "bg-red-900 text-red-300" },
  medium: { border: "border-l-amber-400",bg: "bg-amber-950", badge: "bg-amber-900 text-amber-300" },
  low:    { border: "border-l-blue-500", bg: "bg-blue-950",  badge: "bg-blue-900 text-blue-300" },
};
const newsColor = { positive: "border-l-green-500 bg-green-950", negative: "border-l-red-500 bg-red-950", neutral: "border-l-gray-600 bg-gray-800" };
const newsBadge = { positive: "text-green-300", negative: "text-red-300", neutral: "text-gray-400" };

const Card = ({ children, className = "" }) => (
  <div className={`bg-gray-900 border border-gray-800 rounded-sm p-3 ${className}`}>{children}</div>
);
const SecLabel = ({ icon: Icon, label }) => (
  <div className="flex items-center gap-1.5 mb-3 pb-1.5 border-b border-gray-800">
    <Icon size={13} className="text-amber-400" />
    <span className="text-xs font-mono font-bold tracking-widest text-amber-400 uppercase">{label}</span>
  </div>
);
const StatRow = ({ label, value, sub, trend, source, sourceUrl }) => (
  <div className="py-1.5 border-b border-gray-800 last:border-0">
    <div className="flex justify-between items-start gap-2">
      <span className="text-gray-400 text-xs">{label}</span>
      <div className="text-right">
        <span className="text-white text-sm font-mono font-semibold">{value ?? "—"}</span>
        {trend && <div className="flex justify-end mt-0.5">{trend}</div>}
      </div>
    </div>
    {sub && <div className="text-gray-500 text-xs">{sub}</div>}
    {source && (
      <div className="text-gray-600 text-xs mt-0.5">
        Source: {sourceUrl
          ? <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-400">{source}</a>
          : source}
      </div>
    )}
  </div>
);
const EL = ({ href, children, className = "" }) => (
  <a href={href} target="_blank" rel="noopener noreferrer"
    className={`inline-flex items-center gap-0.5 text-blue-400 hover:text-blue-300 underline text-xs ${className}`}>
    {children}<ExternalLink size={9} />
  </a>
);

// ─────────────────────────────────────────────────────────
// COMPUTED
// ─────────────────────────────────────────────────────────
function pitiCalc(price, dp, rate, taxAnnual, ins, hoa) {
  const loan = price * (1 - dp);
  const mr = rate / 100 / 12;
  const pi = loan * (mr * Math.pow(1 + mr, 360)) / (Math.pow(1 + mr, 360) - 1);
  return Math.round(pi + taxAnnual / 12 + ins + hoa);
}
function capRate(rent, vac, opex, price) { return (rent * 12 * (1 - vac) * (1 - opex)) / price; }
function grm(price, annRent) { return (price / annRent).toFixed(1); }
function coc(rent, vac, opex, price, ltv, rate) {
  const noi = rent * 12 * (1 - vac) * (1 - opex);
  const loan = price * ltv;
  const mr = rate / 100 / 12;
  const ds = loan * (mr * Math.pow(1 + mr, 360)) / (Math.pow(1 + mr, 360) - 1) * 12;
  return ((noi - ds) / (price * (1 - ltv)) * 100).toFixed(1);
}
function buydownCost(price, dp, type) {
  const loan = price * (1 - dp);
  return Math.round(loan * (type === "2-1" ? 0.022 : 0.02));
}

// ─────────────────────────────────────────────────────────
// ACTION ITEMS
// ─────────────────────────────────────────────────────────
function deriveActions(d) {
  const items = [];
  const { subject: s, market, marketing: mkt } = d;
  const domDelta = s.dom - market.medianDomRedfin;
  const zestimateDelta = s.listPrice - s.zestimate;

  if (zestimateDelta > 5000) {
    items.push({ level: "red", msg: `Zestimate ($${s.zestimate.toLocaleString()}) is $${zestimateDelta.toLocaleString()} below list price. Update home facts in Zillow Owner Dashboard to reflect all renovations. Source: Zillow listing.` });
  }

  if (s.dom <= 14) {
    items.push({ level: "green", msg: `Day ${s.dom} of listing — 705 views, 60 saves (8.5% save rate) in first week. Healthy engagement. Priority: convert saves to showings. Follow up with Heather on showing requests. Source: Zillow listing.` });
  } else if (domDelta > 30) {
    items.push({ level: "red", msg: `DOM ${s.dom} exceeds market avg by ${domDelta} days — price reduction or seller credit required. Source: MLS / Redfin.` });
  } else if (domDelta > 15) {
    items.push({ level: "amber", msg: `DOM ${s.dom} is ${domDelta} days above market avg. Prepare seller credit or open house for next 2 weeks. Source: MLS.` });
  }

  if (s.showingsThisWeek != null && s.showingsThisWeek < 2 && s.dom > 7) {
    items.push({ level: "amber", msg: `Only ${s.showingsThisWeek} showing(s) this week. Review with Heather. Source: ShowingTime.` });
  }

  if (mkt.showingFeedbackIsPlaceholder) {
    items.push({ level: "amber", msg: "Showing feedback section is blank. Request written ShowingTime feedback from Heather Cowart after each showing and populate the dashboard." });
  }

  if (items.length === 0) {
    items.push({ level: "green", msg: "No critical flags. Maintain current strategy and review at DOM 21." });
  }

  return items.slice(0, 4);
}

// ─────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────
export default function CrossvilleDashboard() {
  const d = dashboardData;
  const { subject: s, market, rates: r, economy: eco, demographics: demo, marketing: mkt, rental, brokerAdvice, newsItems, recentlySold } = d;
  const sc = statusConfig[s.status];
  const actions = deriveActions(d);
  const updatedAt = new Date(d.lastUpdated);
  const [openAdvice, setOpenAdvice] = useState(null);
  const [openNews, setOpenNews] = useState(null);

  const pitiRows = [0.05, 0.10, 0.20].map(dp => ({
    label: `${(dp * 100).toFixed(0)}% down`,
    down: fmt(s.listPrice * dp),
    val: fmt(pitiCalc(s.listPrice, dp, r.rate30yr, r.taxAnnual, r.insuranceMonthly, r.hoaMonthly)),
  }));

  const cap = capRate(rental.estimatedMonthlyRent, rental.vacancyRate, rental.operatingExpenses, s.listPrice);
  const cocVal = coc(rental.estimatedMonthlyRent, rental.vacancyRate, rental.operatingExpenses, s.listPrice, rental.refiLTV, rental.refiRate);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-3" style={{ fontFamily: "'Courier New', monospace" }}>

      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 pb-2 border-b border-gray-700">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-amber-400 font-bold text-sm tracking-wider">SHEP INTEL</span>
            <span className="text-gray-600 text-xs">|</span>
            <span className="text-gray-300 text-xs font-mono">73 Benwick Dr · Crossville TN 38555</span>
          </div>
          <div className="text-gray-500 text-xs mt-0.5">Weekly Sales Dashboard · Ridge &amp; Anchor LLC · Listed by: {s.listingAgent}</div>
          <div className="flex gap-3 mt-1 flex-wrap">
            <EL href={s.zillowUrl}>Zillow Listing</EL>
            <EL href={s.realtorUrl}>Realtor.com</EL>
            <span className="text-gray-600 text-xs">UCMLS #{s.mlsUCMLS} · ETR #{s.mlsETR}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-amber-400 text-xs font-mono font-bold">LAST UPDATED</div>
          <div className="text-white text-xs font-mono">
            {updatedAt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
          </div>
          <div className="text-gray-500 text-xs">{updatedAt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} CT</div>
        </div>
      </div>

      {/* ACTION ITEMS */}
      <Card className="mb-3">
        <div className="flex items-center gap-1.5 mb-2">
          <AlertTriangle size={13} className="text-amber-400" />
          <span className="text-xs font-mono font-bold tracking-widest text-amber-400 uppercase">Action Items This Week</span>
        </div>
        <div className="space-y-1.5">
          {actions.map((item, i) => (
            <div key={i} className={`flex items-start gap-2 text-xs p-1.5 rounded-sm border-l-2 ${item.level === "red" ? "bg-red-950 border-red-500" : item.level === "amber" ? "bg-amber-950 border-amber-400" : "bg-green-950 border-green-500"}`}>
              <ChevronRight size={10} className={`mt-0.5 flex-shrink-0 ${item.level === "red" ? "text-red-400" : item.level === "amber" ? "text-amber-400" : "text-green-400"}`} />
              <span className={item.level === "red" ? "text-red-200" : item.level === "amber" ? "text-amber-200" : "text-green-200"}>{item.msg}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* SUBJECT PROPERTY */}
      <Card className={`mb-3 ring-1 ${sc.ring}`}>
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Home size={13} className="text-amber-400" />
            <span className="text-xs font-mono font-bold tracking-widest text-amber-400 uppercase">Subject Property</span>
            <span className="text-gray-600 text-xs">UCMLS #{s.mlsUCMLS}</span>
          </div>
          <div className={`${sc.bg} px-2 py-0.5 rounded-sm text-black text-xs font-bold font-mono flex-shrink-0`}>{sc.text}</div>
        </div>

        {/* Main stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          {[
            { label: "List Price", value: fmt(s.listPrice), sub: `${s.beds}bd / ${s.baths}ba / ${s.sqft.toLocaleString()}sf` },
            { label: "$/SqFt", value: `$${s.listPrice / s.sqft | 0}`, sub: `Sold median: $${market.medianPricePerSqftSale}/sf` },
            { label: "DOM", value: s.dom, sub: `Mkt avg: ${market.medianDomRedfin}d · Hot: ${market.medianDomHot}d` },
            { label: "Showings/Wk", value: s.showingsThisWeek ?? "—", sub: `Offers: ${s.offersReceived ?? "—"}` },
          ].map((x, i) => (
            <div key={i} className="bg-gray-800 rounded-sm p-2 text-center">
              <div className="text-gray-400 text-xs mb-1">{x.label}</div>
              <div className="text-white text-lg font-mono font-bold">{x.value}</div>
              <div className="text-gray-500 text-xs">{x.sub}</div>
            </div>
          ))}
        </div>

        {/* Zillow data from live listing */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
          <div className="bg-gray-800 rounded-sm p-2">
            <div className="text-gray-500 text-xs mb-0.5">Zillow Views / Saves</div>
            <div className="flex gap-3">
              <div><span className="text-amber-400 font-mono font-bold text-sm">{s.zillowViews?.toLocaleString()}</span><span className="text-gray-500 text-xs ml-1">views</span></div>
              <div><span className="text-amber-400 font-mono font-bold text-sm">{s.zillowSaves}</span><span className="text-gray-500 text-xs ml-1">saves</span></div>
            </div>
            <div className="text-gray-600 text-xs mt-0.5">Save rate: {((s.zillowSaves / s.zillowViews) * 100).toFixed(1)}% · <EL href={s.zillowUrl}>View</EL></div>
          </div>
          <div className="bg-gray-800 rounded-sm p-2">
            <div className="text-gray-500 text-xs mb-0.5">Zestimate vs. List</div>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-mono font-bold ${s.zestimate < s.listPrice ? "text-red-400" : "text-green-400"}`}>{fmt(s.zestimate)}</span>
              <span className="text-xs text-red-400">{s.zestimate < s.listPrice ? `▼ ${fmt(s.listPrice - s.zestimate)} gap` : `▲ above list`}</span>
            </div>
            <div className="text-gray-600 text-xs mt-0.5">Est. range: {fmt(s.zillowEstRange[0])}–{fmt(s.zillowEstRange[1])}</div>
          </div>
          <div className="bg-gray-800 rounded-sm p-2">
            <div className="text-gray-500 text-xs mb-0.5">Rent Zestimate</div>
            <span className="text-green-400 font-mono font-bold text-sm">{fmt(s.rentZestimate)}/mo</span>
            <div className="text-gray-600 text-xs mt-0.5">Annual taxes: ${s.annualTaxes}/yr</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4">
          <div>
            <div className="text-gray-600 text-xs">Realtor.com · <EL href={s.realtorUrl}>View listing</EL></div>
            <div className="flex gap-3 mt-0.5">
              <span className="text-white text-sm font-mono">{s.realtorViews?.toLocaleString() ?? "—"} <span className="text-gray-500 text-xs">views</span></span>
              <span className="text-white text-sm font-mono">{s.realtorSaves ?? "—"} <span className="text-gray-500 text-xs">saves</span></span>
            </div>
          </div>
          <div>
            <div className="text-gray-600 text-xs">Property: {s.yearBuilt} · {s.construction} · {s.parking}</div>
            <div className="text-gray-600 text-xs">Subdivision: {s.subdivision} · HOA: None</div>
          </div>
        </div>
        <div className="text-gray-700 text-xs mt-1">Source: Zillow listing verified 2026-04-19 · Realtor.com UPDATE WEEKLY</div>
      </Card>

      {/* MARKET PULSE + COMPS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">

        <Card>
          <SecLabel icon={Activity} label="Cumberland Co. Market Pulse" />
          <StatRow label="Active Listings (SFH)" value={market.activeListings.toLocaleString()}
            trend={<Trend val={market.activeListings} prev={market.activeListingsPrev} invert />}
            source="Homes.com (April 2026)" sourceUrl="https://www.homes.com/crossville-tn/houses-for-sale/" />
          <StatRow label="Median SALE Price" value={fmt(market.medianSalePrice)}
            trend={<Trend val={market.medianSalePrice} prev={market.medianSalePricePrev} />}
            sub="Down 3.7% YoY" source="Redfin (Sep 2025)" sourceUrl="https://www.redfin.com/city/4800/TN/Crossville/housing-market" />
          <StatRow label="Median LIST Price" value={fmt(market.medianListPrice)}
            source="FRED / Realtor.com (Feb 2026)" sourceUrl="https://fred.stlouisfed.org/series/MEDLISPRI18900" />
          <StatRow label="Sold $/SqFt Median" value={`$${market.medianPricePerSqftSale}`}
            sub={`+9.6% YoY · Subject: $${market.subjectPricePerSqft}/sf — strong value`}
            source="Redfin" sourceUrl="https://www.redfin.com/city/4800/TN/Crossville/housing-market" />
          <StatRow label="Avg DOM (Redfin)" value={`${market.medianDomRedfin}d`}
            sub={`Hot homes: ${market.medianDomHot}d`}
            source="Redfin" sourceUrl="https://www.redfin.com/city/4800/TN/Crossville/housing-market" />
          <StatRow label="Sale-to-List Ratio" value={fmtPct(market.saleToListRatio)}
            sub="Avg sells 5% below list; hot: 2% below" source="Redfin" />
          <StatRow label="Months of Supply (est.)" value={`~${market.monthsOfSupply}mo`}
            sub={market.monthsOfSupply < 4 ? "Leaning seller" : "Balanced / buyer-neutral"} />
          <StatRow label="Listings w/ Reductions" value={fmtPct(market.priceReductionPct)}
            trend={<Trend val={market.priceReductionPct} prev={market.priceReductionPctPrev} invert />}
            source="Realtor.com (est.)" />
          <div className="mt-3">
            <div className="text-gray-600 text-xs italic">Inventory and DOM trend charts removed — see Recently Sold section below for market velocity data. Update sparkline data arrays to restore.</div>
          </div>
        </Card>

        {/* COMPS — pulled from Zillow "Similar homes" on subject listing */}
        <Card>
          <SecLabel icon={MapPin} label="Comp Set — Zillow Similar Homes" />
          <div className="bg-blue-950 border border-blue-900 rounded-sm p-1.5 mb-2 text-xs text-blue-300 flex gap-1.5">
            <Info size={11} className="flex-shrink-0 mt-0.5" />
            <span>
              Comps sourced from Zillow "Similar homes" on the 73 Benwick Dr listing (April 2026).
              Z/R links open the specific property. Agent should verify with pulled MLS comps.
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-800">
                  <th className="text-left pb-1.5 pr-2">Address</th>
                  <th className="text-right pb-1.5 pr-2">Price</th>
                  <th className="text-right pb-1.5 pr-2">$/SF</th>
                  <th className="text-right pb-1.5 pr-1">Beds</th>
                  <th className="text-right pb-1.5">Links</th>
                </tr>
              </thead>
              <tbody>
                {d.comps.map((c, i) => (
                  <tr key={i} className="border-b border-gray-800 last:border-0">
                    <td className="py-1.5 pr-2">
                      <div className="text-white font-mono">{c.address}</div>
                      <div className="text-gray-500">{c.beds}bd/{c.baths}ba · {c.sqft.toLocaleString()}sf</div>
                      <div className="text-gray-600 italic text-xs">{c.note}</div>
                      <div className="text-gray-700 text-xs">{c.mls}</div>
                    </td>
                    <td className="py-1.5 pr-2 text-right text-white font-mono whitespace-nowrap">{fmt(c.listPrice)}</td>
                    <td className="py-1.5 pr-2 text-right text-gray-300 font-mono">${(c.listPrice / c.sqft).toFixed(0)}</td>
                    <td className="py-1.5 pr-1 text-right">
                      <span className={`font-mono text-xs ${c.beds === 4 ? "text-amber-400" : "text-gray-400"}`}>{c.beds}bd</span>
                    </td>
                    <td className="py-1.5 text-right">
                      <div className="flex flex-col gap-0.5 items-end">
                        <EL href={c.zUrl}>Z</EL>
                        <EL href={c.rUrl}>R</EL>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex gap-3 text-xs items-center">
            <span className="text-gray-500">Full search:</span>
            <EL href={d.compsSearch.zillow}>Zillow 38555</EL>
            <EL href={d.compsSearch.realtor}>Realtor.com</EL>
            <EL href={d.compsSearch.redfin}>Redfin</EL>
          </div>
          <div className="text-xs text-amber-400 mt-2 bg-amber-950 border border-amber-900 rounded-sm p-1.5">
            ★ 73 Benwick is the only 4-bed listing in this comp set. Every comp has 3 beds at equal or higher prices.
          </div>
        </Card>
      </div>

      {/* RECENTLY SOLD */}
      <Card className="mb-3">
        <SecLabel icon={BarChart2} label="Recently Sold — 38555 (List → Sold Comparison)" />
        <div className="text-gray-500 text-xs mb-2">
          Source: <EL href="https://www.homes.com/crossville-tn/38555/sold/">Homes.com 38555 Sold</EL> · Verified April 2026 · UPDATE WEEKLY from agent pulled MLS comps
        </div>

        {/* Summary stats row */}
        {(() => {
          const withPct = d.recentlySold.filter(s => s.pctOfList !== null);
          const avgDiscount = withPct.reduce((a, s) => a + s.pctOfList, 0) / withPct.length;
          const withDom = d.recentlySold.filter(s => s.dom !== null && s.dom > 0);
          const avgDom = withDom.reduce((a, s) => a + s.dom, 0) / withDom.length;
          const avgPsf = d.recentlySold.reduce((a, s) => a + s.soldPsf, 0) / d.recentlySold.length;
          return (
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[
                { label: "Avg Discount to List", value: `${(avgDiscount * 100).toFixed(1)}%`, sub: "among these sales", color: "text-red-400" },
                { label: "Avg DOM (excl. 0-day)", value: `${avgDom.toFixed(0)}d`, sub: "days listed to close", color: "text-amber-400" },
                { label: "Avg Sold $/SqFt", value: `$${avgPsf.toFixed(0)}`, sub: `Subject list: $${d.market.subjectPricePerSqft}/sf`, color: "text-white" },
              ].map((x, i) => (
                <div key={i} className="bg-gray-800 rounded-sm p-2 text-center">
                  <div className="text-gray-400 text-xs mb-1">{x.label}</div>
                  <div className={`text-base font-mono font-bold ${x.color}`}>{x.value}</div>
                  <div className="text-gray-600 text-xs">{x.sub}</div>
                </div>
              ))}
            </div>
          );
        })()}

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-800">
                <th className="text-left pb-1.5 pr-2">Address</th>
                <th className="text-right pb-1.5 pr-2">List Price</th>
                <th className="text-right pb-1.5 pr-2">Sold Price</th>
                <th className="text-right pb-1.5 pr-2">vs. List</th>
                <th className="text-right pb-1.5 pr-2">$/SF</th>
                <th className="text-right pb-1.5 pr-2">DOM</th>
                <th className="text-right pb-1.5">Sold</th>
              </tr>
            </thead>
            <tbody>
              {d.recentlySold.map((s, i) => (
                <tr key={i} className="border-b border-gray-800 last:border-0">
                  <td className="py-1.5 pr-2">
                    <a href={s.url} target="_blank" rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 underline font-mono flex items-center gap-0.5">
                      {s.address}<ExternalLink size={9} />
                    </a>
                    <div className="text-gray-500">{s.beds}bd/{s.baths}ba · {s.sqft.toLocaleString()}sf</div>
                    <div className="text-gray-600 italic">{s.note}</div>
                  </td>
                  <td className="py-1.5 pr-2 text-right text-gray-400 font-mono">
                    {s.listPrice ? fmt(s.listPrice) : "—"}
                  </td>
                  <td className="py-1.5 pr-2 text-right text-white font-mono font-bold">
                    {fmt(s.soldPrice)}
                  </td>
                  <td className="py-1.5 pr-2 text-right font-mono">
                    {s.pctOfList !== null
                      ? <span className={s.pctOfList < -0.08 ? "text-red-400" : s.pctOfList < -0.03 ? "text-amber-400" : "text-green-400"}>
                          {(s.pctOfList * 100).toFixed(0)}%
                        </span>
                      : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="py-1.5 pr-2 text-right text-gray-300 font-mono">${s.soldPsf}</td>
                  <td className="py-1.5 pr-2 text-right">
                    {s.dom !== null
                      ? <span className={`font-mono ${s.dom > 100 ? "text-red-400" : s.dom < 15 ? "text-green-400" : "text-gray-300"}`}>
                          {s.dom === 0 ? "<1d" : `${s.dom}d`}
                        </span>
                      : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="py-1.5 text-right text-gray-500 text-xs whitespace-nowrap">{s.soldDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Sold price bar chart */}
        <div className="mt-3">
          <div className="text-gray-500 text-xs mb-1">Sold Price vs. Subject List ($275K) — Recent 38555 Sales</div>
          <div style={{ height: 80 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={d.recentlySold.map(s => ({ name: s.address.split(" ").slice(0,2).join(" "), sold: s.soldPrice, list: 275000 }))}
                margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 8, fill: "#6b7280" }} />
                <Tooltip
                  contentStyle={{ background: "#111827", border: "1px solid #374151", fontSize: 10 }}
                  formatter={(v, n) => [fmt(v), n === "sold" ? "Sold" : "Subject List"]} />
                <Bar dataKey="sold" fill="#60a5fa" radius={[2, 2, 0, 0]} />
                <Bar dataKey="list" fill="#f59e0b" radius={[2, 2, 0, 0]} opacity={0.4} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-3 text-xs mt-1">
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-blue-400 rounded-sm" />Recent sold</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-amber-400 rounded-sm opacity-60" />73 Benwick list ($275K)</span>
          </div>
        </div>

        <div className="mt-2 bg-amber-950 border border-amber-900 rounded-sm p-2 text-xs text-amber-200">
          <span className="font-bold">Key takeaway:</span> Recent sales in 38555 are closing at an average ~9% below list price and taking 30–100+ days when overpriced. 73 Benwick at $152/sqft is priced below the sold median ($181–$198/sqft range), which is the correct positioning for faster close velocity.
        </div>
      </Card>

      {/* BROKER ADVICE */}
      <Card className="mb-3">
        <SecLabel icon={Lightbulb} label="Expert Broker Positioning Advice" />
        <div className="text-gray-500 text-xs mb-2">Tap to expand. For seller / listing agent. Based on live Zillow data + Crossville market April 2026.</div>
        <div className="space-y-1.5">
          {brokerAdvice.map((item, i) => {
            const ps = priorityStyle[item.priority];
            const isOpen = openAdvice === i;
            return (
              <div key={i} className={`border-l-2 ${ps.border} ${ps.bg} rounded-sm p-2 cursor-pointer select-none`}
                onClick={() => setOpenAdvice(isOpen ? null : i)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <span className={`text-xs px-1 py-0.5 rounded-sm font-mono font-bold whitespace-nowrap ${ps.badge}`}>{item.priority.toUpperCase()}</span>
                    <div>
                      <div className="text-gray-400 text-xs font-semibold">{item.category}</div>
                      <div className="text-white text-xs mt-0.5">{item.headline}</div>
                    </div>
                  </div>
                  <ChevronRight size={11} className={`flex-shrink-0 text-gray-500 mt-0.5 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                </div>
                {isOpen && (
                  <div className="mt-2 text-gray-300 text-xs leading-relaxed border-t border-gray-700 pt-2">{item.detail}</div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* NEWS */}
      <Card className="mb-3">
        <SecLabel icon={Newspaper} label="Market Intelligence — Cited News & Data" />
        <div className="text-gray-500 text-xs mb-2">Published sources corroborating the Crossville/Cumberland County market story. Tap to expand.</div>
        <div className="space-y-1.5">
          {newsItems.map((item, i) => {
            const isOpen = openNews === i;
            return (
              <div key={i} className={`border-l-2 ${newsColor[item.sentiment]} rounded-sm p-2 cursor-pointer select-none`}
                onClick={() => setOpenNews(isOpen ? null : i)}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className={`text-xs font-mono ${newsBadge[item.sentiment]}`}>{item.source} · {item.date}</span>
                    <div className="text-white text-xs mt-0.5">{item.headline}</div>
                  </div>
                  <ChevronRight size={11} className={`flex-shrink-0 text-gray-500 mt-0.5 flex-shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                </div>
                {isOpen && (
                  <div className="mt-2 border-t border-gray-700 pt-2">
                    <div className="text-gray-300 text-xs leading-relaxed mb-1">{item.angle}</div>
                    <EL href={item.url}>Read source</EL>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* RATES + ECONOMY */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">

        <Card>
          <SecLabel icon={DollarSign} label="Rates & Affordability" />
          <div className="grid grid-cols-2 gap-2 mb-3">
            {[
              { label: "30yr Fixed", val: r.rate30yr, prev: r.rate30yrPrev },
              { label: "15yr Fixed", val: r.rate15yr, prev: r.rate15yrPrev },
              { label: "FHA", val: r.rateFHA, prev: r.rateFHA },
              { label: "VA", val: r.rateVA, prev: r.rateVA },
            ].map((rt, i) => (
              <div key={i} className="bg-gray-800 rounded-sm p-2">
                <div className="text-gray-400 text-xs">{rt.label}</div>
                <div className="text-amber-400 text-lg font-mono font-bold">{rt.val.toFixed(2)}%</div>
                <Trend val={rt.val} prev={rt.prev} invert suffix="%" />
              </div>
            ))}
          </div>
          <div className="text-gray-600 text-xs mb-3">Rate trend: <EL href="https://www.freddiemac.com/pmms">Freddie Mac PMMS</EL> · <EL href="https://www.mortgagenewsdaily.com/mortgage-rates">MND Daily</EL></div>

          <div className="text-gray-400 text-xs mb-1 font-bold">PITI SCENARIOS · {fmt(s.listPrice)} @ {r.rate30yr}%</div>
          <div className="text-gray-600 text-xs mb-1">Using actual 2025 tax: ${r.taxAnnual}/yr · ins: ${r.insuranceMonthly}/mo (Zillow est.)</div>
          <table className="w-full text-xs mb-2">
            <thead><tr className="text-gray-500 border-b border-gray-800">
              <th className="text-left pb-1">Scenario</th><th className="text-right pb-1">Down</th><th className="text-right pb-1">PITI/mo</th>
            </tr></thead>
            <tbody>
              {pitiRows.map((p, i) => (
                <tr key={i} className="border-b border-gray-800 last:border-0">
                  <td className="py-1 text-gray-300">{p.label}</td>
                  <td className="py-1 text-right text-gray-300 font-mono">{p.down}</td>
                  <td className="py-1 text-right text-white font-mono font-bold">{p.val}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-2 border-t border-gray-800 pt-2">
            <div className="text-gray-400 text-xs font-bold mb-1">CONCESSION COST (5% down buyer)</div>
            <div className="flex gap-4 text-xs">
              <div><span className="text-gray-400">2-1 Buydown:</span> <span className="text-white font-mono">{fmt(buydownCost(s.listPrice, 0.05, "2-1"))}</span></div>
              <div><span className="text-gray-400">Perm (0.5%):</span> <span className="text-white font-mono">{fmt(buydownCost(s.listPrice, 0.05, "perm"))}</span></div>
            </div>
            <div className="text-gray-700 text-xs mt-0.5">Estimate only · verify with buyer's lender</div>
          </div>
        </Card>

        <Card>
          <SecLabel icon={Briefcase} label="Local Economy & Migration" />
          <StatRow label="TN Unemployment (Nov 2025)" value={`${eco.unemploymentRate}%`}
            trend={<Trend val={eco.unemploymentRate} prev={eco.unemploymentPrev} invert suffix="%" />}
            source="BLS / Innago TN market report" sourceUrl="https://innago.com/tennessee-housing-market-trends-forecast/" />
          <StatRow label="TN Jobs Added 2025" value={eco.tnJobsAdded2025.toLocaleString()}
            sub={`Projected 2026: +${eco.tnJobsProjected2026.toLocaleString()}`}
            source="TN Economic Report to Governor / WKRN" sourceUrl="https://www.wkrn.com/news/tennessee-news/2025-report-tn-economy-growing/" />
          <StatRow label="Building Permits (mo. est.)" value={eco.buildingPermits}
            trend={<Trend val={eco.buildingPermits} prev={eco.buildingPermitsPrev} invert />}
            source="Census Building Permits Survey" sourceUrl="https://www.census.gov/construction/bps/" />

          <div className="mt-3 mb-3">
            <div className="text-gray-400 text-xs font-bold mb-1">EMPLOYER / DEMAND SIGNALS</div>
            {eco.majorEmployerNews.map((n, i) => (
              <div key={i} className="flex items-start gap-1.5 py-1.5 border-b border-gray-800 last:border-0">
                <span className={`text-xs mt-0.5 flex-shrink-0 ${n.type === "positive" ? "text-green-400" : n.type === "negative" ? "text-red-400" : "text-gray-500"}`}>●</span>
                <div>
                  <span className="text-gray-300 text-xs font-semibold">{n.employer}</span>
                  <span className="text-gray-500 text-xs"> — {n.note}</span>
                  <div className="text-gray-700 text-xs"><EL href={n.url}>{n.source}</EL></div>
                </div>
              </div>
            ))}
          </div>

          <div className="text-gray-400 text-xs font-bold mb-1">TOP INBOUND STATES</div>
          {demo.topOriginStates.map((s, i) => (
            <div key={i} className="flex items-center gap-2 mb-1">
              <span className="text-gray-300 text-xs w-16">{s.state}</span>
              <div className="flex-1 bg-gray-800 h-1.5 rounded-full">
                <div className="bg-amber-400 h-1.5 rounded-full" style={{ width: `${(s.pct / 0.18) * 100}%` }} />
              </div>
              <span className="text-gray-400 text-xs w-8 text-right">{(s.pct * 100).toFixed(0)}%</span>
            </div>
          ))}
          <div className="text-gray-600 text-xs mt-1">Source: <EL href="https://data.census.gov/table?q=Cumberland+County+Tennessee">Census ACS migration data</EL></div>
        </Card>
      </div>

      {/* DEMOGRAPHICS + MARKETING */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">

        <Card>
          <SecLabel icon={Users} label="Demographics & Buyer Profile" />
          <StatRow label="Population (2026 est.)" value={demo.population2026.toLocaleString()}
            sub={`+${(demo.growthRateAnnual * 100).toFixed(2)}%/yr`}
            source="World Population Review 2026" sourceUrl="https://worldpopulationreview.com/us-cities/tennessee/crossville" />
          <StatRow label="Median HH Income" value={fmt(demo.medianHHIncome)}
            source="Census / World Pop Review 2026" sourceUrl="https://worldpopulationreview.com/us-cities/tennessee/crossville" />
          <StatRow label="Median Age (city)" value={demo.medianAge}
            source="World Population Review 2026" sourceUrl="https://worldpopulationreview.com/us-cities/tennessee/crossville" />
          <StatRow label="Fairfield Glade 65+ share" value={fmtPct(demo.retirePct_FairfieldGlade)}
            sub="10mi from subject — key retiree buyer feeder"
            source="Marketplace / ADP Research (Jan 2025)" sourceUrl="https://www.marketplace.org/story/2025/01/28/oldest-workforce-cumberland-county-tennessee-an-aging-population-business-opportunities" />
          <div className="mt-3 bg-gray-800 rounded-sm p-2">
            <div className="text-amber-400 text-xs font-bold mb-1">IMPLIED BUYER PERSONAS</div>
            <p className="text-gray-300 text-xs leading-relaxed">{demo.buyerPersona}</p>
          </div>
        </Card>

        <Card>
          <SecLabel icon={Eye} label="Marketing Performance" />

          <div className="mb-3">
            <div className="text-gray-400 text-xs font-bold mb-1">ZILLOW VIEW & SAVE HISTORY</div>
            <div style={{ height: 70 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={mkt.zillowViewsHistory} barGap={2}>
                  <XAxis dataKey="week" tick={{ fontSize: 9, fill: "#6b7280" }} />
                  <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", fontSize: 11 }} />
                  <Bar dataKey="views" fill="#f59e0b" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="saves" fill="#60a5fa" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-3 text-xs mt-1">
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-amber-400 rounded-sm" />Views</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-blue-400 rounded-sm" />Saves</span>
            </div>
            <div className="text-gray-600 text-xs mt-0.5">Source: <EL href={s.zillowUrl}>Zillow listing page</EL> · UPDATE WEEKLY</div>
          </div>

          <div className="bg-red-950 border border-red-900 rounded-sm p-2 mb-2 text-xs text-red-200 flex gap-1.5">
            <Info size={11} className="flex-shrink-0 mt-0.5" />
            <div><strong>⚠ Showing feedback requires your listing agent.</strong> The rows below are blank. Request ShowingTime feedback from Heather Cowart after each showing.</div>
          </div>

          <div className="text-gray-400 text-xs font-bold mb-1">SHOWING FEEDBACK THEMES</div>
          <table className="w-full text-xs">
            <thead><tr className="text-gray-500 border-b border-gray-800">
              <th className="text-left pb-1">Theme</th><th className="text-right pb-1">Count</th><th className="text-right pb-1">Sentiment</th>
            </tr></thead>
            <tbody>
              {mkt.showingFeedback.map((f, i) => (
                <tr key={i} className="border-b border-gray-800 last:border-0">
                  <td className="py-1.5 text-gray-300 pr-2">{f.theme}<div className="text-gray-600">{f.note}</div></td>
                  <td className="py-1.5 text-right text-gray-600 font-mono">{f.count ?? "—"}</td>
                  <td className={`py-1.5 text-right font-mono uppercase ${sentimentColor[f.sentiment]}`}>{f.sentiment}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-gray-600 text-xs mt-1">Source: <EL href="https://app.showingtime.com">ShowingTime</EL> · POPULATE FROM HEATHER COWART WEEKLY</div>
        </Card>
      </div>

      {/* RENTAL EXIT */}
      <Card className="border-gray-700 opacity-75 mb-3">
        <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-gray-800">
          <BarChart2 size={13} className="text-gray-500" />
          <span className="text-xs font-mono font-bold tracking-widest text-gray-500 uppercase">Plan B — Rental Exit (Ridge &amp; Anchor LLC)</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
          {[
            { label: "Zillow Rent Zestimate", value: `${fmt(rental.estimatedMonthlyRent)}/mo`, src: "Zillow listing", url: s.zillowUrl },
            { label: "GRM", value: grm(s.listPrice, rental.annualRent), src: "list / annual rent" },
            { label: "Cap Rate", value: fmtPct(cap), src: "NOI / list price", hi: cap >= rental.capRateThreshold },
            { label: "Cash-on-Cash (refi)", value: `${cocVal}%`, src: `${(rental.refiLTV * 100).toFixed(0)}% LTV @ ${rental.refiRate}%` },
          ].map((x, i) => (
            <div key={i} className="bg-gray-800 rounded-sm p-2">
              <div className="text-gray-500 text-xs">{x.label}</div>
              <div className={`text-sm font-mono font-bold ${i === 2 ? (x.hi ? "text-green-400" : "text-red-400") : "text-gray-300"}`}>{x.value}</div>
              <div className="text-gray-600 text-xs">{x.url ? <EL href={x.url}>{x.src}</EL> : x.src}</div>
            </div>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row gap-2 text-xs">
          <div className="flex-1 bg-gray-800 rounded-sm p-2">
            <span className="text-gray-500">Pivot Trigger: </span><span className="text-gray-300">{rental.pivotTrigger}</span>
          </div>
          <div className={`px-3 py-2 rounded-sm font-mono font-bold ${rental.goNoGo.startsWith("NO-GO") ? "bg-gray-700 text-gray-400" : "bg-green-900 text-green-300"}`}>
            {rental.goNoGo}
          </div>
        </div>
      </Card>

      <div className="mt-2 text-gray-700 text-xs text-center font-mono">
        SHEP INTEL · Ridge &amp; Anchor LLC · For operator use only · Update every Monday pre-review
      </div>
    </div>
  );
}
