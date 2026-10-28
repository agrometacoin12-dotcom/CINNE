# Content classification and rule-based homepage

Admins classify each title (movie or series) once. The homepage is a list of
sections whose rules pick titles automatically. Genres, tags, industries,
collections and homepage sections are separate vocabularies, so one title can
appear in many rows without being uploaded twice.

The Prisma models are in `apps/backend/prisma/schema.prisma` (section
"Content classification & rule-based homepage" plus the new `CatalogueTitle`
columns). That schema is the source of truth for names.

## Vocabularies

### Slugs
- Lower-case, words joined with `-`, `&` dropped: "Faith & Spirituality" → `faith-spirituality`, "Science Fiction" → `science-fiction`, "Teen & Young Adult" → `teen-young-adult`, "Reality & Unscripted" → `reality-unscripted`.
- **Subgenre slug = `<parent slug>-<subgenre slug>`**, always (e.g. `horror-psychological`, `thriller-psychological`, `crime-detective`, `mystery-detective`, `action-military`, `war-military`). This keeps repeated names unique.
- A rule naming a parent genre matches titles tagged with any of its subgenres.

### Genres (30, in this order) and subgenres
1. Action: Martial Arts, Military, Gunfights, Superheroes
2. Adventure: Jungle, Survival, Treasure Hunt, Exploration
3. Comedy: Romantic Comedy, Dark Comedy, Satire, Slapstick
4. Drama: Family Drama, Social Drama, Political Drama
5. Romance: Romantic Drama, Teen Romance, Historical Romance
6. Horror: Supernatural, Slasher, Psychological, Paranormal
7. Thriller: Psychological, Conspiracy, Mystery, Survival
8. Science Fiction: Space, AI, Time Travel, Cyberpunk, Dystopian
9. Fantasy: Magic, Mythology, Epic Fantasy, Urban Fantasy
10. Crime: Gangster, Detective, Heist, Organized Crime
11. Mystery: Whodunit, Detective, Suspense, Unsolved Cases
12. Documentary: Nature, Biography, Investigative, Historical
13. Animation: 2D, 3D, Anime, Stop Motion
14. Family: Family Adventure, Family Comedy, Inspirational
15. Musical: Music Drama, Dance, Broadway-style
16. Biography: Biographical Drama, Biopic
17. History: Historical Drama, Period Film
18. War: Military, World Wars, Civil War
19. Western: Classic Western, Neo-Western
20. Sports: Football, Boxing, Racing, Basketball
21. Faith & Spirituality: Christian, Islamic, Inspirational, Biblical
22. Politics: Political Drama, Political Thriller
23. Psychological: Mind Games, Psychological Drama
24. Disaster: Earthquakes, Floods, Apocalyptic
25. Superhero: Marvel-style, DC-style, Original Heroes
26. Teen & Young Adult: Coming-of-Age, School, Teen Drama
27. Educational: Science, Learning, Academic
28. Experimental: Avant-Garde, Art House
29. Film Noir: Classic Noir, Neo-Noir
30. Reality & Unscripted: Reality Shows, Competitions, Lifestyle

`2D` → `animation-2d`, `3D` → `animation-3d`, `AI` → `science-fiction-ai`, `Broadway-style` → `musical-broadway-style`, `Marvel-style` → `superhero-marvel-style`.

### Tags (`Tag.kind`)
- **MOOD:** Feel-Good, Emotional, Dark, Suspenseful, Heartwarming, Intense, Funny, Romantic, Inspirational, Relaxing, Thought-Provoking, Scary, Uplifting, Gritty
- **THEME:** Betrayal, Revenge, Family Conflict, Friendship, Marriage, Infidelity, Redemption, Justice, Corruption, Wealth, Poverty, Power, Survival, Jealousy, Ambition, Tradition, Spirituality, Parenthood, Coming of Age
- **SETTING:** School & Campus (`school-campus`), Village (`village`), Royalty & Kingdoms (`royalty`), Wedding (`wedding`), City Life (`city-life`)
- **CHARACTER:** Strong Female Lead (`strong-female-lead`)
- **STORY:** Based on a True Story (`true-story`), True Crime (`true-crime`)

