// API client for the shared Mealmate/Wantoff backend. Same Actor/JWT
// account works across both frontends — see docs/exchange-protocol.md and
// docs/wantoff-app-plan.md "Decisions: Auth".
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export type Actor = {
  id: string;
  displayName: string;
  reputationScore: number;
  reviewCount: number;
  circlesWallet: string | null;
  circlesScore: number | null;
  location: { lat: number; lng: number; address?: string } | null;
  credits: Record<string, number>;
};

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

export type Listing = {
  id: string;
  type: string;
  itemType: string;
  status: string;
  attributes: Record<string, unknown>;
  fees: Fee[];
  currencies: CurrencyOption[];
  minReputation: number | null;
  joinedByMe?: boolean;
  inMyGroups?: boolean;
  communityName?: string | null;
  host: { id: string; displayName: string; reputationScore: number; circlesWallet: string | null };
};

export type PublicProfile = {
  id: string;
  displayName: string;
  reputationScore: number;
  reviewCount: number;
  circlesWallet: string | null;
  circlesScore: number | null;
  location: { lat: number; lng: number; address?: string } | null;
  listings: Listing[];
};

export type FieldSchema = {
  name: string;
  label: string;
  type: "string" | "text" | "number" | "boolean" | "date" | "location" | "string[]";
  required: boolean;
};

export type ItemTypeTemplate = {
  itemType: string;
  label: string;
  fieldSchema: FieldSchema[];
  defaultFees: Fee[];
  defaultCurrencies: CurrencyOption[];
};

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, headers, ...rest } = options;
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: {
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? `request failed: ${res.status}`);
  }
  return body as T;
}

export function login(email: string, password: string) {
  return request<{ token: string; actor: Actor }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function register(email: string, password: string, displayName: string) {
  return request<{ token: string; actor: Actor }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, displayName }),
  });
}

export function getMe(token: string) {
  return request<Actor>("/me", { token });
}

// "My wants & offers" dashboard feed — every itemType/status the actor owns.
export function getMyListings(token: string) {
  return request<Listing[]>("/listings?mine=true", { token });
}

// Public feed of open listings (offers and wants) across all itemTypes —
// used as a "what's out there" sample on the landing page.
export function getListings(token?: string) {
  return request<Listing[]>("/listings", token ? { token } : {});
}

export function getListing(id: string, token?: string) {
  return request<Listing>(`/listings/${id}`, token ? { token } : {});
}

export function getItemTypeTemplates() {
  return request<ItemTypeTemplate[]>("/item-type-templates");
}

export type NewListingBody = {
  itemType: string;
  type?: "OFFER" | "WANT";
  title: string;
  description?: string;
  location?: { lat?: number; lng?: number; address?: string };
  attributes?: Record<string, unknown>;
  fees?: Fee[];
  currencies?: CurrencyOption[];
  minReputation?: number | null;
  // mealmate.meal-specific top-level fields (see apps/backend/src/index.ts POST /listings)
  mealTime?: string;
  capacity?: number;
  dietaryInfo?: string;
};

export function createListing(token: string, body: NewListingBody) {
  return request<Listing>("/listings", { method: "POST", token, body: JSON.stringify(body) });
}

export function updateListing(token: string, id: string, body: Partial<NewListingBody> & { status?: string }) {
  return request<Listing>(`/listings/${id}`, { method: "PATCH", token, body: JSON.stringify(body) });
}

export function getPublicProfile(id: string) {
  return request<PublicProfile>(`/actors/${id}/public-profile`);
}

export function updateMe(
  token: string,
  body: {
    circlesWallet?: string | null;
    displayName?: string;
    location?: { lat: number; lng: number; address?: string } | null;
  },
) {
  return request<Actor>("/me", { method: "PATCH", token, body: JSON.stringify(body) });
}

export function getWalletNonce(address: string) {
  return request<{ nonce: string; message: string }>(`/auth/wallet/nonce?address=${encodeURIComponent(address)}`);
}

export function verifyWalletLogin(address: string, signature: string) {
  return request<{ token: string; actor: Actor }>("/auth/wallet/verify", {
    method: "POST",
    body: JSON.stringify({ address, signature }),
  });
}

