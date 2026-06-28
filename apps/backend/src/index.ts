import cors from "cors";
import express from "express";
import bcrypt from "bcryptjs";
import { verifyMessage, hashMessage, JsonRpcProvider, Contract } from "ethers";
import { prisma } from "./prisma.js";
import { optionalAuth, requireAuth, signToken, type AuthedRequest } from "./auth.js";
import { notify } from "./mailer.js";
import {
  blendReputationScore,
  canAddToGroup,
  distanceKm,
  isFrequentDiner,
  nextReputationScore,
  parseCurrencyOptions,
  parseFees,
  parseFieldSchema,
  parseMinReputation,
  serializeListing,
  slugify,
  type Fee,
} from "./lib.js";
import { fetchCirclesTrustScore } from "./circles.js";

const app = express();
const port = process.env.PORT ?? 3000;

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// ── Wallet auth nonce store ───────────────────────────────────────────────────
// In-memory; nonces expire after 5 minutes. Fine for single-instance deploys.
const nonceStore = new Map<string, { nonce: string; expiresAt: number }>();

function walletLoginMessage(address: string, nonce: string): string {
  return `Sign in to Wantoff\n\nAddress: ${address}\nNonce: ${nonce}\n\nThis request will not trigger a blockchain transaction or cost any gas.`;
}

function serializeActor(actor: {
  id: string;
  displayName: string;
  reputationScore: number;
  reviewCount: number;
  circlesWallet: string | null;
  circlesScore: number | null;
  location: unknown;
  credits: { creditType: string; amount: { toNumber(): number } }[];
}) {
  return {
    id: actor.id,
    displayName: actor.displayName,
    reputationScore: blendReputationScore(actor.reputationScore, actor.circlesScore),
    reviewCount: actor.reviewCount,
    circlesWallet: actor.circlesWallet,
    circlesScore: actor.circlesScore,
    location: actor.location as { lat: number; lng: number; address?: string } | null,
    credits: Object.fromEntries(actor.credits.map((c) => [c.creditType, c.amount.toNumber()])),
  };
}

app.post("/auth/register", async (req, res) => {
  const { email, password, displayName } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string" || typeof displayName !== "string") {
    return res.status(400).json({ error: "email, password and displayName are required" });
  }

  const existing = await prisma.actor.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: "email already registered" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const actor = await prisma.actor.create({
    data: {
      email,
      passwordHash,
      displayName,
      credits: { create: { creditType: "mealmate.meal-credit", amount: 3 } },
    },
    include: { credits: true },
  });

  res.status(201).json({ token: signToken(actor.id), actor: serializeActor(actor) });
});

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "email and password are required" });
  }

  const actor = await prisma.actor.findUnique({ where: { email }, include: { credits: true } });
  if (!actor || !actor.passwordHash || !(await bcrypt.compare(password, actor.passwordHash))) {
    return res.status(401).json({ error: "invalid email or password" });
  }

  res.json({ token: signToken(actor.id), actor: serializeActor(actor) });
});

// GET /auth/wallet/nonce?address=0x... — issue a one-time nonce for wallet sign-in.
app.get("/auth/wallet/nonce", (req, res) => {
  const address = typeof req.query.address === "string" ? req.query.address.toLowerCase() : null;
  if (!address || !/^0x[0-9a-f]{40}$/.test(address)) {
    return res.status(400).json({ error: "valid Ethereum address required" });
  }
  const nonce = crypto.randomUUID().replace(/-/g, "");
  nonceStore.set(address, { nonce, expiresAt: Date.now() + 5 * 60 * 1000 });
  res.json({ nonce, message: walletLoginMessage(req.query.address as string, nonce) });
});

// POST /auth/wallet/verify — verify signed nonce, find-or-create actor, return JWT.
app.post("/auth/wallet/verify", async (req, res) => {
  const { address, signature } = req.body ?? {};
  if (typeof address !== "string" || typeof signature !== "string") {
    return res.status(400).json({ error: "address and signature are required" });
  }

  const stored = nonceStore.get(address.toLowerCase());
  if (!stored || Date.now() > stored.expiresAt) {
    nonceStore.delete(address.toLowerCase());
    return res.status(400).json({ error: "nonce expired or not found — request a new one" });
  }

  const message = walletLoginMessage(address, stored.nonce);

  // Try EOA (MetaMask/standalone) first, then ERC-1271 Safe (Circles embedded).
  let sigValid = false;
  try {
    const recovered = verifyMessage(message, signature);
    sigValid = recovered.toLowerCase() === address.toLowerCase();
  } catch { /* not an EOA sig */ }

  if (!sigValid) {
    // ERC-1271: call isValidSignature on the Safe contract at address.
    try {
      const rpc = process.env.GNOSIS_RPC_URL ?? "https://rpc.gnosischain.com";
      const provider = new JsonRpcProvider(rpc);
      const abi = ["function isValidSignature(bytes32,bytes) view returns (bytes4)"];
      const safe = new Contract(address, abi, provider);
      // SDK signs with erc1271 type: host hashes message with EIP-191 prefix first.
      const eip191Hash = hashMessage(message);
      const result: string = await safe.isValidSignature(eip191Hash, signature);
      sigValid = result === "0x1626ba7e";
    } catch { /* not a Safe or RPC failed */ }
  }

  if (!sigValid) {
    return res.status(401).json({ error: "signature does not match address" });
  }

  nonceStore.delete(address.toLowerCase());

  let actor = await prisma.actor.findFirst({ where: { circlesWallet: address }, include: { credits: true } });
  if (!actor) {
    actor = await prisma.actor.create({
      data: {
        circlesWallet: address,
        displayName: `${address.slice(0, 6)}…${address.slice(-4)}`,
        credits: { create: { creditType: "mealmate.meal-credit", amount: 3 } },
      },
      include: { credits: true },
    });
  }

  res.json({ token: signToken(actor.id), actor: serializeActor(actor) });
});

app.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const actor = await prisma.actor.findUnique({ where: { id: req.actorId }, include: { credits: true } });
  if (!actor) {
    return res.status(404).json({ error: "actor not found" });
  }
  res.json(serializeActor(actor));
});

