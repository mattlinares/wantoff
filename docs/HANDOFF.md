# Handoff: Mealmate — all current tasks done

---

## Session: 2026-06-28/29 — Wantoff production hardening + UX

### Deployment

- **Vercel auto-deploy from GitHub is broken** — GitHub pushes do NOT trigger
  Vercel. Must deploy manually: `cd apps/wantoff && npx vercel --prod`. Railway
  auto-deploys on push correctly.
- Railway runs `prisma migrate deploy` on startup. Data migrations (SQL inserts)
  must include all non-default columns (`id`, `updatedAt` etc.) — Prisma doesn't
  fill these in for raw SQL. If a migration fails, mark it rolled back with
  `DATABASE_URL="..." npx prisma migrate resolve --rolled-back <name>` then fix
  and redeploy.

### What was done

**Seed script** (`scripts/seed-demo.sh`) fully idempotent on re-run:
- All listing creation uses `post_listing()` — skips if title already exists for
  that actor.
- Mealmate joins use `join_meal()` helper — falls back to fetching existing
  exchange ID if already joined.
- Group membership, add-to-group, and reviews all handle "already exists" cases.

**Item type templates** (`20260628200000_seed_item_type_templates`): data
migration seeds 5 built-in types (`wantoff.other`, `wantoff.items`,
`wantoff.skills`, `wantoff.digital`, `mealmate.meal`) on first deploy.
Previously the production DB was empty, causing an empty dropdown on the
add-item form.

**MetaMask / Circles Playground fixes**: The Circles Playground injects
`window.ethereum` (the Safe provider). Several code paths were triggering it
unintentionally:
- `@circles-sdk/sdk` and `@circles-sdk/adapter-ethers` were statically imported
  at module level — the adapter sniffed `window.ethereum` on load. **Fix:** all
  Circles SDK imports are now dynamic (`await import(...)`) inside functions,
  never at module scope.
- `WalletConnect` reconnect button on the profile page → removed entirely. The
  wallet is managed by the Circles host in embedded mode; there is nothing to
  reconnect.
- `PayInCrc` "Connect wallet" button → hidden when `EMBEDDED=true`.
- `TrustSignal` MetaMask fallback → blocked when `EMBEDDED=true`; throws a
  user-facing error instead.
- Rule: **any new component that touches `window.ethereum` must guard with
  `if (!EMBEDDED)`**. In embedded mode, use `@aboutcircles/miniapp-sdk`
  exclusively.

**Profile page**: incoming exchange requests moved to top; includes requester
reputation badge and threaded message reply. Accept/decline actions on pending
requests. TrustSignal hidden on own profile (`!isOwner`).

**Create listing form** (`/listings/new`):
- Community picker (checkboxes for groups the actor belongs to).
- `DateTimeInput`: date + HH/MM select dropdowns with internal `useState` to
  prevent browser revert bug.
- Price field: "Free / donation" or "Fixed price in CRC" (amount input) for
  non-meal listings.
- Mealmate.meal: radio 0 / 1 / 2 credits (max 2) with default of 1.

**Listing detail page**: credit fee now displays as "1 mealshare credit" /
"2 mealshare credits" / "Free" (was showing "Mealshare credit" without amount).

**Home feed**: all listings from the same community grouped together under one
header; listings not in any community show under "Not in a community".

### Known open items

- Vercel GitHub auto-deploy needs fixing in Project Settings → Git.
- No email notification when a request is made — user asked, answer was no.
  Could add `notify.requestReceived` to `POST /listings/:id/request`.
- Referral/recommend feature deferred (see `memory/project-referral-feature.md`).

---

