"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { getListings, type Listing, type Fee } from "@/lib/api";
import { ReputationBadge } from "@/lib/reputation";

const PAGE_SIZE = 8;

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}min` : `${h} hour${h > 1 ? "s" : ""}`;
}

function listingTitle(listing: Listing): string {
  const attrs = listing.attributes as { title?: unknown };
  return typeof attrs.title === "string" ? attrs.title : `${listing.itemType} listing`;
}

function formatPrice(fees: Fee[]): string {
  const required = fees.filter((f) => f.required);
  if (required.length === 0) return "Free";
  const currency = required.find((f) => f.kind === "currency");
  if (currency) return currency.amount ? `${currency.amount} ${currency.currency}` : (currency.currency ?? "Paid");
  const credit = required.find((f) => f.kind === "credit");
  if (credit) return credit.amount ? `${credit.amount} mealshare credit` : "Mealshare credit";
  return "Free";
}

export default function HomePage() {
  const { actor, token, loading } = useAuth();
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [visible, setVisible] = useState(PAGE_SIZE);

  useEffect(() => {
    getListings(token ?? undefined)
      .then(setListings)
      .catch(() => setListings([]));
  }, [token]);

  const shown = listings?.slice(0, visible) ?? [];
  const hasMore = listings !== null && visible < listings.length;

  return (
    <main className="container">
      <h1>Wantoff</h1>
      <p>
        A place to list whatever you have to offer and what you want (old books, a spare
        meal at home, help painting the house) — then swap, share, or trade with people
        around you.
      </p>
      {!loading && actor && (
        <p>
          Welcome back, {actor.displayName}. <Link href="/dashboard">Go to your dashboard</Link>.
        </p>
      )}
      {!loading && !actor && (
        <p>
          <Link href="/login">Log in</Link> with your Mealmate account to get started.
        </p>
      )}

      <h2>What&apos;s out there right now</h2>
      {listings === null && <p>Loading...</p>}
      {listings !== null && listings.length === 0 && <p>Nothing listed yet.</p>}
      {(() => {
        // Group shown listings by communityName, preserving sort order.
        // null/undefined communityName → "other" bucket rendered without a heading.
        const sections: { name: string | null; items: typeof shown }[] = [];
        for (const listing of shown) {
          const name = listing.communityName ?? null;
          const last = sections[sections.length - 1];
          if (last && last.name === name) {
            last.items.push(listing);
          } else {
            sections.push({ name, items: [listing] });
          }
        }
        return sections.map((section, si) => (
          <div key={si}>
            {section.name && (
              <h3 style={{ margin: "20px 0 8px", fontSize: "0.8em", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted)", fontWeight: 600 }}>
                {section.name}
              </h3>
            )}
            {section.items.map((listing) => (
              <Link
                key={listing.id}
                href={`/listings/${listing.id}`}
                style={{ textDecoration: "none", color: "inherit", display: "block" }}
              >
                <div className={`card card-${listing.type.toLowerCase()}`} style={{ cursor: "pointer", display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span className="badge">{listing.itemType}</span>
                    <h3 style={{ margin: "8px 0", color: "var(--text)" }}>{listingTitle(listing)}</h3>
                    {typeof (listing.attributes as Record<string, unknown>).duration === "number" && (
                      <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--muted)" }}>
                        {formatDuration((listing.attributes as Record<string, unknown>).duration as number)}
                      </p>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, color: "var(--muted)" }}>
                      <span>
                        {listing.host.displayName}
                        {" "}<ReputationBadge score={listing.host.reputationScore} style={{ fontSize: 11 }} />
                      </span>
                      <span style={{ fontWeight: 600, color: "var(--accent)" }}><span style={{ fontWeight: 400, color: "var(--muted)" }}>Price:</span> {formatPrice(listing.fees)}</span>
                    </div>
                    {actor && listing.minReputation !== null && actor.reputationScore < listing.minReputation && (
                      <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted)" }}>
                        Requires <ReputationBadge score={listing.minReputation} /> — yours is <ReputationBadge score={actor.reputationScore} />
                      </div>
                    )}
                  </div>
                  {(() => { const p = (listing.attributes as Record<string,unknown>).photos; const src = Array.isArray(p) ? p[0] as string : null; return src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 6, flexShrink: 0, border: "1px solid var(--border)" }} />
                  ) : null; })()}
                </div>
              </Link>
            ))}
          </div>
        ));
      })()}
      {hasMore && (
        <button
          onClick={() => setVisible((v) => v + PAGE_SIZE)}
          style={{ marginTop: 8, width: "100%", padding: "10px", background: "none", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", color: "var(--muted)", fontSize: 14 }}
        >
          Load more ({listings!.length - visible} remaining)
        </button>
      )}
    </main>
  );
}
