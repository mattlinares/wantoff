"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { getListings, type Listing } from "@/lib/api";

function listingTitle(listing: Listing): string {
  const attrs = listing.attributes as { title?: unknown };
  return typeof attrs.title === "string" ? attrs.title : `${listing.itemType} listing`;
}

export default function HomePage() {
  const { actor, loading } = useAuth();
  const [listings, setListings] = useState<Listing[] | null>(null);

  useEffect(() => {
    getListings()
      .then(setListings)
      .catch(() => setListings([]));
  }, []);

  return (
    <main className="container">
      <h1>Wantoff</h1>
      <p>
        A general interface for the wants &amp; offers protocol — manage everything
        you&apos;ve listed (on Mealmate and elsewhere), and share a public profile of
        your wants and offers.
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
      {listings &&
        listings.slice(0, 6).map((listing) => (
          <div className="card" key={listing.id}>
            <span className="badge">{listing.type}</span> <span className="badge">{listing.itemType}</span>
            <h3 style={{ margin: "8px 0" }}>{listingTitle(listing)}</h3>
            <p>
              by <Link href={`/u/${listing.host.id}`}>{listing.host.displayName}</Link>
            </p>
          </div>
        ))}
      {listings !== null && listings.length > 0 && listings.every((l) => l.type === "OFFER") && (
        <p>
          <em>
            All examples above are offers — Mealmate v1 doesn&apos;t post &quot;want&quot; listings yet, but the
            protocol supports them (e.g. for a future Wantoff item type like &quot;wantoff.other&quot;).
          </em>
        </p>
      )}
    </main>
  );
}