Tag slugs are global; if a THEME and a MOOD collide, the theme wins and the mood gets `mood-` prefixed. (None collide in this list. Note `inspirational` is a MOOD tag; the genre subgenres `family-inspirational` and `faith-spirituality-inspirational` are different.)

### Industries (`Industry`, with auto-assignment rules)
| slug | name | countries | languages |
|---|---|---|---|
| nollywood | Nollywood | NG | |
| ghallywood | Ghallywood | GH | |
| bollywood | Bollywood | IN | hi |
| hollywood | Hollywood | US | |
| kannywood | Kannywood | NG | ha |
| yoruba-cinema | Yoruba Cinema | | yo |
| igbo-cinema | Igbo Cinema | | ig |
| south-african-cinema | South African Cinema | ZA | |
| african-cinema | African Cinema | all 54 African ISO codes | |
| korean-cinema | Korean Cinema | KR | |
| japanese-cinema | Japanese Cinema | JP | |
| chinese-cinema | Chinese Cinema | CN, HK, TW | |
| european-cinema | European Cinema | European ISO codes (EU + UK, NO, CH, IS, UA, RS, etc.) | |
| latin-american-cinema | Latin American Cinema | MX, central/south America, Caribbean Spanish/Portuguese | |
| middle-eastern-cinema | Middle Eastern Cinema | AE, SA, QA, KW, BH, OM, YE, IQ, IR, IL, PS, JO, LB, SY, TR, EG | |
| international-cinema | International Cinema | (fallback) | |

**Auto rule (`deriveIndustries(countries, languages)`, pure):** an industry matches when (its `countries` is empty or contains one of the title's countries) AND (its `languages` is empty or contains one of the title's original languages), with at least one of the two lists non-empty. `international-cinema` is added only when the title has countries/languages and nothing else matched. Auto rows are stored with `source = AUTO` and recomputed on every classification write; `MANUAL` rows are kept.

### Collections (`Collection`)
- **EDITORIAL:** `editors-picks` Editor's Picks, `cinnetemple-originals` CinneTemple Originals, `exclusive-premieres` Exclusive Premieres, `weekend-picks` Weekend Movie Picks, `award-winning` Award-Winning Movies, `critically-acclaimed` Critically Acclaimed, `hidden-gems` Hidden Gems, `classic-cinema` Classic Cinema, `throwback-favorites` Throwback Favorites
- **SYSTEM (legacy browse-row slugs, still written by the iOS/Android admin editors through `CatalogueTitle.categories`):** `new-listings`, `trending`, `most-watched`, `coming-soon`, `new-releases`, `acclaimed`, `series`

"Featured" stays the existing `CatalogueTitle.featured` hero flag, not a collection.

### Other choices (constants, not tables)
- **Content formats:** the `ContentFormat` enum. Labels: Feature Film, Short Film, TV Series, Limited Series, Miniseries, Documentary Film, Documentary Series, Animation Film, Animated Series, Stand-up Comedy, Live Performance, Special, Anthology, Reality Series, Music Film.
- **Audience:** KIDS, TEENS, FAMILY, ADULTS. Never infer `ageRating` from it.
- **Access type:** FREE, SUBSCRIPTION, PAY_PER_VIEW, RENTAL, PURCHASE, PROMOTIONAL. **Classification only:** commerce still charges `priceMinor` once (pay-per-view). Effective access = `accessType ?? (priceMinor === 0 ? FREE : PAY_PER_VIEW)`.
- **Languages:** en English, yo Yoruba, ig Igbo, ha Hausa, pcm Nigerian Pidgin, fr French, es Spanish, ar Arabic, hi Hindi, ko Korean, ja Japanese, zh Mandarin, pt Portuguese, sw Swahili, tw Twi, zu Zulu. The API accepts any 2–3 letter lower-case code.
- **Decades:** derived from the effective release year (1970s … 2020s); not stored.

## Effective values (used by the engine)
- format = `contentFormat ?? (type === 'series' ? TV_SERIES : FEATURE_FILM)`
- release date = `releaseDate ?? <year>-01-01`
- runtime minutes = `runtimeMinutes ?? round(durationSeconds / 60)` (series: unused)
- access = see above
- published at = `publishedAt ?? updatedAt` for published titles

## Section rules (`HomepageSection.rules`, JSON)

