export type PricingPreferences = {
  /**
   * BrickLink `currency_code` (ISO 4217, uppercased).
   */
  currencyCode: string;
  /**
   * BrickLink `country_code` (ISO 3166-1 alpha-2) or null for "worldwide".
   */
  countryCode: string | null;
};

export const DEFAULT_PRICING_PREFERENCES: PricingPreferences = {
  currencyCode: 'USD',
  countryCode: null,
};

export type CurrencyOption = {
  code: string;
  label: string;
};

export type CountryOption = {
  code: string | null;
  label: string;
};

/**
 * Subset of common BrickLink currencies. This can be extended over time; unknown
 * codes coming back from BrickLink are still surfaced as-is.
 */
export const BRICKLINK_CURRENCY_OPTIONS: CurrencyOption[] = [
  { code: 'USD', label: 'US Dollar (USD)' },
  { code: 'EUR', label: 'Euro (EUR)' },
  { code: 'GBP', label: 'British Pound (GBP)' },
  { code: 'CAD', label: 'Canadian Dollar (CAD)' },
  { code: 'AUD', label: 'Australian Dollar (AUD)' },
  { code: 'NZD', label: 'New Zealand Dollar (NZD)' },
  { code: 'JPY', label: 'Japanese Yen (JPY)' },
  { code: 'CHF', label: 'Swiss Franc (CHF)' },
  { code: 'SEK', label: 'Swedish Krona (SEK)' },
  { code: 'NOK', label: 'Norwegian Krone (NOK)' },
  { code: 'DKK', label: 'Danish Krone (DKK)' },
  { code: 'PLN', label: 'Polish Zloty (PLN)' },
  { code: 'CZK', label: 'Czech Koruna (CZK)' },
  { code: 'HUF', label: 'Hungarian Forint (HUF)' },
  { code: 'BRL', label: 'Brazilian Real (BRL)' },
  { code: 'MXN', label: 'Mexican Peso (MXN)' },
  { code: 'SGD', label: 'Singapore Dollar (SGD)' },
  { code: 'HKD', label: 'Hong Kong Dollar (HKD)' },
  { code: 'KRW', label: 'South Korean Won (KRW)' },
  { code: 'ZAR', label: 'South African Rand (ZAR)' },
];

/**
 * Curated set of seller-country options. BrickLink accepts many more
 * `country_code` values; this list focuses on the most relevant ones plus a
 * global "no country filter" option.
 */
export const BRICKLINK_COUNTRY_OPTIONS: CountryOption[] = [
  { code: null, label: 'Global (all sellers)' },
  { code: 'US', label: 'United States' },
  { code: 'CA', label: 'Canada' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'DE', label: 'Germany' },
  { code: 'FR', label: 'France' },
  { code: 'NL', label: 'Netherlands' },
  { code: 'BE', label: 'Belgium' },
  { code: 'AU', label: 'Australia' },
  { code: 'NZ', label: 'New Zealand' },
];

function normalizeCode(code: string | null | undefined): string | null {
  if (!code) return null;
  return String(code).trim().toUpperCase() || null;
}

export function isSupportedCurrency(code: string | null | undefined): code is string {
  const normalized = normalizeCode(code);
  if (!normalized) return false;
  return BRICKLINK_CURRENCY_OPTIONS.some(opt => opt.code === normalized);
}

export function isSupportedCountry(
  code: string | null | undefined
): code is string | null {
  const normalized = normalizeCode(code);
  if (normalized == null) return true; // global
  return BRICKLINK_COUNTRY_OPTIONS.some(opt => opt.code === normalized);
}

export function normalizePricingPreferences(
  raw: Partial<PricingPreferences> | null | undefined
): PricingPreferences {
  const fallback = DEFAULT_PRICING_PREFERENCES;
  const currencyCodeRaw = normalizeCode(raw?.currencyCode);
  const countryCodeRaw = normalizeCode(raw?.countryCode ?? null);

  const currencyCode = isSupportedCurrency(currencyCodeRaw)
    ? currencyCodeRaw
    : fallback.currencyCode;

  const countryCode = isSupportedCountry(countryCodeRaw)
    ? countryCodeRaw
    : fallback.countryCode;

  return { currencyCode, countryCode };
}

export function getRegionLabel(countryCode: string | null): string {
  if (!countryCode) return 'Global';
  const normalized = normalizeCode(countryCode);
  const match = BRICKLINK_COUNTRY_OPTIONS.find(opt => opt.code === normalized);
  return match?.label ?? normalized;
}

export function formatPricingScopeLabel(prefs: PricingPreferences): string {
  const regionLabel = getRegionLabel(prefs.countryCode);
  return `${prefs.currencyCode}/${regionLabel}`;
}