app.patch("/me", requireAuth, async (req: AuthedRequest, res) => {
  const { circlesWallet, location, displayName } = req.body ?? {};
  if (circlesWallet !== undefined && circlesWallet !== null && typeof circlesWallet !== "string") {
    return res.status(400).json({ error: "circlesWallet must be a string or null" });
  }

  let locationData: { lat: number; lng: number; address?: string } | null | undefined;
  if (location !== undefined) {
    if (location === null) {
      locationData = null;
    } else if (
      typeof location === "object" &&
      typeof location.lat === "number" &&
      typeof location.lng === "number"
    ) {
      locationData = {
        lat: location.lat,
        lng: location.lng,
        address: typeof location.address === "string" ? location.address : undefined,
      };
    } else {
      return res.status(400).json({ error: "location must be null or { lat, lng, address? }" });
    }
  }

  const normalizedWallet = circlesWallet !== undefined
    ? (circlesWallet === null ? null : circlesWallet.trim() || null)
    : undefined;

  // Fetch trust score from Circles network when wallet is being set/changed.
  let newCirclesScore: number | null | undefined;
  if (normalizedWallet) {
    newCirclesScore = await fetchCirclesTrustScore(normalizedWallet);
  } else if (normalizedWallet === null) {
    newCirclesScore = null;
  }

  const actor = await prisma.actor.update({
    where: { id: req.actorId },
    data: {
      ...(normalizedWallet !== undefined ? { circlesWallet: normalizedWallet } : {}),
      ...(newCirclesScore !== undefined ? { circlesScore: newCirclesScore } : {}),
      ...(locationData !== undefined ? { location: locationData === null ? { set: null } : locationData } : {}),
      ...(typeof displayName === "string" && displayName.trim() ? { displayName: displayName.trim() } : {}),
    },
    include: { credits: true },
  });

  res.json(serializeActor(actor));
});

// Requires requireAuth to have run first (needs req.actorId).
async function requireAdmin(req: AuthedRequest, res: express.Response, next: express.NextFunction) {
  const actor = await prisma.actor.findUnique({ where: { id: req.actorId } });
  if (!actor?.isAdmin) {
    return res.status(403).json({ error: "admin access required" });
  }
  next();
}

function serializeItemTypeTemplate(template: {
  itemType: string;
  label: string;
  fieldSchema: unknown;
  defaultFees: unknown;
  defaultCurrencies: unknown;
}) {
  return {
    itemType: template.itemType,
    label: template.label,
    fieldSchema: template.fieldSchema,
    defaultFees: template.defaultFees,
    defaultCurrencies: template.defaultCurrencies,
  };
}

// Public: list of itemType templates for the "add a want/offer" form picker.
app.get("/item-type-templates", async (_req, res) => {
  const templates = await prisma.itemTypeTemplate.findMany({ orderBy: { itemType: "asc" } });
  res.json(templates.map(serializeItemTypeTemplate));
});

app.post("/item-type-templates", requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  const { itemType, label, fieldSchema, defaultFees, defaultCurrencies } = req.body ?? {};
  if (typeof itemType !== "string" || !itemType.trim()) {
    return res.status(400).json({ error: "itemType is required" });
  }
  if (typeof label !== "string" || !label.trim()) {
    return res.status(400).json({ error: "label is required" });
  }
  const fields = parseFieldSchema(fieldSchema);
  if (fields === null) {
    return res.status(400).json({ error: "invalid fieldSchema" });
  }
  const fees = parseFees(defaultFees);
  if (fees === null) {
    return res.status(400).json({ error: "invalid defaultFees" });
  }
  const currencies = parseCurrencyOptions(defaultCurrencies);
  if (currencies === null) {
    return res.status(400).json({ error: "invalid defaultCurrencies" });
  }

  const existing = await prisma.itemTypeTemplate.findUnique({ where: { itemType: itemType.trim() } });
  if (existing) {
    return res.status(409).json({ error: "itemType template already exists" });
  }

  const template = await prisma.itemTypeTemplate.create({
    data: {
      itemType: itemType.trim(),
      label: label.trim(),
      fieldSchema: fields,
      defaultFees: fees,
      defaultCurrencies: currencies,
    },
  });
  res.status(201).json(serializeItemTypeTemplate(template));
});

app.patch("/item-type-templates/:itemType", requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  const existing = await prisma.itemTypeTemplate.findUnique({ where: { itemType: req.params.itemType } });
  if (!existing) {
    return res.status(404).json({ error: "itemType template not found" });
  }

  const { label, fieldSchema, defaultFees, defaultCurrencies } = req.body ?? {};
  const data: Record<string, unknown> = {};

  if (label !== undefined) {
    if (typeof label !== "string" || !label.trim()) {
      return res.status(400).json({ error: "label must be a non-empty string" });
    }
    data.label = label.trim();
  }
  if (fieldSchema !== undefined) {
    const fields = parseFieldSchema(fieldSchema);
    if (fields === null) {
      return res.status(400).json({ error: "invalid fieldSchema" });
    }
    data.fieldSchema = fields;
  }
  if (defaultFees !== undefined) {
    const fees = parseFees(defaultFees);
    if (fees === null) {
      return res.status(400).json({ error: "invalid defaultFees" });
    }
    data.defaultFees = fees;
  }
  if (defaultCurrencies !== undefined) {
    const currencies = parseCurrencyOptions(defaultCurrencies);
    if (currencies === null) {
      return res.status(400).json({ error: "invalid defaultCurrencies" });
    }
    data.defaultCurrencies = currencies;
  }

  const template = await prisma.itemTypeTemplate.update({ where: { itemType: existing.itemType }, data });
  res.json(serializeItemTypeTemplate(template));
});