```ts
interface SectionRules {
  types?: ('movie' | 'series')[];
  formats?: ContentFormat[];
  genresAny?: string[];       // genre or subgenre slugs; a parent matches its subgenres
  tagsAny?: string[];
  collectionsAny?: string[];
  industriesAny?: string[];
  audiencesAny?: Audience[];
  accessAny?: AccessType[];
  minRuntimeMinutes?: number;
  maxRuntimeMinutes?: number;
  releasedWithinDays?: number;  // effective release date in [now - N days, now]
  publishedWithinDays?: number;
  releaseYearMin?: number;
  releaseYearMax?: number;
  premiere?: boolean;           // isPremiere
  upcoming?: boolean;           // true: ONLY titles not yet out (release date, premiereStartAt or availableFrom in the future)
  expiringWithinDays?: number;  // availableUntil within N days
  seriesComplete?: boolean;
  hasEpisodeWithinDays?: number;// series with an episode (with video) created in the last N days
  minPlays1d?: number;
  minPlays7d?: number;
  minPlaysAll?: number;
  anyOf?: SectionRules[];       // at least one branch must match (combined with the keys above by AND)
}
```
Keys combine with AND; values in one list combine with OR. Unknown keys are rejected by the admin API (400).

**Base eligibility for every RULE section:** `status = PUBLISHED`; inside the rights window (`availableFrom` null or ≤ now, `availableUntil` null or > now); playable (movie has `videoKey`, series has ≥ 1 episode with a video). `upcoming: true` sections skip the "out now"/playable checks but still require PUBLISHED. Excluded ids are removed; pinned ids (if eligible) lead the row in pinned order, then the rest by `sort`, then cut to `limit`.

**Plays:** a verified play = an `Entitlement` with `startedAt` set (movies and series tickets) plus an `EpisodePlayback` with `startedAt` set. `plays1d` / `plays7d` / `playsAll` count those whose `startedAt` falls in the window.

**Sorts:** POPULARITY (`popularity` desc, then playsAll), PUBLISHED_DESC, RELEASE_DESC, RELEASE_ASC, RATING_DESC, PLAYS_1D / PLAYS_7D / PLAYS_ALL (ties → popularity), LATEST_EPISODE (newest episode with video), EXPIRING_SOON (`availableUntil` asc), MANUAL (position inside the first collection named in `collectionsAny`, then `addedAt`). Final tiebreak: title id, so output is stable.

## Homepage (`GET /v1/catalogue/browse`)
Response shape is unchanged: `{ hero, rows: [{ slug, title, items: TitleSummaryDto[] }] }`. Rows = enabled RULE sections in `position` order whose eligible count (after pins/excludes, before `limit`) is ≥ `minItems`, capped at `HOME_MAX_ROWS` (env, default 18). Personal kinds (CONTINUE_WATCHING, WATCHLIST, RECOMMENDED, BECAUSE_YOU_WATCHED) are skipped here because the apps already fetch those rails. Hero = the featured title, as today. Results may be cached in memory for up to 60 s. With `CATALOGUE_DRIVER != prisma` the old `BROWSE_ROWS` behaviour is kept.

## Seeded sections (positions in this order)
Launch sections first; later ones only fill in once the library grows (they sit beyond the 18-row cap or under their `minItems`). All are `enabled: true` unless marked. `min` = `minItems`, `lim` = `limit` (default 20).