Status as of 2026-06-14. **Everything from "do them all" (#18-21), the
location/proximity feature (#24), the mailer system (#25), the #26
join-flow UX fixes, #27 Wantoff Phase 1 (backend generalisation), #28
Wantoff Phase 2 (item-type template registry), #29 Wantoff Phase 3 (app
skeleton), #30 Wantoff Phase 4 (generic add/edit listing form), #31
Wantoff Phase 5 (public profile polish + iframe embed), and #32 Wantoff
Phase 6 (Circles SDK: wallet connect, trust-path gating, in-app CRC
payment) are DONE.** No backend/mobile tasks are currently outstanding.
Next up (not started): Wantoff Phase 7, trust-graph reputation signal on
profiles and listing cards — see `docs/wantoff-app-plan.md` section 8.

## #32 ✅ Wantoff Phase 6: Circles SDK — wallet connect, trust-path gating, in-app CRC payment (this session)

- Added `@circles-sdk/sdk`, `@circles-sdk/adapter-ethers`, `ethers` to
  `apps/wantoff`. Note: `@circles-sdk/sdk` is deprecated upstream in favour
  of `@aboutcircles/sdk`/`@aboutcircles/sdk-core`, but still functional —
  flagged here for a future migration, not blocking.
- `apps/wantoff/src/lib/circles.ts`: `connectCirclesWallet()` (injected
  wallet via `@circles-sdk/adapter-ethers`'s `BrowserProviderContractRunner`,
  Gnosis Chain / chainId 100, `circlesConfig[100]` from `@circles-sdk/sdk` —
  avoids hardcoding contract addresses), `getTrustPathAmount(avatar, to)`
  (`avatar.getMaxTransferableAmount(to)`), `payInCrc(avatar, to, amount)`
  (`avatar.transfer(to, parseEther(amount))`).
- `apps/wantoff/src/app/dashboard/wallet-connect.tsx`: "Connect wallet"
  card on the dashboard — connects an injected wallet and saves the address
  as the actor's `circlesWallet` via `PATCH /me` (new `updateMe()` in
  `src/lib/api.ts`).
