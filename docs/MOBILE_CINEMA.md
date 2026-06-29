# Mobile Cinema — Admin uploads, pay-per-view, premieres

The mobile-cinema layer turns the catalogue into a ticketed cinema: an admin uploads
films and sets pricing, members pay once to watch once (for the film's runtime),
they can gift tickets to other members, and admins can schedule live premieres with
in-room chat. Streams carry a per-viewer watermark and best-effort anti-piracy
deterrents.

## Business model

- **Pay once, view once.** A purchase creates an *entitlement*. The viewing window
  opens on first play and lasts the movie's runtime (+30 min pause grace), then locks.
- **Gifting.** A buyer can pay for another CinneTemple member by entering their email;
  the entitlement is granted to the recipient.
- **Premieres.** A title can be flagged as a premiere with a showtime. It is "live"
  from the showtime until the runtime elapses; live chat is open to ticket holders
  during that window.

## Roles

- Admin = JWT `admin` role **or** email listed in `ADMIN_EMAILS` (bootstrap).
- `GET /v1/auth/me` returns `isAdmin`; the web shows the **Studio** nav + `/admin`
  pages only to admins.

## New backend surface (`/v1`)

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| GET | `/admin/movies` | admin | List all titles incl. drafts |
| POST | `/admin/movies` | admin | Create a movie |
| PATCH | `/admin/movies/:id` | admin | Update (incl. price) |
| PUT | `/admin/movies/:id/featured` | admin | Set/clear featured hero |
| PUT | `/admin/movies/:id/premiere` | admin | Schedule/cancel premiere |
| POST | `/admin/uploads/presign` | admin | Presigned S3 PUT (video/poster/hero) |
| POST | `/purchases` | user | Buy / gift a pay-per-view |
| GET | `/purchases/verify?reference=` | user | Confirm a payment |
| GET | `/entitlements` | user | My tickets |
| POST | `/payments/webhook` | public | Paystack webhook (HMAC-verified) |
| POST | `/playback/:id/start` | user | Authorize playback, open view window |
| GET | `/playback/:id/status` | user | Access state |
| GET | `/premieres` | public | Premieres rail |
| GET | `/premieres/:id/room` | user | Live state + chat eligibility |
| GET/POST | `/premieres/:id/chat` | user | Live chat (poll `?since=`) |

## Data model (Postgres / Prisma)

New models: `Purchase`, `Entitlement`, `PremiereChatMessage` (+ enums
`PaymentProvider`, `PurchaseStatus`, `EntitlementStatus`). Catalogue `Title` gained
`status`, `priceMinor`, `currency`, `videoKey`, `durationSeconds`, `isPremiere`,
`premiereStartAt` (stored in the catalogue store — local seed / DynamoDB).

> A DB migration is required:
> `pnpm --filter @cinnetemple/backend prisma migrate dev --name mobile_cinema`
> The container entrypoint runs `prisma migrate deploy` on deploy.

## Payments

`PAYMENT_DRIVER` selects the provider (Strategy pattern):

- `mock` (default) — full purchase → entitlement flow with no PSP, for local dev.
- `paystack` — web checkout. Set `PAYSTACK_SECRET_KEY` / `PAYSTACK_PUBLIC_KEY`.
  Webhook: point Paystack at `https://api.cinnetemple.com/v1/payments/webhook`.

iOS will add an Apple In-App Purchase verifier behind the same `PaymentDriver`
interface.

## Environment

```
PAYMENT_DRIVER=paystack            # or mock
PAYSTACK_SECRET_KEY=sk_live_xxx    # server-only, from Secrets Manager
PAYSTACK_PUBLIC_KEY=pk_live_xxx
DEFAULT_CURRENCY=NGN
ADMIN_EMAILS=ogban@icloud.com      # bootstrap admin(s)
MEDIA_ORIGINALS_BUCKET=cinnetemple-dev-media-originals-267451756200
WEB_BASE_URL=https://cinnetemple.com
MEDIA_URL_TTL=14400
```

When `MEDIA_ORIGINALS_BUCKET` is unset (local dev) the admin upload falls back to
entering an object key by hand; the player resolves keys against `MEDIA_BASE_URL`.

## iOS (SwiftUI)

- **Checkout** — paid tickets use StoreKit 2 (`TicketStore`): consumable price-tier
  products (`com.cinnetemple.ticket.tierN`, created in App Store Connect) are
  purchased on-device, then the signed JWS transaction is verified server-side at
  `POST /v1/purchases/apple`, which grants the entitlement. Free titles and gifting
  use the server purchase flow. Set `APPLE_BUNDLE_ID` on the API to bind the bundle.
- **Player** — `SecurePlayerView` (AVKit) gates on the server entitlement, blanks
  the picture while the screen is recorded/mirrored (`UIScreen.isCaptured`), burns a
  drifting per-viewer watermark, and enforces the single-view window with a
  countdown + lockout. Screenshot taps are detected via
  `userDidTakeScreenshotNotification`. (FairPlay DRM excludes content from capture
  entirely — the next hardening step.)
- **Premieres** — `PremieresView` lists live/upcoming; `PremiereView` plays when live
  + entitled and runs a polled live chat for ticket holders. `TicketsView` lists
  entitlements. New tabs: Premieres, Tickets.

> The Apple verify endpoint currently decodes + structurally validates the JWS.
> Production must verify the x5c certificate chain against Apple's root CA (App
> Store Server Library) before trusting it — marked with a TODO in `commerce.service`.

## Anti-piracy (web)

True screenshot / screen-record blocking is only enforceable on native iOS. The web
player applies: a drifting per-viewer watermark (email + a per-title hash), a fixed
corner watermark, `controlsList=nodownload noremoteplayback`, disabled PiP,
right-click + text-selection disabled, and auto-pause when the tab loses focus.
FairPlay/Widevine DRM + CloudFront-signed URLs are the next hardening step (hook in
`MediaService.playbackUrl`).