| # | slug | title | kind / sort | rules | min |
|---|---|---|---|---|---|
| 1 | continue-watching | Continue Watching | CONTINUE_WATCHING | | 1 |
| 2 | newly-added | Newly Added | PUBLISHED_DESC | `{}` | 1 |
| 3 | trending-now | Trending Now | PLAYS_7D | `{anyOf:[{collectionsAny:["trending"]},{minPlays7d:1}]}` | 4 |
| 4 | top-10-week | Top 10 This Week | PLAYS_7D, lim 10 | `{minPlays7d:1}` | 5 |
| 5 | exclusive-premieres | Exclusive Premieres | RELEASE_DESC | `{anyOf:[{collectionsAny:["exclusive-premieres"]},{premiere:true}]}` | 1 |
| 6 | coming-soon | Coming Soon | RELEASE_ASC | `{anyOf:[{upcoming:true},{collectionsAny:["coming-soon"]}]}` | 1 |
| 7 | nollywood-blockbusters | Nollywood Blockbusters | POPULARITY | `{industriesAny:["nollywood"]}` | 4 |
| 8 | action-packed | Action-Packed Movies | POPULARITY | `{genresAny:["action"]}` | 4 |
| 9 | laugh-out-loud | Laugh Out Loud | POPULARITY | `{genresAny:["comedy"]}` | 4 |
| 10 | love-romance | Love & Romance | POPULARITY | `{genresAny:["romance"]}` | 4 |
| 11 | thrillers | Edge-of-Your-Seat Thrillers | POPULARITY | `{genresAny:["thriller"]}` | 4 |
| 12 | binge-worthy-series | Binge-Worthy Series | POPULARITY | `{types:["series"]}` | 2 |
| 13 | recently-added-episodes | Recently Added Episodes | LATEST_EPISODE | `{types:["series"],hasEpisodeWithinDays:30}` | 2 |
| 14 | family-movie-night | Family Movie Night | POPULARITY | `{anyOf:[{genresAny:["family"]},{audiencesAny:["FAMILY","KIDS"]}]}` | 4 |
| 15 | free-to-watch | Free to Watch | POPULARITY | `{accessAny:["FREE","PROMOTIONAL"]}` | 2 |
| 16 | african-stories | African Stories | POPULARITY | `{industriesAny:["african-cinema"]}` | 4 |
| 17 | editors-picks | Editor's Picks | MANUAL | `{collectionsAny:["editors-picks"]}` | 3 |
| 18 | your-watchlist | Your Watchlist | WATCHLIST | | 1 |
| 19 | latest-releases | Latest Releases | RELEASE_DESC | `{anyOf:[{releasedWithinDays:365},{collectionsAny:["new-releases"]}]}` | 4 |
| 20 | top-10-today | Top 10 Movies Today | PLAYS_1D, lim 10 | `{types:["movie"],minPlays1d:1}` | 5 |
| 21 | most-watched | Most Watched | PLAYS_ALL | `{anyOf:[{collectionsAny:["most-watched"]},{minPlaysAll:1}]}` | 4 |
| 22 | popular | Popular on CinneTemple | POPULARITY | `{}` | 8 |
| 23 | recommended | Recommended for You | RECOMMENDED (enabled false) | | 4 |
| 24 | because-you-watched | Because You Watched… | BECAUSE_YOU_WATCHED (enabled false) | | 4 |
| 25 | cinnetemple-originals | CinneTemple Originals | MANUAL | `{collectionsAny:["cinnetemple-originals"]}` | 3 |
| 26 | horror-nights | Horror Nights | POPULARITY | `{genresAny:["horror"]}` | 4 |
| 27 | crime-investigation | Crime & Investigation | POPULARITY | `{anyOf:[{genresAny:["crime","mystery"]},{tagsAny:["true-crime"]}]}` | 4 |
| 28 | faith-inspiration | Faith & Inspiration | POPULARITY | `{anyOf:[{genresAny:["faith-spirituality"]},{tagsAny:["inspirational","spirituality"]}]}` | 4 |
| 29 | based-on-true-stories | Based on True Stories | POPULARITY | `{tagsAny:["true-story"]}` | 4 |
| 30 | hollywood-hits | Hollywood Hits | POPULARITY | `{industriesAny:["hollywood"]}` | 4 |
| 31 | korean-dramas | Korean Dramas | POPULARITY | `{industriesAny:["korean-cinema"],genresAny:["drama"]}` | 4 |
| 32 | bollywood-favorites | Bollywood Favorites | POPULARITY | `{industriesAny:["bollywood"]}` | 4 |
| 33 | award-winning | Award-Winning Movies | MANUAL | `{collectionsAny:["award-winning"]}` | 3 |
| 34 | critically-acclaimed | Critically Acclaimed | RATING_DESC | `{collectionsAny:["critically-acclaimed","acclaimed"]}` | 3 |
| 35 | hidden-gems | Hidden Gems | MANUAL | `{collectionsAny:["hidden-gems"]}` | 3 |
| 36 | weekend-picks | Weekend Movie Picks | MANUAL | `{collectionsAny:["weekend-picks"]}` | 3 |
| 37 | under-90-minutes | Movies Under 90 Minutes | POPULARITY | `{types:["movie"],maxRuntimeMinutes:90}` | 4 |
| 38 | epic-movies | Epic Movies | POPULARITY | `{types:["movie"],minRuntimeMinutes:150}` | 4 |
| 39 | complete-series | Complete Series | POPULARITY | `{types:["series"],seriesComplete:true}` | 3 |
| 40 | classic-cinema | Classic Cinema | RELEASE_ASC | `{collectionsAny:["classic-cinema"]}` | 3 |
| 41 | throwback-favorites | Throwback Favorites | POPULARITY | `{anyOf:[{collectionsAny:["throwback-favorites"]},{releaseYearMin:1990,releaseYearMax:2010}]}` | 4 |
| 42 | strong-female-leads | Strong Female Leads | POPULARITY | `{tagsAny:["strong-female-lead"]}` | 4 |
| 43 | supernatural-stories | Supernatural Stories | POPULARITY | `{genresAny:["horror-supernatural","horror-paranormal"]}` | 4 |
| 44 | high-school-campus | High School & Campus | POPULARITY | `{anyOf:[{tagsAny:["school-campus"]},{genresAny:["teen-young-adult-school"]}]}` | 4 |
| 45 | weddings-relationships | Weddings & Relationships | POPULARITY | `{tagsAny:["wedding","marriage","infidelity"]}` | 4 |
| 46 | royalty-kingdoms | Royalty & Kingdoms | POPULARITY | `{tagsAny:["royalty"]}` | 4 |
| 47 | village-stories | Village Stories | POPULARITY | `{tagsAny:["village"]}` | 4 |
| 48 | revenge-betrayal | Revenge & Betrayal | POPULARITY | `{tagsAny:["revenge","betrayal"]}` | 4 |
| 49 | money-power-ambition | Money, Power & Ambition | POPULARITY | `{tagsAny:["wealth","power","ambition"]}` | 4 |
| 50 | premium-premieres | Premium Premieres | PUBLISHED_DESC | `{accessAny:["PAY_PER_VIEW","RENTAL","PURCHASE"],anyOf:[{premiere:true},{publishedWithinDays:90}]}` | 4 |
| 51 | limited-time | Limited-Time Releases | EXPIRING_SOON | `{expiringWithinDays:30}` | 2 |

