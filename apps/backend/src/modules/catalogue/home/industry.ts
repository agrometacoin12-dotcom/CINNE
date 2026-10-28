/**
 * Automatic industry assignment (docs/content-classification.md, "Industries").
 * Pure: the caller passes the `Industry` vocabulary rows.
 */

export const INTERNATIONAL_INDUSTRY = 'international-cinema';

export interface IndustryRule {
  slug: string;
  countries: string[];
  languages: string[];
}

/**
 * Industries whose rules match a title's production countries / original
 * languages, in vocabulary order. An industry matches when (its countries are
 * empty or contain one of the title's) AND (its languages are empty or contain
 * one of the title's), with at least one of its lists non-empty. The
 * `international-cinema` fallback is added only when the title has countries
 * or languages and nothing else matched. Comparison is case-insensitive.
 */
export function deriveIndustries(
  countries: string[],
  languages: string[],
  industries: IndustryRule[],
): string[] {
  const titleCountries = new Set(countries.map((c) => c.trim().toUpperCase()).filter(Boolean));
  const titleLanguages = new Set(languages.map((l) => l.trim().toLowerCase()).filter(Boolean));
  if (titleCountries.size === 0 && titleLanguages.size === 0) return [];

  const matched: string[] = [];
  for (const industry of industries) {
    if (industry.slug === INTERNATIONAL_INDUSTRY) continue;
    const ic = industry.countries.map((c) => c.trim().toUpperCase()).filter(Boolean);
    const il = industry.languages.map((l) => l.trim().toLowerCase()).filter(Boolean);
    if (ic.length === 0 && il.length === 0) continue;
    const countryOk = ic.length === 0 || ic.some((c) => titleCountries.has(c));
    const languageOk = il.length === 0 || il.some((l) => titleLanguages.has(l));
    if (countryOk && languageOk && !matched.includes(industry.slug)) matched.push(industry.slug);
  }
  return matched.length > 0 ? matched : [INTERNATIONAL_INDUSTRY];
}
