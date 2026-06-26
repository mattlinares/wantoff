# Wantoff: a general client for the exchange protocol

Status: planning draft, no code yet. Companion to `docs/exchange-protocol.md`
(the data model) and `docs/about.md` (the public-facing pitch).

## 1. What this app is

Mealmate is one app built on the shared "offers and wants" protocol
(`Actor`, `Listing`, `Fee`, `Exchange`, `Review` — see
`docs/exchange-protocol.md`). **Wantoff** is the general-purpose client for
that protocol itself:

- a dashboard where someone manages *all* their wants/offers, whichever app
  created them (Mealmate meals today, other `itemType`s later)
- a place to add new wants/offers directly, not tied to any one app's UI
- a **public profile** per actor — "here's what I'm offering / looking for
  right now" — that's linkable and embeddable on other sites
- CRC-first pricing, with an in-app Circles payment flow
- reputation that blends Mealmate-style behavioural reviews with signals
  from the Circles trust graph

Think of Mealmate as "the meals app on top of the protocol" and Wantoff as
"the protocol's own front door".

Mealmate and Wantoff will live on **different domains** but share the same
backend/`Actor` accounts and infrastructure — see Section 7 for what that
means for auth/CORS.

## 2. Backend changes needed first — ✅ DONE

The current backend (`apps/backend`) already models the protocol generically,
but a couple of endpoints are Mealmate-shaped and need generalising — these
should land *before* the new app, as small additive changes to the existing
backend (no new service):

- **`POST /listings`** currently hardcodes `itemType: "mealmate.meal"` and a
  meal-shaped `attributes` object. Generalise to accept any `itemType` +
  free-form `attributes`, with the existing meal-specific validation moved
  behind `itemType === "mealmate.meal"` (so Mealmate's `HostMealScreen`
  keeps working unchanged).
- **`GET /listings`** already supports an optional `itemType` filter — for
  Wantoff's dashboard, add `GET /listings?mine=true` (or reuse `actorId`)
  to fetch *all* of the current actor's listings across every `itemType`,
  including non-`OPEN` ones (for editing/closing).
- **New `GET /actors/:id/public-profile`** — unauthenticated, returns
  `displayName`, `reputationScore`/`reviewCount`, `circlesWallet`, and that
  actor's currently-`OPEN` listings (title, itemType, fees/currencies,
  location). This is the data source for the embeddable profile.
- **`PATCH /listings/:id`** and **`DELETE /listings/:id`** (or a
  `status` patch to `CANCELLED`) — needed so people can manage (not just
  create) listings from Wantoff.

Each of these is a small, additive change to `apps/backend/src/index.ts`
and follows the existing tests+docs policy (`CLAUDE.md`) — new validation
logic extracted to `lib.ts` where it's pure.

## 3. New app shape — ✅ DONE (skeleton)

A new workspace, `apps/wantoff`. Two reasonable shapes — worth a quick
decision before starting:

Web-first (Next.js): server-rendered profile pages are crawlable, fast, and embed cleanly via `<iframe>`. Dashboard/auth pages are normal client-rendered routes; the profile page (`/u/:id`) is server-rendered.

Given the public-profile requirement is central to "Wantoff", **web-first
is the right choice**, with the dashboard/auth pages as normal
client-rendered routes and the profile page (`/u/:id`) server-rendered.

### Core screens

1. **Dashboard ("My wants & offers")** — list of the actor's listings across
   all `itemType`s (pulled from `GET /listings?mine=true`), grouped by
   status (open / matched / closed), with edit/close actions.
2. **Add a want/offer** — generic form: `itemType` picker (known types like
   `mealmate.meal`, plus a generic "other" type with free-text
   title/description), location, `minReputation`, and fees — defaulting to
   a CRC price (see below).
3. **Public profile** (`/u/:id`, no auth) — displayName, reputation, open
   listings, and a "tip / pay in CRC" button per listing. Linked directly,
   or embedded on other sites via `<iframe src=".../u/:id?embed=1">` (an
   `embed=1` variant strips the site header/nav for a compact card). No JS
   embed snippet needed for v1.

