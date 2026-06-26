// Pure helper functions extracted from index.ts so they can be unit tested
// without spinning up the Express app or a database.

// Great-circle distance in km between two lat/lng points.
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sinLng * sinLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Recency-weighted rolling average: each new review nudges the score toward
// itself by `alpha * weight`, capped at 0-100.
export const REPUTATION_ALPHA = 0.2;

export function nextReputationScore(currentScore: number, reviewScore: number, weight: number) {
  const delta = REPUTATION_ALPHA * weight * (reviewScore - currentScore);
  return Math.min(100, Math.max(0, currentScore + delta));
}

// True if this join would be the actor's >1st meal this week, after they
// already ate >1 meal last week — i.e. >1 meal/week for >1 consecutive week.
export function isFrequentDiner(thisWeekCount: number, lastWeekCount: number) {
  return lastWeekCount > 1 && thisWeekCount >= 1;
}

// Maps a 0-100 reputation score to 1-5 stars — mirrors the frontend
// scoreToStars in apps/wantoff/src/lib/reputation.tsx.
export function scoreToStars(score: number): number {
  return Math.max(1, Math.min(5, Math.round(score / 20)));
}

// Rep gate for adding a listing to a group: ≥ 2 stars required.
export function canAddToGroup(reputationScore: number): boolean {
  return scoreToStars(reputationScore) >= 2;
}

// URL-safe slug from a display name.
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Generic exchange-protocol types (docs/exchange-protocol.md), shared by
// every itemType — not just mealmate.meal.
export type Fee = {
  scope: "protocol" | "platform" | "user";
  kind: "credit" | "currency" | "donation";
  creditType?: string;
  currency?: string;
  amount?: number;
  rate?: number;
  required: boolean;
  trigger?: string;
};

export type CurrencyOption = {
  currency: string;
  preferred?: boolean;
  walletAddress?: string;
};

const FEE_SCOPES = new Set(["protocol", "platform", "user"]);
const FEE_KINDS = new Set(["credit", "currency", "donation"]);

// Validates a `fees` body field for POST /listings. Returns `null` for
// "not an array of valid Fee objects" so the caller can 400; `undefined`
// input is treated as "no fees" (empty array), not an error.
export function parseFees(input: unknown): Fee[] | null {
  if (input === undefined) return [];
  if (!Array.isArray(input)) return null;

  const fees: Fee[] = [];
  for (const item of input) {
    if (typeof item !== "object" || item === null) return null;
    const { scope, kind, required, creditType, currency, amount, rate, trigger } = item as Record<string, unknown>;
    if (typeof scope !== "string" || !FEE_SCOPES.has(scope)) return null;
    if (typeof kind !== "string" || !FEE_KINDS.has(kind)) return null;
    if (typeof required !== "boolean") return null;
    if (amount !== undefined && typeof amount !== "number") return null;
    if (rate !== undefined && typeof rate !== "number") return null;
    if (creditType !== undefined && typeof creditType !== "string") return null;
    if (currency !== undefined && typeof currency !== "string") return null;
    if (trigger !== undefined && typeof trigger !== "string") return null;
    fees.push({
      scope: scope as Fee["scope"],
      kind: kind as Fee["kind"],
      required,
      ...(creditType !== undefined ? { creditType } : {}),
      ...(currency !== undefined ? { currency } : {}),
      ...(amount !== undefined ? { amount } : {}),
      ...(rate !== undefined ? { rate } : {}),
      ...(trigger !== undefined ? { trigger } : {}),
    });
  }
  return fees;
}

// Validates a `currencies` body field for POST /listings. Same
// null/undefined convention as parseFees.
export function parseCurrencyOptions(input: unknown): CurrencyOption[] | null {
  if (input === undefined) return [];
  if (!Array.isArray(input)) return null;

  const currencies: CurrencyOption[] = [];
  for (const item of input) {
    if (typeof item !== "object" || item === null) return null;
    const { currency, preferred, walletAddress } = item as Record<string, unknown>;
    if (typeof currency !== "string" || !currency.trim()) return null;
    if (preferred !== undefined && typeof preferred !== "boolean") return null;
    if (walletAddress !== undefined && typeof walletAddress !== "string") return null;
    currencies.push({
      currency,
      ...(preferred !== undefined ? { preferred } : {}),
      ...(walletAddress !== undefined ? { walletAddress } : {}),
    });
  }
  return currencies;
}

// Validates a `minReputation` body field, shared by every itemType's
// POST /listings handling. `ok: false` means the caller should 400.
export function parseMinReputation(input: unknown): { ok: true; value: number | null } | { ok: false } {
  if (input === undefined || input === null || input === "") {
    return { ok: true, value: null };
  }
  const value = Number(input);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    return { ok: false };
  }
  return { ok: true, value };
}

// Field-schema entry for an ItemTypeTemplate's `fieldSchema` — describes one
// attribute of a curated itemType's `attributes` payload, for driving a
// generic add/edit form.
export type FieldSchema = {
  name: string;
  label: string;
  type: "string" | "text" | "number" | "boolean" | "date" | "location" | "string[]";
  required: boolean;
};

const FIELD_TYPES = new Set(["string", "text", "number", "boolean", "date", "location", "string[]"]);

// Validates a `fieldSchema` body field for POST/PATCH /item-type-templates.
// Same null/undefined convention as parseFees: undefined -> [], invalid -> null.
export function parseFieldSchema(input: unknown): FieldSchema[] | null {
  if (input === undefined) return [];
  if (!Array.isArray(input)) return null;

  const fields: FieldSchema[] = [];
  for (const item of input) {
    if (typeof item !== "object" || item === null) return null;
    const { name, label, type, required } = item as Record<string, unknown>;
    if (typeof name !== "string" || !name.trim()) return null;
    if (typeof label !== "string" || !label.trim()) return null;
    if (typeof type !== "string" || !FIELD_TYPES.has(type)) return null;
    if (typeof required !== "boolean") return null;
    fields.push({ name, label, type: type as FieldSchema["type"], required });
  }
  return fields;
}

// Shapes a stored Listing + its host Actor into the response shape used by
// GET /listings, POST /listings, and the public profile endpoint.
export function serializeListing(
  listing: {
    id: string;
    type: string;
    itemType: string;
    status: string;
    attributes: unknown;
    fees: unknown;
    currencies: unknown;
    minReputation: number | null;
  },
  host: { id: string; displayName: string; reputationScore: number; circlesWallet: string | null },
  extra?: { distanceKm?: number | null; joinedByMe?: boolean },
) {
  return {
    id: listing.id,
    type: listing.type,
    itemType: listing.itemType,
    status: listing.status,
    attributes: listing.attributes,
    fees: listing.fees,
    currencies: listing.currencies,
    minReputation: listing.minReputation,
    ...(extra?.distanceKm !== undefined ? { distanceKm: extra.distanceKm } : {}),
    ...(extra?.joinedByMe !== undefined ? { joinedByMe: extra.joinedByMe } : {}),
    host: {
      id: host.id,
      displayName: host.displayName,
      reputationScore: host.reputationScore,
      circlesWallet: host.circlesWallet,
    },
  };
}
