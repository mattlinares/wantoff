# Abstract Exchange Protocol (working draft)

Goal: a generic schema for "offers" and "wants" of products/services, with
attached fees, currencies, and reputation — that Mealmate (meals) is one
instance of. Designed to map onto ATProto lexicons later if federation is
wanted, but usable as plain JSON/REST now.

## Core entities

### 1. Actor
Represents a user (or org/admin) participating in the network.

```
Actor {
  id: string                 // DID or internal UUID
  displayName: string
  reputation: {
    score: number             // aggregate rep score
    reviewCount: number
    lastUpdated: datetime
  }
  walletAddresses: {           // for payments/tips
    circles?: string           // CRC wallet (Gnosis Chain)
    gbp?: string                // future fiat rail ref
  }
  credits: {                   // platform-internal credit balances
    [creditType: string]: number   // e.g. "mealmate.meal-credit": 3
  }
}
```

### 2. Listing (Offer | Want)
Generic record for "I have X to give" or "I want X". Apps define their own
`itemType` namespace and `attributes` payload.

```
Listing {
  id: string
  type: "offer" | "want"
  actorId: string
  itemType: string            // namespaced, e.g. "mealmate.meal"
  status: "open" | "matched" | "closed" | "cancelled"
  createdAt: datetime
  expiresAt?: datetime

  // generic exchange terms
  fees: Fee[]
  acceptedCurrencies: CurrencyOption[]
  minReputation?: number       // gate: actor must meet this to respond

  // app-specific payload, schema defined per itemType
  attributes: object
}
```

### 3. Fee
Fees can be layered — protocol-level, platform-level, or user-set.

```
Fee {
  scope: "protocol" | "platform" | "user"
  kind: "credit" | "currency" | "donation"
  creditType?: string          // if kind == "credit", e.g. "mealmate.meal-credit"
  currency?: string            // if kind == "currency"/"donation", e.g. "CRC", "GBP"
  amount?: number               // fixed amount
  rate?: number                  // or percentage-based
  required: boolean             // false = suggested (e.g. CRC tip)
  trigger?: string               // condition ref, e.g. "frequency>1/week,2wks"
}
```

### 4. CurrencyOption
What an offer/want is willing to settle in.

```
CurrencyOption {
  currency: string            // "CRC" | "GBP" | "mealmate.meal-credit" | ...
  preferred: boolean
}
```

### 5. Exchange
Created when an offer and want are matched (e.g. host's meal offer + guest's
join "want"). Tracks the lifecycle, messaging thread, fees actually applied,
and is the anchor for post-exchange reviews.

```
Exchange {
  id: string
  offerListingId: string
  wantListingId: string
  participants: string[]       // actorIds
  status: "pending" | "confirmed" | "completed" | "cancelled" | "no-show"
  scheduledAt?: datetime
  messageThreadId: string
  appliedFees: Fee[]            // resolved/snapshotted at confirm time
  payments: Payment[]
}
```

### 6. Payment
Records actual settlement (credit debit, CRC transfer, fiat later).

```
Payment {
  id: string
  exchangeId: string
  fromActorId: string
  toActorId: string             // or "platform" for platform fees
  kind: "credit" | "currency" | "donation"
  creditType?: string
  currency?: string
  amount: number
  status: "pending" | "settled" | "failed"
  txRef?: string                // e.g. Circles tx hash
  settledAt?: datetime
}
```

### 7. Review
Post-exchange reputation feedback. Admins can submit overriding/weighted
reviews.

```
Review {
  id: string
  exchangeId: string
  reviewerId: string             // actor or "admin:<id>"
  revieweeId: string
  score: number                  // e.g. -2..+2 or 1..5, TBD
  tags?: string[]                // "no-show", "great-host", etc.
  comment?: string
  weight: number                 // admin reviews weighted higher
  createdAt: datetime
}
```

## Mealmate's itemType: `mealmate.meal`

```
attributes: {
  title: string
  description?: string
  location: { lat, lng, address }
  mealTime: datetime
  capacity: number
  spotsRemaining: number
  dietaryInfo?: string[]
}
```

A meal **offer** = host advertising spare seats. A meal **want** = a guest
looking to join any meal at a time/place (optional — guests usually respond
directly to an offer rather than posting a want).

## Notes on rules from the brief

- **Meal credits**: `Fee{scope:"user", kind:"credit", creditType:"mealmate.meal-credit", required:true}` on the want side — joining a meal costs 1 credit, hosting earns 1.
- **Platform fee** (>1 meal/week, >1 consecutive week): not stored per-listing — computed from `Exchange` history per actor. When threshold crossed, a `Fee{scope:"platform", kind:"currency", trigger:"..."}` is attached to subsequent exchanges until frequency drops.
- **CRC tips**: `Fee{scope:"user", kind:"donation", currency:"CRC", required:false}` — suggested, not enforced.
- **Reputation gating/boost**: `Listing.minReputation` for gating; `Actor.reputation.score` used by ranking/sort for boosting in listings — app-level concern, not protocol.

## Decisions