app.get("/listings", optionalAuth, async (req: AuthedRequest, res) => {
  const itemType = typeof req.query.itemType === "string" ? req.query.itemType : undefined;

  // ?mine=true: the actor's own listings across every itemType and status
  // (for a "manage my wants & offers" dashboard) — skips proximity/joined
  // logic entirely, which only make sense for browsing other people's listings.
  if (req.query.mine === "true") {
    if (!req.actorId) {
      return res.status(401).json({ error: "authentication required" });
    }
    const mine = await prisma.listing.findMany({
      where: { actorId: req.actorId, ...(itemType ? { itemType } : {}) },
      include: { actor: true },
      orderBy: { createdAt: "desc" },
    });
    return res.json(mine.map((listing) => serializeListing(listing, listing.actor)));
  }

  // Viewer location: explicit lat/lng query params win, else the logged-in actor's saved location.
  let viewerLocation: { lat: number; lng: number } | null = null;
  const queryLat = Number(req.query.lat);
  const queryLng = Number(req.query.lng);
  if (Number.isFinite(queryLat) && Number.isFinite(queryLng)) {
    viewerLocation = { lat: queryLat, lng: queryLng };
  } else if (req.actorId) {
    const viewer = await prisma.actor.findUnique({ where: { id: req.actorId } });
    const loc = viewer?.location as { lat: number; lng: number } | null;
    if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) {
      viewerLocation = { lat: loc.lat, lng: loc.lng };
    }
  }

  // Meals the viewer has joined stay visible even after they close (full),
  // so the viewer can still see/refer back to meals they're committed to.
  let joinedListingIds: string[] = [];
  let myGroupListingIds: Set<string> = new Set();
  const listingGroupName = new Map<string, string | null>();
  if (req.actorId) {
    const [joinedExchanges, myMemberships] = await Promise.all([
      prisma.exchange.findMany({
        where: { participantIds: { has: req.actorId }, offerListing: { actorId: { not: req.actorId } } },
        select: { offerListingId: true },
      }),
      prisma.groupMembership.findMany({
        where: { actorId: req.actorId },
        select: { groupId: true },
      }),
    ]);
    joinedListingIds = joinedExchanges.map((e) => e.offerListingId);

    if (myMemberships.length > 0) {
      const myGroupIds = myMemberships.map((m) => m.groupId);
      const [groupListings, myGroups] = await Promise.all([
        prisma.listingGroup.findMany({
          where: { groupId: { in: myGroupIds } },
          select: { listingId: true, groupId: true },
        }),
        prisma.group.findMany({
          where: { id: { in: myGroupIds } },
          select: { id: true, name: true },
        }),
      ]);
      const groupNameById = new Map(myGroups.map((g) => [g.id, g.name]));
      // Map each listing to the first matching group name (stable: groups returned in DB order).
      for (const lg of groupListings) {
        if (!listingGroupName.has(lg.listingId)) {
          listingGroupName.set(lg.listingId, groupNameById.get(lg.groupId) ?? null);
        }
      }
      myGroupListingIds = new Set(groupListings.map((lg) => lg.listingId));
    }
  }

  const listings = await prisma.listing.findMany({
    where: {
      ...(itemType ? { itemType } : {}),
      OR: [{ status: "OPEN" }, ...(joinedListingIds.length ? [{ id: { in: joinedListingIds } }] : [])],
    },
    include: { actor: true },
    // Higher-reputation hosts are boosted to the top, newest first within that.
    orderBy: [{ actor: { reputationScore: "desc" } }, { createdAt: "desc" }],
  });

  const joinedListingIdSet = new Set(joinedListingIds);

  const serialized = listings.map((listing) => {
    const attributes = listing.attributes as Record<string, unknown>;
    const loc = attributes.location as { lat?: number; lng?: number } | undefined;
    const distanceKmFromViewer =
      viewerLocation && loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)
        ? distanceKm(viewerLocation, { lat: loc.lat!, lng: loc.lng! })
        : null;
    return serializeListing(listing, listing.actor, {
      distanceKm: distanceKmFromViewer,
      joinedByMe: joinedListingIdSet.has(listing.id),
      inMyGroups: myGroupListingIds.has(listing.id),
      communityName: listingGroupName.get(listing.id) ?? null,
    });
  });

  // Sort priority: joined > community listings > other people's > own (at bottom).
  const NEARBY_RADIUS_KM = 25;
  serialized.sort((a, b) => {
    if (a.joinedByMe !== b.joinedByMe) return a.joinedByMe ? -1 : 1;
    // Own listings are demoted to the bottom of the feed (dashboard covers them).
    const aOwn = req.actorId ? a.host.id === req.actorId : false;
    const bOwn = req.actorId ? b.host.id === req.actorId : false;
    if (aOwn !== bOwn) return aOwn ? 1 : -1;
    // Listings from the viewer's communities come before everything else.
    if (a.inMyGroups !== b.inMyGroups) return a.inMyGroups ? -1 : 1;
    if (viewerLocation) {
      const aDist = a.distanceKm ?? null;
      const bDist = b.distanceKm ?? null;
      const aNear = aDist !== null && aDist <= NEARBY_RADIUS_KM;
      const bNear = bDist !== null && bDist <= NEARBY_RADIUS_KM;
      if (aNear !== bNear) return aNear ? -1 : 1;
      if (aNear && bNear) return aDist! - bDist!;
    }
    return 0; // keep existing reputation/recency order
  });

  res.json(serialized);
});

app.get("/listings/:id", optionalAuth, async (req: AuthedRequest, res) => {
  const listing = await prisma.listing.findUnique({
    where: { id: req.params.id },
    include: { actor: true },
  });
  if (!listing) return res.status(404).json({ error: "listing not found" });
  res.json(serializeListing(listing, listing.actor));
});