## Admin API (all under `/v1/admin`, `AdminGuard`)

**`GET taxonomy`** →
```ts
{
  genres: { slug: string; name: string; subgenres: { slug: string; name: string }[] }[];
  tags: { slug: string; name: string; kind: 'MOOD'|'THEME'|'SETTING'|'CHARACTER'|'STORY' }[];
  industries: { slug: string; name: string }[];
  collections: { slug: string; name: string; kind: 'EDITORIAL'|'SYSTEM' }[];
  formats: { value: ContentFormat; label: string }[];
  audiences: { value: Audience; label: string }[];
  accessTypes: { value: AccessType; label: string }[];
  languages: { code: string; name: string }[];
  decades: string[];
}
```

**`GET titles/:id/classification`** and **`PUT titles/:id/classification`** (movies and series; 404 for unknown id).
```ts
interface ClassificationInput {          // undefined = unchanged, null = clear
  contentFormat?: ContentFormat | null;
  genres?: string[];                     // genre/subgenre slugs, selection order kept
  tags?: string[];
  collections?: string[];
  industries?: string[];                 // MANUAL industries only
  audience?: Audience | null;
  ageRating?: string | null;
  ratingJurisdiction?: string | null;
  releaseDate?: string | null;           // 'YYYY-MM-DD'
  accessType?: AccessType | null;
  productionCountries?: string[];        // upper-cased by the server
  originalLanguages?: string[];          // lower-cased by the server
  audioLanguages?: string[];
  availableFrom?: string | null;         // ISO timestamp
  availableUntil?: string | null;
  seriesComplete?: boolean;
}
interface ClassificationDto {
  titleId: string;
  type: 'movie' | 'series';
  contentFormat: ContentFormat | null;
  effectiveFormat: ContentFormat;
  genres: string[]; tags: string[]; collections: string[];
  industries: { slug: string; name: string; source: 'manual' | 'auto' }[];
  audience: Audience | null; ageRating: string | null; ratingJurisdiction: string | null;
  releaseDate: string | null; accessType: AccessType | null; effectiveAccess: AccessType;
  productionCountries: string[]; originalLanguages: string[]; audioLanguages: string[];
  availableFrom: string | null; availableUntil: string | null; seriesComplete: boolean;
  /** Every enabled RULE section whose rules match this title. */
  placement: { slug: string; title: string; eligible: boolean; reason?: string }[];
}
```
Unknown slugs → 400 naming them. `availableUntil` ≤ `availableFrom` → 400. Every write runs in one transaction, replaces the join rows for the lists it was given, recomputes AUTO industries, and mirrors legacy columns: `CatalogueTitle.genres` = names of the selected top-level genres (a subgenre contributes its parent's name), deduplicated, in order; `CatalogueTitle.categories` = selected collection slugs plus `new-listings`. It also records an audit entry `admin.title.classify`. `placement.reason` explains a base-eligibility failure, e.g. "Not published", "No video yet", "Outside its availability window".

**Legacy sync:** the existing movie/series create/update endpoints still accept `genres` (free text names) and `categories` (slugs). After they save, call `ClassificationService.syncLegacy(titleId, { genres?, categories? })`: names are matched case-insensitively to genre names/slugs into `TitleGenre` (unknown names are kept only in the legacy column), and category slugs that exist as collections replace `TitleCollection` rows.

**`publishedAt`:** set to now the first time a title's status becomes published (movie and series update paths). The migration backfills it from `updated_at` for titles already published.

**Homepage sections**
- `GET home-sections` → `HomeSectionDto[]` in position order: `{ id, slug, title, kind, rules, sort, limit, minItems, enabled, position, pinnedTitleIds, excludedTitleIds, eligibleCount: number | null, live: boolean }` (`eligibleCount` null for personal kinds; `live` = would show on browse right now).
- `PATCH home-sections/:id` with any of `{ title, enabled, sort, limit (1–50), minItems (1–50), rules, pinnedTitleIds, excludedTitleIds }` → `HomeSectionDto`. Rules are validated against `SectionRules`; pinned/excluded ids must be existing titles.
- `PUT home-sections/order` `{ ids: string[] }` (every section id exactly once) → `HomeSectionDto[]`.
- `GET home-preview` → `{ rows: { slug, title, count, items: TitleSummaryDto[] }[]; hidden: { slug, title, reason: string }[] }` — exactly what browse would return, plus why each other section is hidden ("Disabled", "Only 2 of 4 titles", "Over the 18-row limit", "Shown in the app's own rail").
- `POST collections` `{ slug, name, description? }` (EDITORIAL) and `PATCH collections/:slug` `{ name?, description? }`.
- Every write records an audit entry (`admin.home-section.update`, `admin.home-section.reorder`, `admin.collection.create`, `admin.collection.update`) and clears the browse cache.

## Backend module layout
- `apps/backend/src/modules/catalogue/home/section-rules.ts` — pure types and functions: `SectionRules`, `parseSectionRules(json): SectionRules` (throws `Error` with a message on unknown keys / bad types), `HomeCandidate` (one title's effective values, slug sets, plays, latest episode time, playable flag), `baseEligibility(c, now): string | null` (null = eligible, otherwise the reason), `matchesRules(c, rules, now, genreParents)`, `buildSection(section, candidates, now, genreParents): { items: HomeCandidate[]; eligibleCount: number }`.
- `.../home/industry.ts` — pure `deriveIndustries(countries, languages, industries)`.
- `.../home/home.service.ts` — `HomeService` (in `CatalogueModule`, exported): `rows()` for browse, `preview()`, `sectionsWithCounts()`, `placementFor(titleId)`, `invalidate()`. Loads published titles with their classification joins, play counts and episode stats through Prisma in a few queries.
- `.../classification/` — taxonomy constants (formats, audiences, access types, languages, labels), `ClassificationService` (read/write/syncLegacy), exported from `CatalogueModule`.
- Admin controllers in `apps/backend/src/modules/admin/`: `admin-classification.controller.ts`, `admin-home.controller.ts` (+ DTOs).
- Migration `apps/backend/prisma/migrations/20261028090000_content_classification/migration.sql`: new enums/tables/columns, backfill `published_at`, seed every vocabulary row and every section above with `INSERT … ON CONFLICT (slug) DO NOTHING`, and map existing free-text `genres` and `categories` values onto the join tables.