- **Reputation**: 0-100 scale, recency-weighted rolling average of review scores (exponential decay on older reviews). Used directly for `minReputation` gating and listing-sort boosting.
- **Want listings**: not used by Mealmate v1 — guests browse open `mealmate.meal` offers and join directly. `Listing.type:"want"` stays in the protocol for future apps/use cases.
- **Settlement order** for `Exchange.appliedFees` / `Payment`s: (1) credit fees (e.g. meal credit debit/award) → (2) required currency fees (e.g. platform connection fee) → (3) optional donations (CRC tip), processed last and non-blocking if they fail.
- **ATProto lexicon mapping**: deferred until multi-app/federation is actually needed; current schema is plain JSON/REST.
- **Proximity matching**: `Actor.location?: { lat, lng, address }` (mirrors `mealmate.meal`'s `attributes.location`) is the viewer's home location, settable via `PATCH /me`. `GET /listings` resolves the viewer's location (query params `?lat=&lng=` override the saved `Actor.location`) and boosts listings within 25km, sorted by distance; everything else falls back to the existing reputation/recency order. This is app-level ranking, not a protocol field on `Listing`.
- **Notifications**: out of protocol scope. Mealmate sends email via `apps/backend/src/mailer.ts` on: meal joined (notifies host, and separately sends the joiner a join-confirmation email with the commitment/cost reminder), new exchange message (notifies the other participant), and new review (notifies reviewee). Reuses `Actor.email`; no separate notification-preferences model yet.
- **Listing visibility after joining**: `GET /listings` normally returns only `status:"OPEN"` listings, but for an authenticated viewer it also includes any listing they've joined (via an `Exchange`) even if it has since become `CLOSED` (e.g. spots filled). Each listing carries `status` and `joinedByMe: boolean` so the client can keep a joined meal visible with a distinct "you're going" treatment instead of it disappearing from the list. `joinedByMe` listings are also sorted to the top of the response, ahead of the proximity/reputation ordering.
- **Generic listings beyond `mealmate.meal`** (first step toward Wantoff, see `docs/wantoff-app-plan.md`): `POST /listings` now branches on `itemType` — `itemType: "mealmate.meal"` (or omitted) keeps the existing meal-specific validation/shape unchanged; any other `itemType` is generic, taking `title`, `description`, `location`, free-form `attributes`, and protocol-shaped `fees`/`currencies`/`minReputation` (validated by `parseFees`/`parseCurrencyOptions`/`parseMinReputation` in `apps/backend/src/lib.ts`). `PATCH /listings/:id` (status/attributes/minReputation/fees/currencies, owner-only) and `DELETE /listings/:id` (soft-delete via `status: "CANCELLED"`) work for any `itemType`. `GET /listings?mine=true` returns the authenticated actor's own listings across every `itemType` and status, for a "manage my wants & offers" dashboard. A shared `serializeListing` helper (`apps/backend/src/lib.ts`) produces the listing JSON shape used by `GET /listings`, `POST /listings`, and the new public profile endpoint below.
- **Public profile**: `GET /actors/:id/public-profile` (unauthenticated) returns an actor's `displayName`, `reputationScore`, `reviewCount`, `circlesWallet`, and currently-`OPEN` listings across all `itemType`s — the data source for a linkable/embeddable profile page (see `docs/wantoff-app-plan.md`).
- **Item-type template registry** (Wantoff phase 2, see `docs/wantoff-app-plan.md` section 4): new `ItemTypeTemplate` model (`itemType` unique, `label`, `fieldSchema`, `defaultFees`, `defaultCurrencies`). `GET /item-type-templates` (public) lists all templates for the "add a want/offer" form picker. `POST`/`PATCH /item-type-templates/:itemType` require an admin actor (`Actor.isAdmin`, checked by new `requireAdmin` middleware). `fieldSchema` is validated by `parseFieldSchema` (`apps/backend/src/lib.ts`) — an array of `{ name, label, type, required }` where `type` is one of `string | text | number | boolean | date | location | string[]`. Seeded with `mealmate.meal` (full meal field schema, meal-credit + CRC-donation defaults) and `wantoff.other` (empty `fieldSchema` — the freeform fallback, CRC-required default).
- **Wallet auth** (`GET /auth/wallet/nonce`, `POST /auth/wallet/verify`): sign-in-with-Ethereum alongside email/password. `GET /auth/wallet/nonce?address=0x...` issues a 5-minute one-time nonce and returns the message to sign. `POST /auth/wallet/verify` recovers the signer address via `ethers.verifyMessage`, then finds-or-creates an `Actor` by `circlesWallet`. New wallet-only actors get 3 meal credits and a truncated-address display name (editable via `PATCH /me`). `Actor.email` and `Actor.passwordHash` are now nullable to support wallet-only accounts. Nonces are stored in-memory (single-instance fine; revisit with Redis for multi-instance).
- **Generic exchange flow** (`POST /listings/:id/request`): creates a `PENDING` `Exchange` for any non-`mealmate.meal` listing — no credit checks, no capacity decrement (those are Mealmate concerns). Body accepts an optional `message` string to seed the exchange thread. Returns `{ exchangeId, status }`. Guards: listing must be `OPEN`, requester must not be the owner, `minReputation` check applies, duplicate requests are rejected (409). Use `POST /listings/:id/join` for `mealmate.meal` — it handles credit settlement and capacity.
- **Circles SDK / wallet connect** (Wantoff phase 6, see `docs/wantoff-app-plan.md` section 8 item 6): wallet connect uses an **injected wallet** (e.g. MetaMask via `ethers.BrowserProvider`/`@circles-sdk/adapter-ethers`'s `BrowserProviderContractRunner`), not WalletConnect/Reown AppKit as originally suggested — no project ID/API key infrastructure exists yet, and the injected-wallet flow matches the Circles SDK's own quickstart. Revisit if a no-extension flow is needed. Uses `@circles-sdk/sdk` (deprecated upstream in favour of `@aboutcircles/sdk`, but still functional — flagged for a future migration) with `circlesConfig[100]` (Gnosis mainnet) to avoid hardcoding contract addresses. Trust-path gating uses `avatar.getMaxTransferableAmount(hostWallet)`; in-app payment uses `avatar.transfer(hostWallet, amount)`.