app.post("/listings", requireAuth, async (req: AuthedRequest, res) => {
  const actorId = req.actorId!;
  const body = req.body ?? {};
  const itemType = typeof body.itemType === "string" && body.itemType.trim() ? body.itemType.trim() : "mealmate.meal";

  const actor = await prisma.actor.findUniqueOrThrow({ where: { id: actorId } });

  if (itemType === "mealmate.meal") {
    const { title, description, location, mealTime, capacity, dietaryInfo, minReputation, creditFeeAmount, donationSuggestion } = body;

    if (typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "title is required" });
    }
    if (typeof mealTime !== "string" || Number.isNaN(Date.parse(mealTime))) {
      return res.status(400).json({ error: "mealTime must be a valid date" });
    }
    const cap = Number(capacity);
    if (!Number.isInteger(cap) || cap < 1) {
      return res.status(400).json({ error: "capacity must be a positive integer" });
    }
    const creditFee = creditFeeAmount === undefined ? 1 : Number(creditFeeAmount);
    if (!Number.isFinite(creditFee) || creditFee < 0) {
      return res.status(400).json({ error: "creditFeeAmount must be a non-negative number" });
    }
    const minRepResult = parseMinReputation(minReputation);
    if (!minRepResult.ok) {
      return res.status(400).json({ error: "minReputation must be between 0 and 100" });
    }

    const fees: Fee[] = [
      { scope: "protocol", kind: "credit", creditType: "mealmate.meal-credit", amount: creditFee, required: true },
    ];
    if (actor.circlesWallet) {
      const donation = Number(donationSuggestion);
      fees.push({
        scope: "user",
        kind: "donation",
        currency: "CRC",
        amount: Number.isFinite(donation) && donation > 0 ? donation : undefined,
        required: false,
      });
    }

    const currencies = actor.circlesWallet ? [{ currency: "CRC", walletAddress: actor.circlesWallet }] : [];

    const listing = await prisma.listing.create({
      data: {
        type: "OFFER",
        actorId,
        itemType: "mealmate.meal",
        status: "OPEN",
        fees,
        currencies,
        minReputation: minRepResult.value,
        attributes: {
          title: title.trim(),
          description: typeof description === "string" ? description.trim() : "",
          location: location && typeof location === "object" ? location : undefined,
          mealTime,
          capacity: cap,
          spotsRemaining: cap,
          dietaryInfo: typeof dietaryInfo === "string" && dietaryInfo.trim() ? dietaryInfo.trim() : undefined,
        },
      },
      include: { actor: true },
    });

    return res.status(201).json(serializeListing(listing, listing.actor));
  }

  // Generic itemType (e.g. Wantoff curated templates, or `wantoff.other`
  // freeform): title/description/location plus pass-through attributes,
  // fees and currencies validated against the shared protocol shapes.
  const { title, description, location, attributes, fees, currencies, minReputation, type } = body;

  if (typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "title is required" });
  }
  const minRepResult = parseMinReputation(minReputation);
  if (!minRepResult.ok) {
    return res.status(400).json({ error: "minReputation must be between 0 and 100" });
  }
  const parsedFees = parseFees(fees);
  if (parsedFees === null) {
    return res.status(400).json({ error: "fees must be an array of valid Fee objects" });
  }
  const parsedCurrencies = parseCurrencyOptions(currencies);
  if (parsedCurrencies === null) {
    return res.status(400).json({ error: "currencies must be an array of valid CurrencyOption objects" });
  }

  const listing = await prisma.listing.create({
    data: {
      type: type === "WANT" ? "WANT" : "OFFER",
      actorId,
      itemType,
      status: "OPEN",
      fees: parsedFees,
      currencies: parsedCurrencies,
      minReputation: minRepResult.value,
      attributes: {
        title: title.trim(),
        description: typeof description === "string" ? description.trim() : "",
        location: location && typeof location === "object" ? location : undefined,
        ...(attributes && typeof attributes === "object" ? attributes : {}),
      },
    },
    include: { actor: true },
  });

  res.status(201).json(serializeListing(listing, listing.actor));
});

app.patch("/listings/:id", requireAuth, async (req: AuthedRequest, res) => {
  const actorId = req.actorId!;
  const existing = await prisma.listing.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.actorId !== actorId) {
    return res.status(404).json({ error: "listing not found" });
  }

  const { status, attributes, minReputation, fees, currencies } = req.body ?? {};
  const data: Record<string, unknown> = {};

  if (status !== undefined) {
    if (status !== "OPEN" && status !== "CANCELLED") {
      return res.status(400).json({ error: "status can only be set to OPEN or CANCELLED" });
    }
    data.status = status;
  }
  if (attributes !== undefined) {
    if (typeof attributes !== "object" || attributes === null) {
      return res.status(400).json({ error: "attributes must be an object" });
    }
    data.attributes = { ...(existing.attributes as Record<string, unknown>), ...attributes };
  }
  if (minReputation !== undefined) {
    const minRepResult = parseMinReputation(minReputation);
    if (!minRepResult.ok) {
      return res.status(400).json({ error: "minReputation must be between 0 and 100" });
    }
    data.minReputation = minRepResult.value;
  }
  if (fees !== undefined) {
    const parsedFees = parseFees(fees);
    if (parsedFees === null) {
      return res.status(400).json({ error: "fees must be an array of valid Fee objects" });
    }
    data.fees = parsedFees;
  }
  if (currencies !== undefined) {
    const parsedCurrencies = parseCurrencyOptions(currencies);
    if (parsedCurrencies === null) {
      return res.status(400).json({ error: "currencies must be an array of valid CurrencyOption objects" });
    }
    data.currencies = parsedCurrencies;
  }

  const listing = await prisma.listing.update({ where: { id: existing.id }, data, include: { actor: true } });
  res.json(serializeListing(listing, listing.actor));
});

app.delete("/listings/:id", requireAuth, async (req: AuthedRequest, res) => {
  const actorId = req.actorId!;
  const existing = await prisma.listing.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.actorId !== actorId) {
    return res.status(404).json({ error: "listing not found" });
  }

  // Soft-delete: mark cancelled rather than removing the row, so it stays
  // referenceable by any Exchange that was created against it.
  const listing = await prisma.listing.update({
    where: { id: existing.id },
    data: { status: "CANCELLED" },
    include: { actor: true },
  });
  res.json(serializeListing(listing, listing.actor));
});

// Public, unauthenticated profile — designed to be linked or embedded
// (e.g. `<iframe>`) from other sites, per docs/wantoff-app-plan.md.
app.get("/actors/:id/public-profile", async (req, res) => {
  const actor = await prisma.actor.findUnique({ where: { id: req.params.id } });
  if (!actor) {
    return res.status(404).json({ error: "actor not found" });
  }

  const listings = await prisma.listing.findMany({
    where: { actorId: actor.id, status: "OPEN" },
    orderBy: { createdAt: "desc" },
  });

  const loc = actor.location as { lat: number; lng: number; address?: string } | null;
  res.json({
    id: actor.id,
    displayName: actor.displayName,
    reputationScore: blendReputationScore(actor.reputationScore, actor.circlesScore),
    reviewCount: actor.reviewCount,
    circlesWallet: actor.circlesWallet,
    circlesScore: actor.circlesScore,
    location: loc ?? null,
    listings: listings.map((listing) => serializeListing(listing, actor)),
  });
});

// Counts meals `actorId` has eaten (joined someone else's offer) with
// createdAt in [start, end), used to detect frequent-diner platform fees.
async function countMealsEaten(actorId: string, start: Date, end: Date) {
  return prisma.exchange.count({
    where: {
      participantIds: { has: actorId },
      offerListing: { actorId: { not: actorId } },
      createdAt: { gte: start, lt: end },
    },
  });
}

const PLATFORM_FEE: Fee = {
  scope: "platform",
  kind: "currency",
  currency: "GBP",
  amount: 1,
  required: true,
  trigger: "frequent-diner: >1 meal/week for >1 consecutive week",
};
const PLATFORM_ACTOR_ID = "platform";

