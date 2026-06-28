"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { getListingsByType, requestListing, type Listing, type Fee } from "@/lib/api";
import { ReputationBadge } from "@/lib/reputation";

function formatPrice(fees: Fee[]): string {
  const required = fees.filter((f) => f.required);
  if (required.length === 0) return "Free";
  const currency = required.find((f) => f.kind === "currency");
  if (currency) return currency.amount ? `${currency.amount} ${currency.currency}` : (currency.currency ?? "Paid");
  return "Free";
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}min` : `${h} hour${h > 1 ? "s" : ""}`;
}

function listingAttrs(listing: Listing) {
  return listing.attributes as {
    title?: string;
    description?: string;
    duration?: number;
    scheduledTime?: string;
    photos?: string[];
  };
}

export function GenericChannelPage({
  itemType,
  title,
  description,
  addLabel,
}: {
  itemType: string;
  title: string;
  description: string;
  addLabel: string;
}) {
  const { token, actor } = useAuth();
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState<string | null>(null);
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const [requestError, setRequestError] = useState<string | null>(null);

  useEffect(() => {
    getListingsByType(itemType, token ?? undefined)
      .then(setListings)
      .catch((e) => setError(e.message));
  }, [itemType, token]);

  async function onRequest(listingId: string) {
    if (!token) return;
    setRequesting(listingId);
    setRequestError(null);
    try {
      await requestListing(token, listingId);
      setRequested((prev) => new Set([...prev, listingId]));
    } catch (e) {
      setRequestError(e instanceof Error ? e.message : "failed to request");
    } finally {
      setRequesting(null);
    }
  }

  return (
    <main className="container">
      <h1>{title}</h1>
      <p>{description}</p>
      {token && (
        <p><Link href="/listings/new">+ {addLabel}</Link></p>
      )}
      {error && <p className="error">{error}</p>}
      {requestError && <p className="error">{requestError}</p>}
      {listings === null && !error && <p>Loading...</p>}
      {listings?.length === 0 && <p>Nothing listed right now.</p>}
      {listings?.map((listing) => {
        const a = listingAttrs(listing);
        const isOwn = actor?.id === listing.host.id;
        const isRequested = requested.has(listing.id) || listing.joinedByMe;
        const repBlocked = actor && listing.minReputation !== null && actor.reputationScore < listing.minReputation;

        return (
          <div className={`card card-${listing.type.toLowerCase()}`} key={listing.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: "0 0 4px" }}>
                  <Link href={`/listings/${listing.id}`} style={{ color: "var(--text)", textDecoration: "none" }}>
                    {a.title ?? listing.itemType}
                  </Link>
                  {a.duration && <span style={{ fontWeight: "inherit", color: "var(--muted)" }}> · {formatDuration(a.duration)}</span>}
                </h3>
                {a.description && (
                  <p style={{ margin: "0 0 6px", fontSize: 14, color: "var(--muted)" }}>{a.description}</p>
                )}
                <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
                  {a.scheduledTime && <span>{new Date(a.scheduledTime).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · </span>}
                  <Link href={`/u/${listing.host.id}`}>{listing.host.displayName}</Link>{" "}
                  <ReputationBadge score={listing.host.reputationScore} />
                </p>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <p style={{ margin: "0 0 8px", fontWeight: 600, color: "var(--accent)", fontSize: 14 }}>
                  {formatPrice(listing.fees)}
                </p>
                {!isOwn && token && !repBlocked && (
                  isRequested ? (
                    <span style={{ color: "var(--accent)", fontSize: 13 }}>✓ Requested</span>
                  ) : (
                    <button
                      onClick={() => onRequest(listing.id)}
                      disabled={!!requesting}
                      style={{ fontSize: 13, padding: "6px 12px" }}
                    >
                      {requesting === listing.id ? "..." : "Request"}
                    </button>
                  )
                )}
                {repBlocked && (
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>
                    Needs <ReputationBadge score={listing.minReputation!} />
                  </span>
                )}
                {!token && (
                  <Link href="/login" style={{ fontSize: 13 }}>Log in to request</Link>
                )}
              </div>
              {a.photos?.[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.photos[0]} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 6, flexShrink: 0, border: "1px solid var(--border)", alignSelf: "center" }} />
              )}
            </div>
          </div>
        );
      })}
    </main>
  );
}
