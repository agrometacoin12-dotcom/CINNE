# CinneTemple — Catalogue Domain (Phase 2)

The catalogue is the product surface: browsable titles (movies & series),
curated rows, detail pages, search, and per-user watchlists. It builds on the
Phase 1 auth base and stays AWS-native and self-contained — content is seeded
into our own data tier, not pulled from a third-party API.

## Storage split

| Data | Store | Why |
|------|-------|-----|
| Titles + curated browse rows | **DynamoDB** (single table) | High read volume, predictable key-based access, scales to millions |
| Watchlist (user ↔ title) | **PostgreSQL** (Prisma) | Relational link to the user; soft delete + audit |
| Media (posters, hero art, video) | **S3** + **CloudFront** | Object storage + global CDN delivery |
| Full-text search (at scale) | **OpenSearch** | Substring scan now; index for relevance/scale later |

## DynamoDB single-table design

```
Title item        PK = TITLE#<id>     SK = META          attrs: { title, searchText }
Category member   PK = CAT#<slug>     SK = POP#<padded>#<id>   attrs: { title }
Featured hero     PK = FEATURED       SK = POP#<padded>#<id>   attrs: { title }
GSI1 (by type)    GSI1PK = TYPE#<movie|series>  GSI1SK = POP#<padded>
```

Access patterns:

- **Title detail** → `GetItem(TITLE#<id>, META)`
- **Browse row** → `Query(CAT#<slug>, begins_with(SK, "POP#"))`, `ScanIndexForward=false`
- **Hero** → `Query(FEATURED)`, limit 1
- **Search** → scan with `contains(searchText, q)` on META items (seed scale);
  replace with an OpenSearch query at production scale (titles stream → index).

Category-membership items carry a **denormalized** copy of the title summary, so
a browse row is one query with no fan-out reads — the standard single-table
pattern for read-heavy lists.

## API (Phase 2)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/v1/catalogue/browse` | public | Featured hero + curated rows |
| GET | `/v1/catalogue/search?q=` | public | Search titles |
| GET | `/v1/catalogue/titles/:id` | public | Title detail |
| GET | `/v1/watchlist` | bearer | List saved titles (enriched) |
| POST | `/v1/watchlist` | bearer | Add a title |
| DELETE | `/v1/watchlist/:titleId` | bearer | Remove a title (soft delete) |

Browse/search are public so the landing experience works pre-auth (matching the
web landing page). Watchlist requires a bearer token.

## Drivers (offline-friendly)

`CATALOGUE_DRIVER=local` (default) serves the bundled seed catalogue entirely
in-memory — no DynamoDB needed for dev/test. `CATALOGUE_DRIVER=dynamodb` uses
the table provisioned by `infrastructure/cdk` (`CatalogueStack`). Load the seed
into DynamoDB with:

```bash
CATALOGUE_DRIVER=dynamodb CATALOGUE_TABLE=cinnetemple-prod-catalogue \
AWS_REGION=us-east-1 pnpm --filter @cinnetemple/backend seed:catalogue
```

## Media

`MediaStack` provisions a private `originals` bucket (raw uploads) and a
CloudFront-fronted `delivery` path with Origin Access Control. Title records
store S3 object **keys**; the service resolves them to CDN URLs via
`MEDIA_BASE_URL`. Image/video optimization (Lambda pipeline) and signed URLs for
premium content land in Phase 3.

## Relevance search (OpenSearch)

Search is driver-swappable (`SEARCH_DRIVER`): `local` runs the repository
substring scan (offline dev); `opensearch` runs a real relevance query
(multi-match across `title^3`, `overview`, `cast^2`, `genres^2`, `director` with
`AUTO` fuzziness for typo tolerance). The `SearchStack` provisions an encrypted,
VPC-bound OpenSearch domain; the API task role is granted `es:ESHttp*`. Load the
index with `pnpm --filter @cinnetemple/backend index:catalogue`.

## Media pipeline (EventBridge → Lambda → CloudFront)

Uploads land in the private `originals` bucket. S3 emits an **Object Created**
event to **EventBridge**, which triggers the **media-optimizer Lambda** (sharp).
It generates WebP `poster` (400×600) and `hero` (1600×900) variants and writes
them to the `delivery` bucket, served via **CloudFront** with a 1-year immutable
cache. Title records reference S3 keys; the API resolves them to CDN URLs.

## GraphQL read layer

A code-first Apollo layer (`/graphql`) exposes `browse`, `title(id)`, and
`search(q)` queries, reusing `CatalogueService`. Aggregation-friendly: a client
fetches the whole browse screen (hero + rows) in one round trip and selects only
the fields it needs. REST remains the primary write/command surface.

## Next

- GraphQL for watchlist mutations; persisted queries.
- Personalized rows (per-user recommendations).
- Signed URLs for premium/video content; HLS packaging in the media pipeline.