app.post("/listings/:id/join", requireAuth, async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const actorId = req.actorId!;

  const listing = await prisma.listing.findUnique({ where: { id }, include: { actor: true } });
  if (!listing) {
    return res.status(404).json({ error: "listing not found" });
  }
  if (listing.type !== "OFFER" || listing.itemType !== "mealmate.meal") {
    return res.status(400).json({ error: "only mealmate.meal offers can be joined" });
  }
  if (listing.status !== "OPEN") {
    return res.status(400).json({ error: "listing is not open" });
  }
  if (listing.actorId === actorId) {
    return res.status(400).json({ error: "cannot join your own meal" });
  }

  const joiner = await prisma.actor.findUniqueOrThrow({ where: { id: actorId } });
  if (listing.minReputation !== null && joiner.reputationScore < listing.minReputation) {
    return res.status(403).json({ error: `this meal requires a reputation score of at least ${listing.minReputation}` });
  }

  const attributes = listing.attributes as Record<string, unknown>;
  const spotsRemaining = Number(attributes.spotsRemaining ?? 0);
  if (spotsRemaining <= 0) {
    return res.status(400).json({ error: "no spots remaining" });
  }

  const fees = listing.fees as Fee[];
  const creditFee = fees.find((f) => f.kind === "credit" && f.required);

  if (creditFee?.creditType) {
    const balance = await prisma.creditBalance.findUnique({
      where: { actorId_creditType: { actorId, creditType: creditFee.creditType } },
    });
    const amount = creditFee.amount ?? 0;
    if (!balance || balance.amount.toNumber() < amount) {
      return res.status(400).json({ error: "insufficient credits" });
    }
  }

  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const now = new Date();
  const [thisWeekCount, lastWeekCount] = await Promise.all([
    countMealsEaten(actorId, new Date(now.getTime() - WEEK_MS), now),
    countMealsEaten(actorId, new Date(now.getTime() - 2 * WEEK_MS), new Date(now.getTime() - WEEK_MS)),
  ]);
  const platformFeeTriggered = isFrequentDiner(thisWeekCount, lastWeekCount);

  const exchange = await prisma.$transaction(async (tx) => {
    const remaining = spotsRemaining - 1;
    await tx.listing.update({
      where: { id: listing.id },
      data: {
        attributes: { ...attributes, spotsRemaining: remaining },
        status: remaining <= 0 ? "CLOSED" : "OPEN",
      },
    });

    const appliedFees: Fee[] = [];

    if (creditFee?.creditType) {
      const amount = creditFee.amount ?? 0;
      await tx.creditBalance.update({
        where: { actorId_creditType: { actorId, creditType: creditFee.creditType } },
        data: { amount: { decrement: amount } },
      });
      await tx.creditBalance.upsert({
        where: { actorId_creditType: { actorId: listing.actorId, creditType: creditFee.creditType } },
        create: { actorId: listing.actorId, creditType: creditFee.creditType, amount },
        update: { amount: { increment: amount } },
      });
      appliedFees.push(creditFee);
    }

    if (platformFeeTriggered) {
      appliedFees.push(PLATFORM_FEE);
    }

    const created = await tx.exchange.create({
      data: {
        offerListingId: listing.id,
        participantIds: [listing.actorId, actorId],
        status: "CONFIRMED",
        appliedFees,
      },
    });

    await tx.exchange.update({ where: { id: created.id }, data: { messageThreadId: created.id } });

    if (creditFee?.creditType) {
      await tx.payment.create({
        data: {
          exchangeId: created.id,
          fromActorId: actorId,
          toActorId: listing.actorId,
          kind: "CREDIT",
          creditType: creditFee.creditType,
          amount: creditFee.amount ?? 0,
          status: "SETTLED",
          settledAt: new Date(),
        },
      });
    }

    if (platformFeeTriggered) {
      await tx.payment.create({
        data: {
          exchangeId: created.id,
          fromActorId: actorId,
          toActorId: PLATFORM_ACTOR_ID,
          kind: "CURRENCY",
          currency: PLATFORM_FEE.currency,
          amount: PLATFORM_FEE.amount ?? 0,
          status: "PENDING",
        },
      });
    }

    return created;
  });

  notify
    .mealJoined(listing.actor, joiner, (attributes.title as string) ?? "your meal")
    .catch((err) => console.error("[mailer] mealJoined failed:", err));
  notify
    .joinConfirmed(joiner, listing.actor, (attributes.title as string) ?? "your meal", attributes.mealTime as string, creditFee?.amount ?? 0)
    .catch((err) => console.error("[mailer] joinConfirmed failed:", err));

  res.status(201).json({
    exchangeId: exchange.id,
    status: exchange.status,
    platformFee: platformFeeTriggered ? PLATFORM_FEE : null,
  });
});

// POST /listings/:id/request — express interest in any non-mealmate.meal listing.
// Creates a PENDING exchange (no credit checks, no capacity decrement — those are
// mealmate.meal concerns). Use POST /listings/:id/join for mealmate.meal.
app.post("/listings/:id/request", requireAuth, async (req: AuthedRequest, res) => {
  const actorId = req.actorId!;
  const listing = await prisma.listing.findUnique({ where: { id: req.params.id } });
  if (!listing) return res.status(404).json({ error: "listing not found" });
  if (listing.itemType === "mealmate.meal") {
    return res.status(400).json({ error: "use POST /listings/:id/join for mealmate.meal listings" });
  }
  if (listing.status !== "OPEN") return res.status(400).json({ error: "listing is not open" });
  if (listing.actorId === actorId) return res.status(400).json({ error: "cannot request your own listing" });

  const requester = await prisma.actor.findUniqueOrThrow({ where: { id: actorId } });
  if (listing.minReputation !== null && requester.reputationScore < listing.minReputation) {
    return res.status(403).json({ error: `this listing requires a reputation score of at least ${listing.minReputation}` });
  }

  const existing = await prisma.exchange.findFirst({
    where: { offerListingId: listing.id, participantIds: { has: actorId } },
  });
  if (existing) return res.status(409).json({ error: "you have already requested this listing" });

  const exchange = await prisma.$transaction(async (tx) => {
    const created = await tx.exchange.create({
      data: {
        offerListingId: listing.id,
        participantIds: [listing.actorId, actorId],
        status: "PENDING",
        appliedFees: [],
      },
    });
    await tx.exchange.update({ where: { id: created.id }, data: { messageThreadId: created.id } });
    const { message } = req.body ?? {};
    if (typeof message === "string" && message.trim()) {
      await tx.message.create({
        data: { threadId: created.id, senderId: actorId, body: message.trim() },
      });
    }
    return created;
  });

  res.status(201).json({ exchangeId: exchange.id, status: exchange.status });
});

