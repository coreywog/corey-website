/**
 * Maps Plaid's own `personal_finance_category.detailed` values onto our
 * category/subcategory taxonomy — used as a fallback in lib/plaidSync.ts
 * only when the static keyword classifier (lib/merchantClassify.ts) and
 * any saved MerchantCategoryRule both come up empty. Plaid's own
 * enrichment is generally more reliable than a bare merchant-name guess,
 * so this turns a lot of "other" transactions into a real, still-unreviewed
 * guess — which also happens to be what pre-fills the Review tab's
 * category/subcategory selects (see lib/finance.ts / TransactionReviewCard).
 *
 * Not exhaustive — Plaid has 100+ detailed values. Unmapped ones fall back
 * to a generic subcategory under the right broad category (derived from
 * the detailed value's own PRIMARY_ prefix), which is still strictly
 * better than "other" since at least the umbrella category is right.
 *
 * Source: https://plaid.com/documents/transactions-personal-finance-category-taxonomy.csv
 */
const DETAILED_OVERRIDES: Record<string, { merchantCategory: string; merchantSubcategory: string }> = {
  // FOOD_AND_DRINK
  FOOD_AND_DRINK_COFFEE: { merchantCategory: "food", merchantSubcategory: "coffee_shop" },
  FOOD_AND_DRINK_FAST_FOOD: { merchantCategory: "food", merchantSubcategory: "dining" },
  FOOD_AND_DRINK_RESTAURANT: { merchantCategory: "food", merchantSubcategory: "dining" },
  FOOD_AND_DRINK_GROCERIES: { merchantCategory: "food", merchantSubcategory: "groceries" },
  FOOD_AND_DRINK_BEER_WINE_AND_LIQUOR: { merchantCategory: "food", merchantSubcategory: "alcohol" },
  FOOD_AND_DRINK_VENDING_MACHINES: { merchantCategory: "food", merchantSubcategory: "other" },

  // GENERAL_MERCHANDISE — a couple of these are more specific categories
  // than "shopping" (pets, gifts), so they're routed there instead.
  GENERAL_MERCHANDISE_PET_SUPPLIES: { merchantCategory: "pet", merchantSubcategory: "supplies" },
  GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES: { merchantCategory: "gift", merchantSubcategory: "general" },
  GENERAL_MERCHANDISE_SUPERSTORES: { merchantCategory: "shopping", merchantSubcategory: "general" },
  GENERAL_MERCHANDISE_DEPARTMENT_STORES: { merchantCategory: "shopping", merchantSubcategory: "general" },
  GENERAL_MERCHANDISE_DISCOUNT_STORES: { merchantCategory: "shopping", merchantSubcategory: "general" },
  GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES: { merchantCategory: "shopping", merchantSubcategory: "clothing" },
  GENERAL_MERCHANDISE_ELECTRONICS: { merchantCategory: "shopping", merchantSubcategory: "electronics" },
  GENERAL_MERCHANDISE_OFFICE_SUPPLIES: { merchantCategory: "shopping", merchantSubcategory: "office" },
  GENERAL_MERCHANDISE_ONLINE_MARKETPLACES: { merchantCategory: "shopping", merchantSubcategory: "online" },
  GENERAL_MERCHANDISE_CONVENIENCE_STORES: { merchantCategory: "shopping", merchantSubcategory: "convenience" },
  GENERAL_MERCHANDISE_BOOKSTORES_AND_NEWSSTANDS: { merchantCategory: "shopping", merchantSubcategory: "books" },
  GENERAL_MERCHANDISE_SPORTING_GOODS: { merchantCategory: "shopping", merchantSubcategory: "sporting_goods" },
  GENERAL_MERCHANDISE_TOBACCO_AND_VAPE: { merchantCategory: "shopping", merchantSubcategory: "tobacco" },

  // HOME_IMPROVEMENT
  HOME_IMPROVEMENT_FURNITURE: { merchantCategory: "housing", merchantSubcategory: "furniture" },
  HOME_IMPROVEMENT_HARDWARE: { merchantCategory: "housing", merchantSubcategory: "hardware" },
  HOME_IMPROVEMENT_REPAIR_AND_MAINTENANCE: { merchantCategory: "housing", merchantSubcategory: "repair" },
  HOME_IMPROVEMENT_SECURITY: { merchantCategory: "housing", merchantSubcategory: "security" },

  // MEDICAL — vet care routed to "pet" instead of "health".
  MEDICAL_DENTAL_CARE: { merchantCategory: "health", merchantSubcategory: "dental" },
  MEDICAL_EYE_CARE: { merchantCategory: "health", merchantSubcategory: "vision" },
  MEDICAL_NURSING_CARE: { merchantCategory: "health", merchantSubcategory: "nursing" },
  MEDICAL_PHARMACIES_AND_SUPPLEMENTS: { merchantCategory: "health", merchantSubcategory: "pharmacy" },
  MEDICAL_PRIMARY_CARE: { merchantCategory: "health", merchantSubcategory: "doctor" },
  MEDICAL_VETERINARY_SERVICES: { merchantCategory: "pet", merchantSubcategory: "vet" },

  // PERSONAL_CARE — gyms routed to "fitness" instead of "personal_care".
  PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS: { merchantCategory: "fitness", merchantSubcategory: "gym" },
  PERSONAL_CARE_HAIR_AND_BEAUTY: { merchantCategory: "personal_care", merchantSubcategory: "salon" },
  PERSONAL_CARE_LAUNDRY_AND_DRY_CLEANING: { merchantCategory: "personal_care", merchantSubcategory: "cleaners" },

  // GENERAL_SERVICES — several of these map better to a more specific
  // category than a generic "services" umbrella.
  GENERAL_SERVICES_AUTOMOTIVE: { merchantCategory: "car", merchantSubcategory: "service" },
  GENERAL_SERVICES_INSURANCE: { merchantCategory: "insurance", merchantSubcategory: "other" },
  GENERAL_SERVICES_STORAGE: { merchantCategory: "housing", merchantSubcategory: "storage" },
  GENERAL_SERVICES_CHILDCARE: { merchantCategory: "projects", merchantSubcategory: "childcare" },
  GENERAL_SERVICES_CONSULTING_AND_LEGAL: { merchantCategory: "projects", merchantSubcategory: "legal" },
  GENERAL_SERVICES_EDUCATION: { merchantCategory: "projects", merchantSubcategory: "education" },
  GENERAL_SERVICES_ACCOUNTING_AND_FINANCIAL_PLANNING: { merchantCategory: "projects", merchantSubcategory: "financial" },
  GENERAL_SERVICES_POSTAGE_AND_SHIPPING: { merchantCategory: "projects", merchantSubcategory: "shipping" },

  // GOVERNMENT_AND_NON_PROFIT
  GOVERNMENT_AND_NON_PROFIT_DONATIONS: { merchantCategory: "donation", merchantSubcategory: "general" },
  GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT: { merchantCategory: "taxes", merchantSubcategory: "payment" },
  GOVERNMENT_AND_NON_PROFIT_GOVERNMENT_DEPARTMENTS_AND_AGENCIES: {
    merchantCategory: "taxes",
    merchantSubcategory: "government",
  },

  // TRANSPORTATION — "gas"/"transport" match the existing manual-import
  // taxonomy (lib/merchantClassify.ts) exactly, kept consistent on purpose.
  TRANSPORTATION_GAS: { merchantCategory: "transport", merchantSubcategory: "gas" },
  TRANSPORTATION_PARKING: { merchantCategory: "transport", merchantSubcategory: "parking" },
  TRANSPORTATION_PUBLIC_TRANSIT: { merchantCategory: "transport", merchantSubcategory: "transit" },
  TRANSPORTATION_TAXIS_AND_RIDE_SHARES: { merchantCategory: "transport", merchantSubcategory: "rideshare" },
  TRANSPORTATION_TOLLS: { merchantCategory: "transport", merchantSubcategory: "tolls" },
  TRANSPORTATION_BIKES_AND_SCOOTERS: { merchantCategory: "transport", merchantSubcategory: "micromobility" },

  // TRAVEL
  TRAVEL_FLIGHTS: { merchantCategory: "travel", merchantSubcategory: "flights" },
  TRAVEL_LODGING: { merchantCategory: "travel", merchantSubcategory: "hotel" },
  TRAVEL_RENTAL_CARS: { merchantCategory: "travel", merchantSubcategory: "rental_car" },
  TRAVEL_PARKING: { merchantCategory: "travel", merchantSubcategory: "parking" },

  // RENT_AND_UTILITIES
  RENT_AND_UTILITIES_RENT: { merchantCategory: "housing", merchantSubcategory: "rent" },
  RENT_AND_UTILITIES_MORTGAGE: { merchantCategory: "housing", merchantSubcategory: "mortgage" },
  RENT_AND_UTILITIES_GAS_AND_ELECTRICITY: { merchantCategory: "utilities", merchantSubcategory: "electric_water" },
  RENT_AND_UTILITIES_WATER: { merchantCategory: "utilities", merchantSubcategory: "electric_water" },
  RENT_AND_UTILITIES_INTERNET_AND_CABLE: { merchantCategory: "utilities", merchantSubcategory: "phone_internet" },
  RENT_AND_UTILITIES_TELEPHONE: { merchantCategory: "utilities", merchantSubcategory: "phone_internet" },

  // ENTERTAINMENT
  ENTERTAINMENT_CASINOS_AND_GAMBLING: { merchantCategory: "entertainment", merchantSubcategory: "gambling" },
  ENTERTAINMENT_MUSIC_AND_AUDIO: { merchantCategory: "entertainment", merchantSubcategory: "music" },
  ENTERTAINMENT_TV_AND_MOVIES: { merchantCategory: "entertainment", merchantSubcategory: "streaming" },
  ENTERTAINMENT_VIDEO_GAMES: { merchantCategory: "entertainment", merchantSubcategory: "gaming" },
  ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS: {
    merchantCategory: "entertainment",
    merchantSubcategory: "events",
  },

  // BANK_FEES
  BANK_FEES_ATM_FEES: { merchantCategory: "fees", merchantSubcategory: "atm" },
  BANK_FEES_FOREIGN_TRANSACTION_FEES: { merchantCategory: "fees", merchantSubcategory: "foreign_transaction" },
  BANK_FEES_INTEREST_CHARGE: { merchantCategory: "fees", merchantSubcategory: "interest" },
  BANK_FEES_INSUFFICIENT_FUNDS: { merchantCategory: "fees", merchantSubcategory: "overdraft" },
  BANK_FEES_OVERDRAFT_FEES: { merchantCategory: "fees", merchantSubcategory: "overdraft" },

  // LOAN_PAYMENTS — credit card payments are already caught as "transfer"
  // upstream (lib/plaidSync.ts's classifyCategory) before merchant
  // classification ever runs, so they never reach this map.
  LOAN_PAYMENTS_MORTGAGE_PAYMENT: { merchantCategory: "housing", merchantSubcategory: "mortgage" },
  LOAN_PAYMENTS_CAR_PAYMENT: { merchantCategory: "car", merchantSubcategory: "loan" },
  LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT: { merchantCategory: "debt", merchantSubcategory: "student_loan" },
  LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT: { merchantCategory: "debt", merchantSubcategory: "personal_loan" },
};

