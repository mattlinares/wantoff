"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getListing, joinMealListing, requestListing, type Listing, type Fee } from "@/lib/api";
import { ReputationBadge } from "@/lib/reputation";

function listingTitle(listing: Listing): string {
  const attrs = listing.attributes as { title?: unknown };
  return typeof attrs.title === "string" ? attrs.title : `${listing.itemType} listing`;
}

function listingDescription(listing: Listing): string {
  const attrs = listing.attributes as { description?: unknown };
  return typeof attrs.description === "string" ? attrs.description : "";
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}min` : `${h} hour${h > 1 ? "s" : ""}`;
}

function formatPrice(fees: Fee[]): string {
  const required = fees.filter((f) => f.required);
  if (required.length === 0) return "Free";
  const currency = required.find((f) => f.kind === "currency");
  if (currency) return currency.amount ? `${currency.amount} ${currency.currency}` : (currency.currency ?? "Paid");
  const credit = required.find((f) => f.kind === "credit");
  if (credit) return credit.amount ? `${credit.amount} mealshare credit${credit.amount !== 1 ? "s" : ""}` : "Free";
  return "Free";
}

export default function ListingPage() {
  const { id } = useParams<{ id: string }>();
  const { token, actor } = useAuth();
  const router = useRouter();
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    getListing(id, token ?? undefined)
      .then((l) => { setListing(l); setJoined(l.joinedByMe ?? false); })
      .catch((e) => setError(e.message));
  }, [id, token]);

  async function onJoin() {
    if (!token) { router.push("/login"); return; }
    setJoining(true);
    setJoinError(null);
    try {
      if (listing?.itemType === "mealmate.meal") {
        await joinMealListing(token, id);
      } else {
        await requestListing(token, id);
      }
      setJoined(true);
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : "failed to join");
    } finally {
      setJoining(false);
    }
  }

  if (error) return <main className="container"><p className="error">{error}</p></main>;
  if (!listing) return <main className="container"><p>Loading...</p></main>;

  const description = listingDescription(listing);
  const price = formatPrice(listing.fees);
  const attrs = listing.attributes as Record<string, unknown>;
  const isOwn = actor?.id === listing.host.id;
  const isMeal = listing.itemType === "mealmate.meal";
  const spotsLeft = typeof attrs.spotsRemaining === "number" ? attrs.spotsRemaining : null;
  const full = spotsLeft !== null && spotsLeft <= 0;
  const repBlocked = actor && listing.minReputation !== null && actor.reputationScore < listing.minReputation;

  return (
    <main className="container">
      <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>
        <Link href="/">← Back</Link>
      </p>

      <span className="badge">{listing.itemType}</span>{" "}
      <span className="badge">{listing.type}</span>

      {Array.isArray(attrs.photos) && (attrs.photos as string[]).length > 0 && (
        <div style={{ display: "flex", gap: 8, margin: "12px 0", flexWrap: "wrap" }}>
          {(attrs.photos as string[]).map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={src}
              alt=""
              style={{ width: i === 0 ? "100%" : 80, height: i === 0 ? 260 : 80, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }}
            />
          ))}
        </div>
      )}

      <h1 style={{ marginTop: 12 }}>{listingTitle(listing)}</h1>

      <p style={{ fontSize: "1.1em", fontWeight: 600, color: "var(--accent)", margin: "0 0 16px" }}>
        {price}
      </p>

      {description && (
        <p style={{ color: "var(--muted)", lineHeight: 1.7, marginBottom: 24 }}>{description}</p>
      )}

      {typeof attrs.duration === "number" && (
        <p style={{ fontSize: 13 }}><strong>Duration:</strong> {formatDuration(attrs.duration)}</p>
      )}

      {typeof attrs.scheduledTime === "string" && (
        <p style={{ fontSize: 13 }}><strong>When:</strong> {new Date(attrs.scheduledTime).toLocaleString()}</p>
      )}

      {typeof attrs.dietaryInfo === "string" && attrs.dietaryInfo && (
        <p style={{ fontSize: 13 }}><strong>Dietary:</strong> {attrs.dietaryInfo}</p>
      )}

      {typeof attrs.mealTime === "string" && (
        <p style={{ fontSize: 13 }}><strong>When:</strong> {new Date(attrs.mealTime).toLocaleString()}</p>
      )}

      {typeof attrs.capacity === "number" && (
        <p style={{ fontSize: 13 }}>
          <strong>Spots:</strong>{" "}
          {spotsLeft !== null ? `${spotsLeft} of ${attrs.capacity} remaining` : attrs.capacity}
        </p>
      )}

      {listing.status === "OPEN" && !isOwn && (
        <div style={{ marginTop: 24 }}>
          {joined ? (
            <p style={{ color: "var(--accent)", fontWeight: 600 }}>
              ✓ You&apos;ve {isMeal ? "joined this meal" : "requested this listing"}
            </p>
          ) : (
            <>
              <button onClick={onJoin} disabled={joining || full || !!repBlocked}>
                {joining ? "..." : full ? "Full" : isMeal ? "Join this meal" : "Request this"}
              </button>
              {repBlocked && (
                <p style={{ marginTop: 8, fontSize: 13, color: "var(--muted)" }}>
                  Requires <ReputationBadge score={listing.minReputation!} /> — yours is <ReputationBadge score={actor!.reputationScore} />.{" "}
                  <Link href="/reputation">How to build your reputation →</Link>
                </p>
              )}
              {joinError && <p className="error" style={{ marginTop: 8 }}>{joinError}</p>}
            </>
          )}
        </div>
      )}

      {listing.status !== "OPEN" && (
        <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 24 }}>
          This listing is {listing.status.toLowerCase()}.
        </p>
      )}

      <div className="card" style={{ marginTop: 24 }}>
        <p style={{ margin: 0, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
          Listed by{" "}
          <Link href={`/u/${listing.host.id}`}>{listing.host.displayName}</Link>
          <ReputationBadge score={listing.host.reputationScore} />
          <Link
            href={`/u/${listing.host.id}#circles-trust`}
            title="About this reputation score"
            style={{ color: "var(--muted)", fontSize: 13, textDecoration: "none", lineHeight: 1 }}
          >
            ?
          </Link>
        </p>
      </div>
    </main>
  );
}