async function loadExchangeForActor(exchangeId: string, actorId: string) {
  const exchange = await prisma.exchange.findUnique({
    where: { id: exchangeId },
    include: { offerListing: { include: { actor: true } }, reviews: true },
  });
  if (!exchange || !exchange.participantIds.includes(actorId)) {
    return null;
  }
  return exchange;
}

app.get("/exchanges", requireAuth, async (req: AuthedRequest, res) => {
  const actorId = req.actorId!;

  const exchanges = await prisma.exchange.findMany({
    where: { participantIds: { has: actorId } },
    include: { offerListing: { include: { actor: true } }, reviews: true },
    orderBy: { createdAt: "desc" },
  });

  const otherActorIds = [...new Set(exchanges.flatMap((e) => e.participantIds.filter((p) => p !== actorId)))];
  const otherActors = await prisma.actor.findMany({ where: { id: { in: otherActorIds } } });
  const actorById = new Map(otherActors.map((a) => [a.id, a]));

  res.json(
    exchanges.map((exchange) => {
      const otherId = exchange.participantIds.find((p) => p !== actorId);
      const other = otherId ? actorById.get(otherId) : undefined;
      return {
        id: exchange.id,
        status: exchange.status,
        listing: {
          id: exchange.offerListing.id,
          title: (exchange.offerListing.attributes as Record<string, unknown>).title,
          mealTime: (exchange.offerListing.attributes as Record<string, unknown>).mealTime,
        },
        otherActor: other ? { id: other.id, displayName: other.displayName } : null,
        hasReviewedOther: exchange.reviews.some((r) => r.reviewerId === actorId),
        createdAt: exchange.createdAt,
      };
    }),
  );
});

app.get("/exchanges/:id/messages", requireAuth, async (req: AuthedRequest, res) => {
  const exchange = await loadExchangeForActor(req.params.id, req.actorId!);
  if (!exchange) {
    return res.status(404).json({ error: "exchange not found" });
  }

  const messages = await prisma.message.findMany({
    where: { threadId: exchange.id },
    include: { sender: true },
    orderBy: { createdAt: "asc" },
  });

  res.json(
    messages.map((m) => ({
      id: m.id,
      body: m.body,
      senderId: m.senderId,
      senderName: m.sender.displayName,
      createdAt: m.createdAt,
    })),
  );
});

app.post("/exchanges/:id/messages", requireAuth, async (req: AuthedRequest, res) => {
  const actorId = req.actorId!;
  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  if (!body) {
    return res.status(400).json({ error: "body is required" });
  }

  const exchange = await loadExchangeForActor(req.params.id, actorId);
  if (!exchange) {
    return res.status(404).json({ error: "exchange not found" });
  }

  const [message, sender] = await Promise.all([
    prisma.message.create({ data: { threadId: exchange.id, senderId: actorId, body } }),
    prisma.actor.findUniqueOrThrow({ where: { id: actorId } }),
  ]);

  const recipientId = exchange.participantIds.find((p) => p !== actorId);
  if (recipientId) {
    const recipient = await prisma.actor.findUnique({ where: { id: recipientId } });
    const title = (exchange.offerListing.attributes as Record<string, unknown>).title as string | undefined;
    if (recipient) {
      notify.newMessage(recipient, sender, title ?? "your meal", body).catch((err) => console.error("[mailer] newMessage failed:", err));
    }
  }

  res.status(201).json({ id: message.id, body: message.body, senderId: message.senderId, createdAt: message.createdAt });
});

app.post("/exchanges/:id/reviews", requireAuth, async (req: AuthedRequest, res) => {
  const actorId = req.actorId!;
  const { revieweeId, score, comment, tags } = req.body ?? {};

  if (typeof revieweeId !== "string" || typeof score !== "number" || score < 0 || score > 100) {
    return res.status(400).json({ error: "revieweeId and score (0-100) are required" });
  }

  const exchange = await loadExchangeForActor(req.params.id, actorId);
  if (!exchange) {
    return res.status(404).json({ error: "exchange not found" });
  }
  if (!exchange.participantIds.includes(revieweeId) || revieweeId === actorId) {
    return res.status(400).json({ error: "revieweeId must be the other participant" });
  }

  const existing = await prisma.review.findFirst({
    where: { exchangeId: exchange.id, reviewerId: actorId, revieweeId },
  });
  if (existing) {
    return res.status(409).json({ error: "already reviewed this participant for this exchange" });
  }

  const weight = 1;

  const review = await prisma.$transaction(async (tx) => {
    const created = await tx.review.create({
      data: {
        exchangeId: exchange.id,
        reviewerId: actorId,
        revieweeId,
        score,
        comment: typeof comment === "string" ? comment : undefined,
        tags: Array.isArray(tags) ? tags.filter((t): t is string => typeof t === "string") : [],
        weight,
      },
    });

    const reviewee = await tx.actor.findUniqueOrThrow({ where: { id: revieweeId } });
    const nextScore = nextReputationScore(reviewee.reputationScore, score, weight);

    await tx.actor.update({
      where: { id: revieweeId },
      data: { reputationScore: nextScore, reviewCount: { increment: 1 } },
    });

    return created;
  });

  const [reviewer, reviewee] = await Promise.all([
    prisma.actor.findUniqueOrThrow({ where: { id: actorId } }),
    prisma.actor.findUniqueOrThrow({ where: { id: revieweeId } }),
  ]);
  notify.reviewReceived(reviewee, reviewer, score).catch((err) => console.error("[mailer] reviewReceived failed:", err));

  res.status(201).json({ id: review.id, score: review.score });
});

// ── Groups ────────────────────────────────────────────────────────────────────

function serializeGroup(
  group: { id: string; name: string; description: string | null; slug: string; joinPolicy: string; createdAt: Date },
  extra?: { memberCount?: number; listingCount?: number; myRole?: string | null },
) {
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    slug: group.slug,
    joinPolicy: group.joinPolicy,
    createdAt: group.createdAt,
    ...(extra?.memberCount !== undefined ? { memberCount: extra.memberCount } : {}),
    ...(extra?.listingCount !== undefined ? { listingCount: extra.listingCount } : {}),
    ...(extra?.myRole !== undefined ? { myRole: extra.myRole } : {}),
  };
}