## 4. Item-type templates: curated + freeform — ✅ DONE

The "add a want/offer" form needs to cover both structured types (like
Mealmate's meal) and genuinely open-ended ones, so it's a mixture:

- **Curated templates** are the primary path — a small registry of
  `itemType`s, each with a defined `attributes` schema (field names, types,
  which are required) and a tailored form. Mealmate's `mealmate.meal` is the
  first of these. New templates (e.g. `wantoff.lift`, `wantoff.skill`,
  `wantoff.item`) are added via an **admin dashboard** rather than a code
  change — so the registry can grow without a deploy each time.
  - Backend: new `ItemTypeTemplate` model (`itemType`, `label`, JSON field
    schema, default fees/currencies). `GET /item-type-templates` (public, for
    the form picker), `POST`/`PATCH` restricted to admins.
  - This registry is also the natural seed for "possibly eventually an open
    standard" — it's already just published JSON schemas per `itemType`,
    which other apps/backends could adopt or mirror.
- **Freeform** is the fallback: a generic `itemType` (e.g. `wantoff.other`)
  with just title/description/location/fees and no structured `attributes`,
  for anything that doesn't fit a curated template yet. Useful both as an
  escape hatch and as a signal for which templates to curate next (frequent
  freeform patterns → candidates for a new curated template).

## 5. CRC-first pricing

- New listings created via Wantoff default their required `Fee`/
  `CurrencyOption` to CRC (`{ kind: "currency", currency: "CRC", required:
  true }` plus `currencies: [{ currency: "CRC", ... }]`), rather than
  Mealmate's meal-credit system. This is a Wantoff-level default, not a
  protocol change — Mealmate listings keep using meal credits.
- Flagging this explicitly per the user's note: pricing primarily in CRC
  will likely shrink the pool of things people list (CRC liquidity/trust
  paths aren't universal yet) — acceptable for a v1 focused on
  CRC-native users, but worth tracking as an adoption metric, and keeping
  the door open to "credit" or "free/donation" fee kinds for listings where
  a CRC price would be a barrier.

### Circles SDK integration

- Use `@circles-sdk` + a wallet-connect flow (WalletConnect/Reown AppKit) so
  a visitor can connect their own Circles-compatible wallet.
- On a listing's "Pay / claim" action: use the SDK to find a trust path from
  viewer → host and submit the CRC transfer directly (the in-app version of
  the "deep-link to Circles wallet" tip flow discussed for Mealmate, but now
  the primary settlement mechanism, not just a tip).
- **Trust-path is a hard requirement, not just informational**: Circles
  personal currencies can only move between two people via a chain of trust
  connections (the Hub's pathfinder finds a route through tokens each hop
  trusts) — there's no "send to anyone" fallback. So a missing trust path
  doesn't just mean "no signal to show", it means **the payment will fail**.
  Wantoff should check for a path *before* showing "Pay" as enabled, with a
  clear "no trust path to this person yet" state instead of a failed
  transaction.

## 6. Reputation: Mealmate score + Circles trust graph

Two distinct signals, shown side by side rather than merged into one number:

- **Behavioural reputation** (existing `Actor.reputationScore`,
  0–100, recency-weighted from `Review`s) — "did this person follow through
  on past exchanges". Carries over from Mealmate/any app using the protocol.
- **Circles trust signal** — derived from the Circles trust graph (e.g.
  "trusted by N people you also trust" / "M hops away in the trust graph").
  This is an *ecosystem* trust signal Wantoff can read via `@circles-sdk`,
  independent of the protocol's own review system.

Why keep them separate: behavioural reputation says "this person showed up
last time"; the Circles trust graph says "this person is vouched for by
people I (transitively) trust" — useful even for a first-ever exchange with
someone who has no reviews yet.

`minReputation` gating stays based on the behavioural score (it's what the
protocol already defines). **For CRC-priced listings, add a second,
independent gate: "viewer has a trust path to host"** — since, per above,
that's not optional for CRC anyway. A listing can therefore end up with two
gates (`minReputation` *and* trust-path), checked separately; failing the
trust-path check should prompt the viewer to build trust (e.g. link to how
Circles trust connections work) rather than just hiding the listing.

## 8. Phased build order

1. **Backend generalisation** (Section 2) — additive, low-risk, unblocks
   everything else; ship with its own tests/docs per `CLAUDE.md`.
2. **Item-type template registry** (Section 4) — `ItemTypeTemplate` model +
   admin CRUD + public read endpoint, seeded with `mealmate.meal` and
   `wantoff.other` (freeform).
3. **Wantoff skeleton** — ✅ DONE: new workspace, shared auth against the existing
   backend (same `Actor`/login — no separate account system), dashboard
   listing the actor's own listings across all `itemType`s.
4. **Generic add/edit listing form** — ✅ DONE: driven by the template registry
   (curated templates + freeform fallback), CRC-default pricing.
5. **Public profile page** (`/u/:id`) + iframe embed — ✅ DONE.
6. **Circles SDK**: wallet connect, trust-path lookup, trust-path gating,
   in-app CRC payment on listings — ✅ DONE.
7. **Trust-graph reputation signal** on profiles and listing cards.
8. **Protocol pages** — ✅ DONE: `/protocol` (public-facing overview: headline,
   four concept cards, CTA) and `/protocol/detail` (full spec: item types,
   how to add, sharing/embed, Valueflows prior-art). Linked from a sitewide
   footer ("About the protocol").

## 9. Wallet modes: embedded vs standalone

The Circles SDK integration (`apps/wantoff/src/lib/circles.ts`) supports two
wallet modes, controlled by `NEXT_PUBLIC_WALLET_MODE` at build time:

- **`embedded`** — for running inside the Circles host application (e.g. the
  Circles Garage competition context). Uses `@aboutcircles/miniapp-sdk`, which
  injects the user's address and handles auth without any browser wallet
  extension. The host app owns the connection.
- **`standalone`** (default) — for a public web deployment. Uses an injected
  browser wallet (MetaMask or any Circles-compatible extension) via
  `@circles-sdk/adapter-ethers`'s `BrowserProviderContractRunner` on Gnosis
  Chain (chain ID 100).

Everything else — backend, UI, listings, trust-path gating, CRC payments,
reputation — is identical between the two modes. The distinction is purely in
how `connectCirclesWallet()` initialises the SDK.

**Pending migration**: `@circles-sdk/sdk` is deprecated upstream in favour of
`@aboutcircles/sdk`. Both modes should migrate when the embedded adapter work
lands (they use the same SDK surface; the adapter is the only difference).

**Deployment**: same repo, same `apps/wantoff` codebase, built twice — once
with `NEXT_PUBLIC_WALLET_MODE=embedded` for the Circles host context, once with
`NEXT_PUBLIC_WALLET_MODE=standalone` (or unset) for the public URL.

## 10. Decisions

- **Auth**: one shared `Actor`/JWT account across Mealmate and Wantoff —
  same backend, same login, different frontend domains. The backend's
  permissive CORS (`cors()` with no origin restriction) and Bearer-token
  auth (no cookies) already make cross-domain auth straightforward; no
  per-domain config needed beyond each frontend pointing at the shared API
  URL.
- **Embeds**: `<iframe>` to a real server-rendered `/u/:id` page (with an
  `embed=1` variant for a chrome-free compact view). No separate JS embed
  snippet for v1.
- **Item types**: mixture — curated templates (admin-managed registry, see
  Section 4) as the primary path, with a freeform `wantoff.other` type as
  the fallback. The curated registry doubles as the seed for a future open
  standard (published JSON schemas per `itemType`).
- **Trust-path gating**: yes — and it's not optional. Circles personal
  currencies require a trust-graph path between sender and receiver for any
  transfer to succeed at all, so for CRC-priced listings Wantoff checks for
  a trust path up front and treats its absence as a real gate (clear
  "no trust path yet" state), separate from and in addition to
  `minReputation`.
