/**
 * Deterministic, premium gradient + accent for titles that have no artwork yet,
 * so poster tiles and heroes look designed rather than blank.
 */

const PALETTES: [string, string][] = [
  ['#3a1c71', '#5b2333'],
  ['#0f2027', '#203a43'],
  ['#42275a', '#3a1c45'],
  ['#1a2a6c', '#7a1f24'],
  ['#10131a', '#2c3e50'],
  ['#2b1055', '#7597de'],
  ['#16222a', '#3a6073'],
  ['#2c0703', '#611a0c'],
  ['#1f1c2c', '#3b3a52'],
  ['#0b0b0d', '#3d1d2a'],
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function gradientCss(id: string): string {
  const h = hash(id);
  const [from, to] = PALETTES[h % PALETTES.length];
  const angle = 120 + (h % 70);
  return `linear-gradient(${angle}deg, ${from}, ${to})`;
}

/** Seed catalogue ids that have generated poster art under /public/art. */
export const ART_POSTER_IDS = Array.from(
  { length: 12 },
  (_, i) => `11111111-1111-4111-8111-${String(i + 1).padStart(12, '0')}`,
);

/** Deterministically pick a generated poster image path for any seed string. */
export function artPoster(seed: string): string {
  return `/art/posters/${ART_POSTER_IDS[hash(seed) % ART_POSTER_IDS.length]}.jpg`;
}