// POST /groups — create a group; creator becomes OWNER
app.post("/groups", requireAuth, async (req: AuthedRequest, res) => {
  const actorId = req.actorId!;
  const { name, description, slug: rawSlug, joinPolicy } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  const slug = rawSlug ? String(rawSlug).trim() : slugify(name);
  if (!/^[a-z0-9-]+$/.test(slug) || slug.length < 2) {
    return res.status(400).json({ error: "slug must be lowercase alphanumeric with hyphens, min 2 chars" });
  }
  if (joinPolicy !== undefined && joinPolicy !== "PUBLIC" && joinPolicy !== "INVITE_ONLY") {
    return res.status(400).json({ error: "joinPolicy must be PUBLIC or INVITE_ONLY" });
  }

  const existing = await prisma.group.findUnique({ where: { slug } });
  if (existing) return res.status(409).json({ error: "slug already taken" });

  const group = await prisma.$transaction(async (tx) => {
    const g = await tx.group.create({
      data: {
        name: name.trim(),
        description: typeof description === "string" ? description.trim() || null : null,
        slug,
        joinPolicy: joinPolicy ?? "PUBLIC",
      },
    });
    await tx.groupMembership.create({ data: { groupId: g.id, actorId, role: "OWNER" } });
    return g;
  });

  res.status(201).json(serializeGroup(group, { memberCount: 1, listingCount: 0, myRole: "OWNER" }));
});