// Fallback when the detailed value has no specific override above — maps
// just the PRIMARY_ prefix to a broad category with a generic "other"
// subcategory. Right umbrella, vague specifics — still better than "other".
const PRIMARY_FALLBACK: Record<string, string> = {
  ENTERTAINMENT: "entertainment",
  FOOD_AND_DRINK: "food",
  GENERAL_MERCHANDISE: "shopping",
  HOME_IMPROVEMENT: "housing",
  MEDICAL: "health",
  PERSONAL_CARE: "personal_care",
  GENERAL_SERVICES: "projects",
  GOVERNMENT_AND_NON_PROFIT: "taxes",
  TRANSPORTATION: "transport",
  TRAVEL: "travel",
  RENT_AND_UTILITIES: "housing",
  BANK_FEES: "fees",
  LOAN_PAYMENTS: "debt",
};

/**
 * Only meaningful when the static classifier found nothing (see
 * lib/plaidSync.ts) — this is Plaid's own best guess, still just a guess,
 * not a confirmation. Returns null for categories with no reasonable
 * mapping (income/transfer primaries never reach here anyway, gated
 * upstream by classifyCategory).
 */
export function mapPlaidCategoryToTaxonomy(
  detailed: string | null | undefined,
): { merchantCategory: string; merchantSubcategory: string } | null {
  if (!detailed) return null;
  if (DETAILED_OVERRIDES[detailed]) return DETAILED_OVERRIDES[detailed];

  const primary = Object.keys(PRIMARY_FALLBACK).find((p) => detailed.startsWith(p));
  if (!primary) return null;
  return { merchantCategory: PRIMARY_FALLBACK[primary], merchantSubcategory: "other" };
}