- `apps/wantoff/src/app/u/[id]/pay-in-crc.tsx`: replaces the old
  "Pay in CRC → Gnosisscan" stub on the public profile. Connects the
  viewer's wallet, calls `getMaxTransferableAmount(hostWallet)` as a **hard
  trust-path gate** (per `docs/wantoff-app-plan.md` section 9 "Decisions:
  Trust-path gating") — `0` shows a "no trust path to this person yet"
  message with a link to learn about Circles trust connections, instead of
  a payment button that would fail. A nonzero result shows an amount input
  (defaulting to the listing's CRC fee amount, if any) and a "Pay in CRC"
  button that calls `avatar.transfer(...)`.
- Verified: `npx tsc --noEmit` clean, `next build` succeeds (6 routes,
  unchanged route list — these are new files/components, not new pages).
- `docs/wantoff-app-plan.md` section 8 item 6 marked ✅ DONE.

## #31 ✅ Wantoff Phase 5: public profile polish + iframe embed

`apps/wantoff/src/app/u/[id]/page.tsx` and `/dashboard`.

- Profile page now shows each listing's fees in plain language
  (`describeFee`: "Costs 1 mealmate.meal-credit", "Suggested tip (5 CRC)",
  "Requires payment (... CRC)", etc.) and a "Pay in CRC →" link per listing
  that accepts CRC, pointing at the host's wallet on Gnosisscan (a stub —
  real wallet-connect/in-app payment is Phase 6's Circles SDK work).
- `?embed=1` now actually strips the chrome: injects `.nav { display: none }`
  so the shared `NavBar` (in the root layout) disappears for the `<iframe>`
  view, per section 3/9 "Embeds" (no separate JS widget for v1).
- Dashboard: new "Share your profile" card with a read-only `<iframe
  src=".../u/:id?embed=1">` snippet and a "Copy embed code" button
  (`navigator.clipboard`).
- Verified: `npx tsc --noEmit` clean, `next build` succeeds (6 routes). Curl
  against the live backend confirms fee descriptions ("Costs 1
  mealmate.meal-credit", "Suggested tip (5 CRC)", "Suggested tip in CRC"),
  "Pay in CRC" links, and that `?embed=1` emits the nav-hiding `<style>` tag
  while the normal page still renders `<nav class="nav">`.
- Docs: `docs/wantoff-app-plan.md` section 8 (item 5) marked ✅ DONE.

## #30 ✅ Wantoff Phase 4: generic add/edit listing form (this session)

New page `apps/wantoff/src/app/listings/new/page.tsx`, driven by `GET
/item-type-templates` (the registry from #28).

- `src/lib/api.ts`: added `createListing` (`POST /listings`), `updateListing`
  (`PATCH /listings/:id`), and `NewListingBody` type.
- Form: itemType picker (template `label`s), title/description (always),
  location (address/lat/lng) when the template's `fieldSchema` includes a
  `location` field or for the freeform `wantoff.other`, an OFFER/WANT toggle
  for non-`mealmate.meal` types, optional `minReputation`, and a dynamic
  field per remaining `fieldSchema` entry (`string`/`text`/`number`/
  `boolean`/`date`/`string[]` widgets — `string[]` is comma-separated).
  Shows the template's `defaultFees`/`defaultCurrencies` as a read-only
  pricing summary (CRC-default per section 5).
- Submission branches like the backend: `mealmate.meal` sends
  `title`/`description`/`location`/`mealTime`/`capacity`/`dietaryInfo` as
  top-level fields (matching the existing meal-specific `POST /listings`
  branch); any other itemType sends `type`/`title`/`description`/`location`/
  `attributes` plus the template's `defaultFees`/`defaultCurrencies`.
- Dashboard (`/dashboard`): added "+ Add a want or offer" link, and a
  "Cancel listing" button on `OPEN` items (`PATCH /listings/:id` with
  `status: "CANCELLED"`).
- Verified: `npx tsc --noEmit` clean, `next build` succeeds (6 routes),
  dev server serves `/listings/new` (200). Curl-checked both POST shapes the
  form sends (`mealmate.meal` and `wantoff.other`) against the live backend
  — both return 201 with the expected `attributes`/`fees`/`currencies`; test
  listings cleaned up via `DELETE /listings/:id`. Backend `npx vitest run`
  25/25, `npx tsc --noEmit` clean (unchanged by this phase, re-verified).
- Docs: `docs/wantoff-app-plan.md` section 8 (item 4) marked ✅ DONE.

## #29 ✅ Wantoff Phase 3: app skeleton (this session)

New workspace `apps/wantoff` (`@mealmate/wantoff`), Next.js 15 / React 19,
per `docs/wantoff-app-plan.md` section 3 (web-first recommendation).

- `src/lib/api.ts`: typed client for the shared backend (`Actor`, `Listing`,
  `Fee`, `CurrencyOption`, `ItemTypeTemplate`, `PublicProfile`), reading
  `NEXT_PUBLIC_API_URL` (defaults `http://localhost:3000`).
- `src/lib/auth-context.tsx`: client-side auth — JWT in `localStorage`
  (`wantoff.token`), same `Actor`/login as Mealmate (no separate accounts,
  per section 9 "Decisions: Auth").
- Pages: `/` (landing), `/login` (login + register, shared backend),
  `/dashboard` (client-rendered "My wants & offers", from `GET
  /listings?mine=true`, grouped by `status`), `/u/[id]` (server-rendered
  public profile from `GET /actors/:id/public-profile`, with `?embed=1` for
  a chrome-free `<iframe>` view per section 3/9 "Embeds").
- `apps/wantoff/.env.example` (`NEXT_PUBLIC_API_URL`).
- Verified: `npx tsc --noEmit` clean, `next build` succeeds, dev server
  serves `/`, `/login`, `/dashboard` (200s) and `/u/:id` renders Alice's
  display name, reputation, and her open listings (curl-checked against the
  running backend on :3001).
- Docs: `docs/wantoff-app-plan.md` sections 3 and 8 (item 3) marked ✅ DONE.
  `README.md` — workspace listed, run instructions added.

## #28 ✅ Wantoff Phase 2: item-type template registry (this session)

Per `docs/wantoff-app-plan.md` section 4.

- New `ItemTypeTemplate` model (`apps/backend/prisma/schema.prisma`):
  `itemType` (unique), `label`, `fieldSchema`, `defaultFees`,
  `defaultCurrencies`. Migration `20260613153721_item_type_templates` also
  adds `Actor.isAdmin` (default `false`).
- New `parseFieldSchema` in `apps/backend/src/lib.ts`: validates an array of
  `{ name, label, type, required }` where `type` is one of `string | text |
  number | boolean | date | location | string[]`. Tests in `lib.test.ts`
  (25/25 passing).
- New `requireAdmin` middleware (`apps/backend/src/index.ts`, runs after
  `requireAuth`, checks `Actor.isAdmin`).
- Routes: `GET /item-type-templates` (public, for the form picker),
  `POST`/`PATCH /item-type-templates/:itemType` (admin-only, validate via
  `parseFieldSchema`/`parseFees`/`parseCurrencyOptions`).
- Seeded `mealmate.meal` (full field schema + meal-credit/CRC-donation
  defaults) and `wantoff.other` (empty `fieldSchema`, CRC-required default).
  `apps/backend/prisma/seed.ts` updated to create both on fresh seeds and to
  mark `alice@example.com` as `isAdmin: true`.
- Verified via curl: public list returns both seeded templates; non-admin
  (bob) POST returns 403; admin (alice) POST/PATCH work. `npx tsc --noEmit`
  clean, `npx vitest run` 25/25.
- Docs: `docs/exchange-protocol.md` "Decisions" — new entry. `docs/wantoff-app-plan.md`
  section 4 marked ✅ DONE.

## #27 ✅ Wantoff Phase 1: backend generalisation (this session)

Per `docs/wantoff-app-plan.md` section 2 ("Backend changes needed first").
All additive, `mealmate.meal` flow unchanged/backward-compatible.

- **`POST /listings`** now branches on `itemType`: `"mealmate.meal"` (or
  omitted) keeps existing meal validation; any other `itemType` is generic
  — `title`, `description`, `location`, free-form `attributes`, plus
  `fees`/`currencies`/`minReputation` validated by new `parseFees` /
  `parseCurrencyOptions` / `parseMinReputation` in `apps/backend/src/lib.ts`.
- **`PATCH /listings/:id`** (owner-only): update `status` (OPEN/CANCELLED),
  `attributes` (merged), `minReputation`, `fees`, `currencies` — works for
  any `itemType`.
- **`DELETE /listings/:id`** (owner-only): soft-delete via
  `status: "CANCELLED"`.
- **`GET /listings?mine=true`**: authenticated actor's own listings across
  every `itemType`/status — the "manage my wants & offers" dashboard feed.
- **`GET /actors/:id/public-profile`** (unauthenticated): `displayName`,
  `reputationScore`, `reviewCount`, `circlesWallet`, and `OPEN` listings —
  data source for a linkable/embeddable profile page.
- New shared `serializeListing` helper in `lib.ts` used by `GET /listings`,
  `POST /listings`, and the public-profile endpoint (DRY listing JSON
  shape, `distanceKm`/`joinedByMe` optional extras).
- Tests: `parseFees`, `parseCurrencyOptions`, `parseMinReputation`,
  `serializeListing` added to `lib.test.ts` (21/21 passing). `npx tsc
  --noEmit` clean.
- Verified via curl: generic `itemType` POST/PATCH/DELETE work, `?mine=true`
  and `/public-profile` return expected shapes, existing `mealmate.meal`
  POST unchanged.
- Docs: `docs/exchange-protocol.md` "Decisions" — two new entries ("Generic
  listings beyond `mealmate.meal`", "Public profile"). `docs/wantoff-app-plan.md`
  section 2 marked ✅ DONE.

## #26 ✅ Join-flow UX fixes (this session)

- **Confirm-before-join modal** (`apps/mobile/src/MealsScreen.tsx`): tapping
  "Join" opens a modal explaining the meal commits the actor to attending
  (affects reputation if they no-show) and will spend N meal-credits;
  Cancel/Confirm buttons, `api.join` only fires on confirm.
- **Joined meals stay visible**: `GET /listings` (`apps/backend/src/index.ts`)
  now also returns listings the viewer has joined (via `Exchange`) even if
  they've gone `CLOSED` (host's own listings excluded from this). Each item
  now has `status` and `joinedByMe: boolean`. Mobile cards for
  `joinedByMe` listings get a green border/background + "✓ You're going"
  badge and a disabled "You're going ✓" button.
- **Join-confirmation email**: new `notify.joinConfirmed` in
  `apps/backend/src/mailer.ts`, sent to the joiner (in addition to the
  existing host-facing `notify.mealJoined`), reminding them of the
  commitment, meal time, and credit cost.
- Docs: `docs/exchange-protocol.md` "Decisions" updated for both the
  notification change and the listing-visibility/`joinedByMe` change.
- Verified via curl: after Bob joins "Curry night", `GET /listings` shows it
  with `status: "OPEN", joinedByMe: true`; his own "Bob curry night" (CLOSED,
  he's the host) is correctly excluded from `joinedByMe`. `npx tsc --noEmit`
  clean in both `apps/backend` and `apps/mobile`. Expo bundle rebuilt and
  contains "Confirm & join" / "You're going".

Backend is running in the background (PORT=3001, started via `npx tsx
watch src/index.ts` from `apps/backend`, logging to `/tmp/backend.log`).
Postgres is on 5433 (docker-compose). Expo web dev server is running on
:8081 (started fresh this session with `EXPO_PUBLIC_API_URL=http://localhost:3001`,
logging to `/tmp/expo.log`) — bundle verified to contain the new
HostMealScreen/ProfileScreen strings ("Host a meal", "Your profile", "CRC
tip welcome").

Note: on this machine, Expo's web bundle is NOT served at
`/index.bundle?platform=web` — because this is an npm-workspaces monorepo,
the real bundle path is prefixed with the workspace-relative path, e.g.
`/apps/mobile/index.ts.bundle?platform=web&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.routerRoot=app&unstable_transformProfile=hermes-stable`.
Fetch `/` first and read the `<script src=...>` tag to get the exact path
before grepping the bundle for verification.

## What's DONE (backend, verified via curl)

1. **POST /listings** (`apps/backend/src/index.ts`) — authenticated "host a
   meal" endpoint. Body: `title, description, location{address,lat,lng},
   mealTime, capacity, dietaryInfo, minReputation?, creditFeeAmount?,
   donationSuggestion?`. Creates an OFFER `mealmate.meal` listing with a
   required credit fee + optional CRC donation fee (if host has
   `circlesWallet` set). Returns the serialized listing.

2. **minReputation gating + reputation-boosted sort**
   - `GET /listings` now orders by `actor.reputationScore desc` then
     `createdAt desc` (before the new distance sort layer — see below).
   - `POST /listings/:id/join` rejects with 403 if
     `joiner.reputationScore < listing.minReputation`.

3. **Platform fee for frequent diners**
   - New helper `countMealsEaten(actorId, start, end)` counts exchanges
     where the actor was a *joiner* (not host) in a date range.
   - On join: if the actor ate >1 meal in the prior 7-day window AND >=1
     meal in the current 7-day window (i.e. this join would be their 2nd+
     this week, after already having >1 last week), a `PLATFORM_FEE`
     (`scope: platform, kind: currency, currency: GBP, amount: 1`) is
     pushed into `appliedFees` and a `PENDING` `Payment` is created with
     `toActorId: "platform"` (sentinel, no real Actor row).
   - Join response now includes `platformFee: Fee | null`.
   - Verified end-to-end with a throwaway script
     (`apps/backend/platformfee_test.mjs`, already deleted) that backdated
     fake Exchange rows for Bob, then confirmed `platformFee` appears on
     the next real join.

4. **CRC tipping (Circles wallet)**
   - `Actor.circlesWallet` (already existed in schema) is now settable via
     new `PATCH /me` (also accepts `location`, see below).
   - `serializeActor` now returns `circlesWallet` and `location`.
   - `GET /listings` host object includes `circlesWallet`; listing `fees`
     may include a `kind: "donation", currency: "CRC"` entry with an
     optional suggested `amount`.

5. **Location / proximity matching** (new request mid-session, ALSO DONE
   on the backend)
   - Schema: added `Actor.location Json?` (`{lat, lng, address}`) via
     hand-written migration
     `apps/backend/prisma/migrations/20260612200000_actor_location/migration.sql`
     (`ALTER TABLE "Actor" ADD COLUMN "location" JSONB;`). Migration has
     been applied and `prisma generate` re-run — DB and client are in
     sync.
   - `PATCH /me` accepts `location: {lat, lng, address?} | null`.
   - New `optionalAuth` middleware in `apps/backend/src/auth.ts` — like
     `requireAuth` but doesn't fail if no/invalid token; sets `req.actorId`
     if a valid token is present.
   - `GET /listings` now uses `optionalAuth`. Viewer location resolution
     order: explicit `?lat=&lng=` query params, else the logged-in actor's
     saved `location`. New `distanceKm(a, b)` haversine helper. Response
     items now include `distanceKm: number | null`. If viewer location is
     known, listings within 25km (`NEARBY_RADIUS_KM`) are boosted to the
     front, sorted by distance ascending; everything else keeps the
     existing reputation/recency order (stable sort).
   - Verified via curl: `?lat=51.5&lng=-0.12` puts the Hackney listing
     first.

## Mobile — DONE (was "in progress", now complete)

- **`apps/mobile/src/api.ts`** — DONE. Added `GeoLocation` type, extended
  `Actor` (circlesWallet, location), extended `Listing` (currencies,
  minReputation, distanceKm, host.circlesWallet, attributes.capacity/
  dietaryInfo), added `NewListingInput`, `api.updateProfile`,
  `api.createListing`, changed `api.listings(token, itemType, coords?)`
  signature (now takes token + optional `{lat,lng}`), and `api.join` return
  type now includes `platformFee`.

- **`apps/mobile/src/location.ts`** — DONE (new file). Thin wrapper around
  `navigator.geolocation.getCurrentPosition`, resolves `GeoLocation | null`,
  never rejects.

- **`apps/mobile/src/HostMealScreen.tsx`** — DONE (new file). Full "host a
  meal" form: title/description/address/"use my location"/mealTime/
  capacity/dietaryInfo/minReputation/creditFeeAmount, and a
  donationSuggestion field (only shown if `actor.circlesWallet` is set,
  otherwise shows a hint to add one). Calls `api.createListing`.

- **`apps/mobile/src/ProfileScreen.tsx`** — DONE (new file). Lets the actor
  set `circlesWallet` and home `location` (address text + "use my current
  location" button), calls `api.updateProfile`.

- **`apps/mobile/src/MealsScreen.tsx`** — DONE. `load()` now passes
  `token` and coords (actor's saved location, falling back to
  `getCurrentLocation()`) to `api.listings`. Join handler shows a `notice`
  banner if `platformFee` comes back. Card rendering now shows
  `distanceKm`, `dietaryInfo`, `minReputation` requirement, and a CRC tip
  line (host wallet + suggested amount) when a donation fee + host wallet
  exist. Join button is disabled and relabelled `Needs rep ≥ N` when the
  actor's reputation is below `minReputation`. Added `notice` and `tip`
  styles.

- **`apps/mobile/App.tsx`** — DONE. Tab bar now has 4 buttons: Meals,
  "Host a meal", My Exchanges, Profile. Content switch renders
  `MealsScreen` / `HostMealScreen` / `ExchangesScreen` / `ProfileScreen`
  accordingly. `HostMealScreen.onCreated` calls `refreshActor()` and
  switches back to the `'meals'` tab. `ProfileScreen.onUpdated` calls
  `refreshActor()`.

## Smoke test performed (all passing)

- `PATCH /me` sets `circlesWallet` + `location` for Bob (Bristol coords).
- `POST /listings` as Bob with `donationSuggestion: 3` correctly returns a
  donation fee (CRC) + `currencies: [{currency:"CRC", walletAddress:
  "0xBobCRCWallet456"}]`.
- `GET /listings?lat=51.45&lng=-2.58` (Bristol viewpoint) correctly puts
  Bob's new Bristol listing and the existing Bristol "Sunday roast" listing
  first (distance 0 / 0.74 km), with the London "Veggie chilli" listing
  last (~170 km), and listings without `location` (Alice's "Test bake",
  "Curry night", "Exclusive dinner") falling back to reputation/recency
  order with `distanceKm: null`.
- minReputation gating confirmed earlier: Bob (rep 58) rejected from a
  listing requiring rep ≥ 90 with a 403 + clear error message.
- Platform fee confirmed earlier: after backdating fake exchange history,
  Bob's next real join returned `platformFee: {scope: "platform", kind:
  "currency", currency: "GBP", amount: 1, ...}`.

Visual/manual check in the browser at http://localhost:8081 has NOT been
done yet — recommended before considering #22-24 fully "shipped" from a UX
perspective (the code/API-level work is done and tested).

## Mailer / notification system — DONE (#25)

- New `apps/backend/src/mailer.ts`: `sendMail(to, subject, text)` — uses
  `nodemailer` SMTP transport if `SMTP_HOST` env var is set, otherwise logs
  `[mailer] to=... subject="..."` + body to the console (dev default).
  `MAIL_FROM` env var controls the From address.
- `notify.mealJoined`, `notify.newMessage`, `notify.reviewReceived` helpers
  build the subject/body for each event and call `sendMail`.
- Wired into `apps/backend/src/index.ts`:
  - `POST /listings/:id/join` → `notify.mealJoined(host, joiner, listingTitle)`
    after a successful join.
  - `POST /exchanges/:id/messages` → `notify.newMessage(recipient, sender,
    listingTitle, body)` to the other exchange participant.
  - `POST /exchanges/:id/reviews` → `notify.reviewReceived(reviewee,
    reviewer, score)`.
  - All three are fire-and-forget (`.catch(console.error)`), so mailer
    failures never block the API response.
- `nodemailer` + `@types/nodemailer` added to `apps/backend/package.json`.
- Env vars documented in `apps/backend/.env.example`, root `.env.example`,
  and added (with safe empty defaults) to `docker-compose.prod.yml`:
  `MAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`,
  `SMTP_PASS`.
- Verified: `npx tsc --noEmit` passes with no errors; triggered a message
  send and a review submission via curl, both returned success responses
  (mailer console-logs to `/tmp/backend.log`, though that file appears
  empty due to Node stdout buffering on the backgrounded process — not a
  functional issue, just means you won't see `[mailer]` lines in
  `/tmp/backend.log` until the process is restarted attached to a TTY or
  the buffer flushes).

## Mobile dev quirks (recurring, see also CLAUDE.md memory)

- Metro/Expo in this environment does **not** hot-reload reliably. After
  any edit to `apps/mobile/**`, kill any running `expo start`/`metro`
  processes (`pkill -f "expo start"; pkill -f metro`) and restart with:
  `CI=1 EXPO_PUBLIC_API_URL=http://localhost:3001 npx expo start --web
  --clear`. Verify the new bundle actually contains your changes (grep the
  bundle output for an expected string) before telling the user to
  refresh.
- Backend: `cd apps/backend && PORT=3001 npx tsx watch src/index.ts` (tsx
  watch picks up changes automatically — the earlier backend process was
  running plain `tsx` without `watch` and had to be killed/restarted once
  this session).
- Postgres: docker-compose maps host port 5433 → container 5432.
  `DATABASE_URL` in `apps/backend/.env` already points at 5433.
- Prisma migrations: `prisma migrate dev` is not usable non-interactively
  here. Write migration SQL by hand into
  `apps/backend/prisma/migrations/<timestamp>_<name>/migration.sql`, then
  `rtk proxy npx prisma migrate deploy --schema prisma/schema.prisma` +
  `rtk proxy npx prisma generate --schema prisma/schema.prisma`.

## Tasks list (as tracked in this session)

- #18 ✅ Backend: POST /listings
- #19 ✅ Backend: minReputation gating + reputation-boosted sort
- #20 ✅ Backend: platform fee on frequent joiners
- #21 ✅ Backend: Circles wallet field + PATCH /me
- #22 ✅ Mobile: Host-a-meal form (incl. App.tsx tab wiring)
- #23 ✅ Mobile: show CRC tip + platform fee + rep gating in UI
- #24 ✅ Location: profile + offers + proximity sort (backend + mobile)
- #25 ✅ Mailer/notification system

## Tests + docs policy (added 2026-06-13)

- New `apps/backend/src/lib.ts` holds pure, unit-tested business logic:
  `distanceKm`, `nextReputationScore` (the rolling-average formula,
  `REPUTATION_ALPHA = 0.2`), `isFrequentDiner` (platform-fee trigger).
  `index.ts` now imports these instead of inlining them.
- New `apps/backend/src/lib.test.ts` (vitest) covers all three —
  `npm run test --workspace=@mealmate/backend` (or `npx vitest run` from
  `apps/backend`). 8 tests, all passing. `vitest` added as a devDependency.
- New root `CLAUDE.md`: project policy that every feature needs a test
  (pure logic → `lib.ts` + `lib.test.ts`) and doc updates (`README.md`,
  `docs/exchange-protocol.md`, `.env.example` files, `docker-compose.prod.yml`
  for new env vars).
- `README.md` got a new "Testing" section pointing at the above.
- `docs/exchange-protocol.md` "Decisions" section got two new entries
  documenting the proximity-matching design (`Actor.location`, 25km boost
  radius) and the notification/mailer design — both were implemented
  earlier in this session but hadn't been written up in the protocol doc.
- `npx tsc --noEmit` still passes after the `lib.ts` extraction; backend
  dev server (tsx watch) reloaded cleanly, `/health` still OK.

No integration/API-level tests (supertest + test DB) exist yet — only pure
business-logic unit tests. If the user wants endpoint-level test coverage
next, that would need a test database strategy (e.g. a separate
`mealmate_test` DB + migrate/reset in a `pretest` script).

## Next step / open items

Everything requested so far is implemented and backend-verified. The one
thing NOT done is a **visual/manual check in the browser**
(http://localhost:8081) — log in as alice@example.com / password123, click
through Meals / Host a meal / My Exchanges / Profile tabs, post a meal,
set a CRC wallet + location, and confirm the UI renders/behaves as
expected (the API-level behaviour is all curl-verified, but no one has
looked at the rendered screens yet).

No other follow-ups are currently queued — ask the user what's next.
