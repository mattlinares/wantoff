"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { getListingsByType, joinMealListing, type Listing } from "@/lib/api";
import { ReputationBadge } from "@/lib/reputation";

function mealAttrs(listing: Listing) {
  const a = listing.attributes as {
    title?: string;
    description?: string;
    mealTime?: string;
    capacity?: number;
    spotsRemaining?: number;
    dietaryInfo?: string;
  };
  return a;
}

function formatMealTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

export default function MealsPage() {
  const { token, actor } = useAuth();
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [joined, setJoined] = useState<Set<string>>(new Set());
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    getListingsByType("mealmate.meal", token ?? undefined)
      .then(setListings)
      .catch((e) => setError(e.message));
  }, [token]);

  useEffect(() => {
    if (!listings) return;
    setJoined(new Set(listings.filter((l) => l.joinedByMe).map((l) => l.id)));
  }, [listings]);

  async function onJoin(listingId: string) {
    if (!token) return;
    setJoiningId(listingId);
    setJoinError(null);
    try {
      await joinMealListing(token, listingId);
      setJoined((prev) => new Set([...prev, listingId]));
      setListings((prev) =>
        prev?.map((l) =>
          l.id === listingId
            ? { ...l, joinedByMe: true, attributes: { ...l.attributes, spotsRemaining: Math.max(0, (Number((l.attributes as { spotsRemaining?: number }).spotsRemaining) ?? 1) - 1) } }
            : l,
        ) ?? null,
      );
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : "failed to join");
    } finally {
      setJoiningId(null);
    }
  }

  return (
    <main className="container">
      <h1>Meals</h1>
      <p>Share a meal. Home cooking, community kitchens, surplus food — open to anyone.</p>
      {token && (
        <p>
          <Link href="/listings/new">+ Offer a meal</Link>
        </p>
      )}
      {error && <p className="error">{error}</p>}
      {joinError && <p className="error">{joinError}</p>}
      {listings === null && !error && <p>Loading...</p>}
      {listings?.length === 0 && <p>No meals listed right now.</p>}
      {listings?.map((listing) => {
        const a = mealAttrs(listing);
        const isOwn = actor?.id === listing.host.id;
        const isJoined = joined.has(listing.id);
        const spotsLeft = a.spotsRemaining ?? 0;
        const full = spotsLeft <= 0 && !isJoined;

        return (
          <div className="card" key={listing.id}>
            <h3 style={{ margin: "0 0 4px" }}>{a.title ?? "Meal"}</h3>
            {a.description && (
              <p style={{ margin: "0 0 6px", color: "#555" }}>{a.description}</p>
            )}
            <p style={{ margin: "0 0 4px", fontSize: "0.85em", color: "#888" }}>
              {a.mealTime && <span>{formatMealTime(a.mealTime)} · </span>}
              {!full ? <span>{spotsLeft} spot{spotsLeft !== 1 ? "s" : ""} left</span> : <span style={{ color: "#ef4444" }}>Full</span>}
              {a.dietaryInfo && <span> · {a.dietaryInfo}</span>}
            </p>
            <p style={{ margin: "0 0 8px", fontSize: "0.85em", color: "#888" }}>
              Host: <Link href={`/u/${listing.host.id}`}>{listing.host.displayName}</Link>{" "}
              <ReputationBadge score={listing.host.reputationScore} />
            </p>
            {!isOwn && token && (
              isJoined ? (
                <span style={{ color: "#22c55e", fontSize: "0.9em" }}>You&apos;re going</span>
              ) : (
                <button onClick={() => onJoin(listing.id)} disabled={!!joiningId || full}>
                  {joiningId === listing.id ? "Joining..." : full ? "Full" : "Join"}
                </button>
              )
            )}
            {!token && (
              <Link href="/login" style={{ fontSize: "0.9em" }}>Log in to join</Link>
            )}
            {isOwn && (
              <span style={{ fontSize: "0.85em", color: "#888" }}>Your listing</span>
            )}
          </div>
        );
      })}
    </main>
  );
}