// GET /groups — list PUBLIC groups + any INVITE_ONLY the authed user belongs to
app.get("/groups", optionalAuth, async (req: AuthedRequest, res) => {
  const actorId = req.actorId ?? null;

  const groups = await prisma.group.findMany({
    where: actorId
      ? {
          OR: [
            { joinPolicy: "PUBLIC" },
            { memberships: { some: { actorId } } },
          ],
        }
      : { joinPolicy: "PUBLIC" },
    include: {
      _count: { select: { memberships: true, listingGroups: true } },
      ...(actorId ? { memberships: { where: { actorId }, select: { role: true } } } : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  res.json(
    groups.map((g) => {
      const myRole = actorId && "memberships" in g ? (g.memberships as { role: string }[])[0]?.role ?? null : null;
      return serializeGroup(g, {
        memberCount: g._count.memberships,
        listingCount: g._count.listingGroups,
        myRole,
      });
    }),
  );
});

// GET /groups/:id — group detail + listings (INVITE_ONLY requires membership)
app.get("/groups/:id", optionalAuth, async (req: AuthedRequest, res) => {
  const actorId = req.actorId ?? null;
  const group = await prisma.group.findUnique({
    where: { id: req.params.id },
    include: {
      _count: { select: { memberships: true, listingGroups: true } },
      memberships: actorId ? { where: { actorId }, select: { role: true } } : false,
      listingGroups: {
        include: { listing: { include: { actor: true } } },
        orderBy: { addedAt: "desc" },
      },
    },
  });
  if (!group) return res.status(404).json({ error: "group not found" });

  const myMembership = actorId && group.memberships ? (group.memberships as { role: string }[])[0] ?? null : null;
  if (group.joinPolicy === "INVITE_ONLY" && !myMembership) {
    return res.status(404).json({ error: "group not found" });
  }

  const listings = group.listingGroups.map((lg) =>
    serializeListing(lg.listing, lg.listing.actor),
  );

  res.json({
    ...serializeGroup(group, {
      memberCount: group._count.memberships,
      listingCount: group._count.listingGroups,
      myRole: myMembership?.role ?? null,
    }),
    listings,
  });
});

// PATCH /groups/:id — update name / description / joinPolicy (OWNER or MOD)
app.patch("/groups/:id", requireAuth, async (req: AuthedRequest, res) => {
  const actorId = req.actorId!;
  const membership = await prisma.groupMembership.findUnique({
    where: { groupId_actorId: { groupId: req.params.id, actorId } },
  });
  if (!membership || (membership.role !== "OWNER" && membership.role !== "MODERATOR")) {
    return res.status(403).json({ error: "must be an owner or moderator" });
  }

  const { name, description, joinPolicy } = req.body ?? {};
  if (joinPolicy !== undefined && joinPolicy !== "PUBLIC" && joinPolicy !== "INVITE_ONLY") {
    return res.status(400).json({ error: "joinPolicy must be PUBLIC or INVITE_ONLY" });
  }

  const group = await prisma.group.update({
    where: { id: req.params.id },
    data: {
      ...(typeof name === "string" && name.trim() ? { name: name.trim() } : {}),
      ...(description !== undefined ? { description: typeof description === "string" ? description.trim() || null : null } : {}),
      ...(joinPolicy !== undefined ? { joinPolicy } : {}),
    },
  });
  res.json(serializeGroup(group));
});

// POST /groups/:id/join — join a PUBLIC group
app.post("/groups/:id/join", requireAuth, async (req: AuthedRequest, res) => {
  const actorId = req.actorId!;
  const group = await prisma.group.findUnique({ where: { id: req.params.id } });
  if (!group) return res.status(404).json({ error: "group not found" });
  if (group.joinPolicy === "INVITE_ONLY") {
    return res.status(403).json({ error: "this group is invite-only" });
  }

  const existing = await prisma.groupMembership.findUnique({
    where: { groupId_actorId: { groupId: group.id, actorId } },
  });
  if (existing) return res.status(409).json({ error: "already a member" });

  await prisma.groupMembership.create({ data: { groupId: group.id, actorId, role: "MEMBER" } });
  res.status(201).json({ groupId: group.id, role: "MEMBER" });
});

// POST /groups/:id/members — add a member directly (OWNER/MOD — works for any joinPolicy)
app.post("/groups/:id/members", requireAuth, async (req: AuthedRequest, res) => {
  const actorId = req.actorId!;
  const membership = await prisma.groupMembership.findUnique({
    where: { groupId_actorId: { groupId: req.params.id, actorId } },
  });
  if (!membership || (membership.role !== "OWNER" && membership.role !== "MODERATOR")) {
    return res.status(403).json({ error: "must be an owner or moderator" });
  }

  const { actorId: targetId, role } = req.body ?? {};
  if (typeof targetId !== "string" || !targetId.trim()) {
    return res.status(400).json({ error: "actorId is required" });
  }
  if (role !== undefined && role !== "MEMBER" && role !== "MODERATOR") {
    return res.status(400).json({ error: "role must be MEMBER or MODERATOR" });
  }

  const target = await prisma.actor.findUnique({ where: { id: targetId } });
  if (!target) return res.status(404).json({ error: "actor not found" });

  const existing = await prisma.groupMembership.findUnique({
    where: { groupId_actorId: { groupId: req.params.id, actorId: targetId } },
  });
  if (existing) return res.status(409).json({ error: "already a member" });

  await prisma.groupMembership.create({
    data: { groupId: req.params.id, actorId: targetId, role: role ?? "MEMBER" },
  });
  res.status(201).json({ groupId: req.params.id, actorId: targetId, role: role ?? "MEMBER" });
});

// PATCH /groups/:id/members/:actorId — promote/demote (OWNER only; can't change OWNER role)
app.patch("/groups/:id/members/:targetActorId", requireAuth, async (req: AuthedRequest, res) => {
  const actorId = req.actorId!;
  const membership = await prisma.groupMembership.findUnique({
    where: { groupId_actorId: { groupId: req.params.id, actorId } },
  });
  if (!membership || membership.role !== "OWNER") {
    return res.status(403).json({ error: "must be the group owner" });
  }

  const { role } = req.body ?? {};
  if (role !== "MEMBER" && role !== "MODERATOR") {
    return res.status(400).json({ error: "role must be MEMBER or MODERATOR" });
  }

  const target = await prisma.groupMembership.findUnique({
    where: { groupId_actorId: { groupId: req.params.id, actorId: req.params.targetActorId } },
  });
  if (!target) return res.status(404).json({ error: "member not found" });
  if (target.role === "OWNER") return res.status(400).json({ error: "cannot change the owner's role" });

  await prisma.groupMembership.update({
    where: { groupId_actorId: { groupId: req.params.id, actorId: req.params.targetActorId } },
    data: { role },
  });
  res.json({ groupId: req.params.id, actorId: req.params.targetActorId, role });
});

// DELETE /groups/:id/members/:actorId — remove a member (OWNER/MOD; can't remove OWNER)
app.delete("/groups/:id/members/:targetActorId", requireAuth, async (req: AuthedRequest, res) => {
  const actorId = req.actorId!;
  const membership = await prisma.groupMembership.findUnique({
    where: { groupId_actorId: { groupId: req.params.id, actorId } },
  });
  if (!membership || (membership.role !== "OWNER" && membership.role !== "MODERATOR")) {
    return res.status(403).json({ error: "must be an owner or moderator" });
  }

  const target = await prisma.groupMembership.findUnique({
    where: { groupId_actorId: { groupId: req.params.id, actorId: req.params.targetActorId } },
  });
  if (!target) return res.status(404).json({ error: "member not found" });
  if (target.role === "OWNER") return res.status(400).json({ error: "cannot remove the group owner" });

  await prisma.groupMembership.delete({
    where: { groupId_actorId: { groupId: req.params.id, actorId: req.params.targetActorId } },
  });
  res.status(204).send();
});

// POST /listings/:id/groups/:groupId — add listing to group (owner + member + rep ≥ 2★)
app.post("/listings/:id/groups/:groupId", requireAuth, async (req: AuthedRequest, res) => {
  const actorId = req.actorId!;

  const listing = await prisma.listing.findUnique({ where: { id: req.params.id } });
  if (!listing) return res.status(404).json({ error: "listing not found" });
  if (listing.actorId !== actorId) return res.status(403).json({ error: "must own the listing" });

  const actor = await prisma.actor.findUniqueOrThrow({ where: { id: actorId } });
  if (!canAddToGroup(actor.reputationScore)) {
    return res.status(403).json({ error: "reputation must be at least 2 stars to add listings to a group" });
  }

  const group = await prisma.group.findUnique({ where: { id: req.params.groupId } });
  if (!group) return res.status(404).json({ error: "group not found" });

  const membership = await prisma.groupMembership.findUnique({
    where: { groupId_actorId: { groupId: group.id, actorId } },
  });
  if (!membership) return res.status(403).json({ error: "must be a member of the group" });

  const existing = await prisma.listingGroup.findUnique({
    where: { listingId_groupId: { listingId: listing.id, groupId: group.id } },
  });
  if (existing) return res.status(409).json({ error: "listing already in this group" });

  await prisma.listingGroup.create({ data: { listingId: listing.id, groupId: group.id } });
  res.status(201).json({ listingId: listing.id, groupId: group.id });
});

// DELETE /listings/:id/groups/:groupId — remove listing from group (owner OR group owner/mod)
app.delete("/listings/:id/groups/:groupId", requireAuth, async (req: AuthedRequest, res) => {
  const actorId = req.actorId!;

  const listing = await prisma.listing.findUnique({ where: { id: req.params.id } });
  if (!listing) return res.status(404).json({ error: "listing not found" });

  const isListingOwner = listing.actorId === actorId;
  const membership = await prisma.groupMembership.findUnique({
    where: { groupId_actorId: { groupId: req.params.groupId, actorId } },
  });
  const isGroupMod = membership?.role === "OWNER" || membership?.role === "MODERATOR";

  if (!isListingOwner && !isGroupMod) {
    return res.status(403).json({ error: "must own the listing or be a group owner/moderator" });
  }

  const existing = await prisma.listingGroup.findUnique({
    where: { listingId_groupId: { listingId: listing.id, groupId: req.params.groupId } },
  });
  if (!existing) return res.status(404).json({ error: "listing not in this group" });

  await prisma.listingGroup.delete({
    where: { listingId_groupId: { listingId: listing.id, groupId: req.params.groupId } },
  });
  res.status(204).send();
});

// GET /listings/:id/groups — groups this listing belongs to
app.get("/listings/:id/groups", optionalAuth, async (req: AuthedRequest, res) => {
  const listing = await prisma.listing.findUnique({ where: { id: req.params.id } });
  if (!listing) return res.status(404).json({ error: "listing not found" });

  const actorId = req.actorId ?? null;
  const listingGroups = await prisma.listingGroup.findMany({
    where: { listingId: listing.id },
    include: {
      group: {
        include: {
          _count: { select: { memberships: true, listingGroups: true } },
          ...(actorId ? { memberships: { where: { actorId }, select: { role: true } } } : {}),
        },
      },
    },
  });

  res.json(
    listingGroups.map((lg) => {
      const myRole = actorId && "memberships" in lg.group
        ? (lg.group.memberships as { role: string }[])[0]?.role ?? null
        : null;
      const g = lg.group as typeof lg.group & { joinPolicy: string };
      if (g.joinPolicy === "INVITE_ONLY" && !myRole) return null;
      return serializeGroup(lg.group, {
        memberCount: lg.group._count.memberships,
        listingCount: lg.group._count.listingGroups,
        myRole,
      });
    }).filter(Boolean),
  );
});

app.listen(port, () => {
  console.log(`mealmate backend listening on :${port}`);
});