export type Exchange = {
  id: string;
  status: string;
  listing: { id: string; title: unknown; mealTime?: unknown };
  otherActor: { id: string; displayName: string; reputationScore: number } | null;
  isIncoming: boolean;
  hasReviewedOther: boolean;
  createdAt: string;
};

export type ExchangeMessage = {
  id: string;
  body: string;
  senderId: string;
  senderName: string;
  createdAt: string;
};

export function getExchangeMessages(token: string, exchangeId: string) {
  return request<ExchangeMessage[]>(`/exchanges/${exchangeId}/messages`, { token });
}

export function sendExchangeMessage(token: string, exchangeId: string, body: string) {
  return request<ExchangeMessage>(`/exchanges/${exchangeId}/messages`, {
    method: "POST",
    token,
    body: JSON.stringify({ body }),
  });
}

export function getExchanges(token: string) {
  return request<Exchange[]>("/exchanges", { token });
}

export function updateExchangeStatus(token: string, id: string, status: "CONFIRMED" | "DECLINED") {
  return request<{ id: string; status: string }>(`/exchanges/${id}`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ status }),
  });
}

export type Group = {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  joinPolicy: "PUBLIC" | "INVITE_ONLY";
  createdAt: string;
  memberCount?: number;
  listingCount?: number;
  myRole?: "OWNER" | "MODERATOR" | "MEMBER" | null;
};

export type GroupDetail = Group & { listings: Listing[] };

export function getGroups(token?: string) {
  return request<Group[]>("/groups", token ? { token } : {});
}

export function getGroup(id: string, token?: string) {
  return request<GroupDetail>(`/groups/${id}`, token ? { token } : {});
}

export function createGroup(
  token: string,
  body: { name: string; description?: string; slug?: string; joinPolicy?: "PUBLIC" | "INVITE_ONLY" },
) {
  return request<Group>("/groups", { method: "POST", token, body: JSON.stringify(body) });
}

export function updateGroup(
  token: string,
  id: string,
  body: { name?: string; description?: string; joinPolicy?: "PUBLIC" | "INVITE_ONLY" },
) {
  return request<Group>(`/groups/${id}`, { method: "PATCH", token, body: JSON.stringify(body) });
}

export function joinGroup(token: string, id: string) {
  return request<{ groupId: string; role: string }>(`/groups/${id}/join`, { method: "POST", token });
}

export function addGroupMember(token: string, groupId: string, actorId: string, role?: "MEMBER" | "MODERATOR") {
  return request<{ groupId: string; actorId: string; role: string }>(`/groups/${groupId}/members`, {
    method: "POST",
    token,
    body: JSON.stringify({ actorId, role }),
  });
}

export function addListingToGroup(token: string, listingId: string, groupId: string) {
  return request<{ listingId: string; groupId: string }>(`/listings/${listingId}/groups/${groupId}`, {
    method: "POST",
    token,
  });
}

export function removeListingFromGroup(token: string, listingId: string, groupId: string) {
  return request<void>(`/listings/${listingId}/groups/${groupId}`, { method: "DELETE", token });
}

export function getListingGroups(listingId: string, token?: string) {
  return request<Group[]>(`/listings/${listingId}/groups`, token ? { token } : {});
}

// Fetch open listings by itemType — used by channel pages (e.g. /meals).
export function getListingsByType(itemType: string, token?: string) {
  return request<Listing[]>(`/listings?itemType=${encodeURIComponent(itemType)}`, token ? { token } : {});
}

// Join a mealmate.meal listing (credit-checked, capacity-aware).
export function joinMealListing(token: string, listingId: string) {
  return request<{ exchangeId: string; status: string; platformFee: unknown }>(
    `/listings/${listingId}/join`,
    { method: "POST", token },
  );
}

// Express interest in any non-mealmate.meal listing — creates a PENDING exchange.
export function requestListing(token: string, listingId: string, message?: string) {
  return request<{ exchangeId: string; status: string }>(
    `/listings/${listingId}/request`,
    { method: "POST", token, body: JSON.stringify({ message }) },
  );
}
