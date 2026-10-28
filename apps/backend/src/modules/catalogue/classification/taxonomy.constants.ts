/**
 * Fixed classification choices (docs/content-classification.md, "Other
 * choices"). Genres, tags, industries and collections are database rows; these
 * are enums or plain constants with display labels.
 */
import type { AccessType, Audience, ContentFormat } from '@prisma/client';

export const CONTENT_FORMAT_LABELS: { value: ContentFormat; label: string }[] = [
  { value: 'FEATURE_FILM', label: 'Feature Film' },
  { value: 'SHORT_FILM', label: 'Short Film' },
  { value: 'TV_SERIES', label: 'TV Series' },
  { value: 'LIMITED_SERIES', label: 'Limited Series' },
  { value: 'MINISERIES', label: 'Miniseries' },
  { value: 'DOCUMENTARY_FILM', label: 'Documentary Film' },
  { value: 'DOCUMENTARY_SERIES', label: 'Documentary Series' },
  { value: 'ANIMATION_FILM', label: 'Animation Film' },
  { value: 'ANIMATED_SERIES', label: 'Animated Series' },
  { value: 'STANDUP_COMEDY', label: 'Stand-up Comedy' },
  { value: 'LIVE_PERFORMANCE', label: 'Live Performance' },
  { value: 'SPECIAL', label: 'Special' },
  { value: 'ANTHOLOGY', label: 'Anthology' },
  { value: 'REALITY_SERIES', label: 'Reality Series' },
  { value: 'MUSIC_FILM', label: 'Music Film' },
];

/** Audience is descriptive only; `ageRating` is never inferred from it. */
export const AUDIENCE_LABELS: { value: Audience; label: string }[] = [
  { value: 'KIDS', label: 'Kids' },
  { value: 'TEENS', label: 'Teens' },
  { value: 'FAMILY', label: 'Family' },
  { value: 'ADULTS', label: 'Adults' },
];

/** Classification only: commerce still charges `priceMinor` once. */
export const ACCESS_TYPE_LABELS: { value: AccessType; label: string }[] = [
  { value: 'FREE', label: 'Free' },
  { value: 'SUBSCRIPTION', label: 'Subscription' },
  { value: 'PAY_PER_VIEW', label: 'Pay-per-view' },
  { value: 'RENTAL', label: 'Rental' },
  { value: 'PURCHASE', label: 'Purchase' },
  { value: 'PROMOTIONAL', label: 'Promotional' },
];

export const CONTENT_FORMAT_VALUES: ContentFormat[] = CONTENT_FORMAT_LABELS.map((f) => f.value);
export const AUDIENCE_VALUES: Audience[] = AUDIENCE_LABELS.map((a) => a.value);
export const ACCESS_TYPE_VALUES: AccessType[] = ACCESS_TYPE_LABELS.map((a) => a.value);

/** Suggested languages; the API accepts any 2–3 letter lower-case code. */
export const LANGUAGES: { code: string; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'yo', name: 'Yoruba' },
  { code: 'ig', name: 'Igbo' },
  { code: 'ha', name: 'Hausa' },
  { code: 'pcm', name: 'Nigerian Pidgin' },
  { code: 'fr', name: 'French' },
  { code: 'es', name: 'Spanish' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ko', name: 'Korean' },
  { code: 'ja', name: 'Japanese' },
  { code: 'zh', name: 'Mandarin' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'sw', name: 'Swahili' },
  { code: 'tw', name: 'Twi' },
  { code: 'zu', name: 'Zulu' },
];

/** Derived from the effective release year; never stored. */
export const DECADES = ['1970s', '1980s', '1990s', '2000s', '2010s', '2020s'];

/** Legacy browse-row slug every admin-saved title keeps in `categories`. */
export const NEW_LISTINGS_SLUG = 'new-listings';

export const COUNTRY_CODE_RE = /^[A-Z]{2}$/;
export const LANGUAGE_CODE_RE = /^[a-z]{2,3}$/;
export const RELEASE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Lower-case words joined by single hyphens. */
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** `contentFormat ?? (series → TV_SERIES, movie → FEATURE_FILM)`. */
export function effectiveFormat(
  type: 'MOVIE' | 'SERIES',
  contentFormat: ContentFormat | null,
): ContentFormat {
  return contentFormat ?? (type === 'SERIES' ? 'TV_SERIES' : 'FEATURE_FILM');
}

/** `accessType ?? (priceMinor === 0 ? FREE : PAY_PER_VIEW)`. */
export function effectiveAccess(accessType: AccessType | null, priceMinor: number): AccessType {
  return accessType ?? (priceMinor === 0 ? 'FREE' : 'PAY_PER_VIEW');
}
