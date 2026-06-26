"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getMyListings, getGroups, addListingToGroup, removeListingFromGroup, updateListing, type Listing, type Group } from "@/lib/api";
import { WalletConnect } from "./wallet-connect";
import { ReputationGate } from "@/lib/reputation";

const STATUS_GROUPS = ["OPEN", "MATCHED", "CLOSED", "CANCELLED"] as const;

function listingTitle(listing: Listing): string {
  const attrs = listing.attributes as { title?: unknown };
  return typeof attrs.title === "string" ? attrs.title : `${listing.itemType} listing`;
}

export default function DashboardPage() {
  const router = useRouter();
  const { token, actor, loading } = useAuth();
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [myGroups, setMyGroups] = useState<Group[]>([]);

  useEffect(() => {
    if (loading) return;
    if (!token) {
      router.push("/login");
      return;
    }
    getMyListings(token)
      .then(setListings)
      .catch((err) => setError(err instanceof Error ? err.message : "failed to load listings"));
    getGroups(token)
      .then((gs) => setMyGroups(gs.filter((g) => g.myRole)))
      .catch(() => {});
  }, [loading, token, router]);

  async function onCancel(id: string) {
    if (!token) return;
    setCancellingId(id);
    try {
      const updated = await updateListing(token, id, { status: "CANCELLED" });
      setListings((prev) => prev?.map((l) => (l.id === id ? updated : l)) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to cancel listing");
    } finally {
      setCancellingId(null);
    }
  }

  if (loading || (!error && listings === null)) {
    return (
      <main className="container">
        <p>Loading...</p>
      </main>
    );
  }

  return (
    <main className="container">
      <h1>My wants &amp; offers</h1>
      {actor && (
        <p>
          Your public profile: <Link href={`/u/${actor.id}`}>/u/{actor.id}</Link>
        </p>
      )}
      <p>
        <Link href="/listings/new">+ Add a want or offer</Link>
      </p>
      {actor && <WalletConnect circlesWallet={actor.circlesWallet} />}
      {actor && <ShareProfile actorId={actor.id} />}
      {error && <p className="error">{error}</p>}
      {listings && listings.length === 0 && <p>You haven&apos;t listed anything yet.</p>}
      {listings &&
        STATUS_GROUPS.map((status) => {
          const group = listings.filter((l) => l.status === status);
          if (group.length === 0) return null;
          return (
            <section key={status}>
              <h2>{status}</h2>
              {group.map((listing) => (
                <div className="card" key={listing.id}>
                  <span className="badge">{listing.type}</span> <span className="badge">{listing.itemType}</span>
                  <h3 style={{ margin: "8px 0" }}>{listingTitle(listing)}</h3>
                  {listing.minReputation !== null && <p><ReputationGate minReputation={listing.minReputation} /></p>}
                  {myGroups.length > 0 && token && (
                    <ListingGroupManager token={token} listingId={listing.id} myGroups={myGroups} />
                  )}
                  {listing.status === "OPEN" && (
                    <button onClick={() => onCancel(listing.id)} disabled={cancellingId === listing.id} style={{ marginTop: 8 }}>
                      {cancellingId === listing.id ? "Cancelling..." : "Cancel listing"}
                    </button>
                  )}
                </div>
              ))}
            </section>
          );
        })}
    </main>
  );
}

// Shows which groups a listing is in and allows adding/removing.
function ListingGroupManager({
  token,
  listingId,
  myGroups,
}: {
  token: string;
  listingId: string;
  myGroups: Group[];
}) {
  const [inGroups, setInGroups] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    import("@/lib/api").then(({ getListingGroups }) =>
      getListingGroups(listingId, token)
        .then((gs) => { setInGroups(new Set(gs.map((g) => g.id))); setLoaded(true); })
        .catch(() => setLoaded(true)),
    );
  }, [listingId, token]);

  async function toggle(groupId: string) {
    setBusy(groupId);
    setError(null);
    try {
      if (inGroups.has(groupId)) {
        await removeListingFromGroup(token, listingId, groupId);
        setInGroups((prev) => { const s = new Set(prev); s.delete(groupId); return s; });
      } else {
        await addListingToGroup(token, listingId, groupId);
        setInGroups((prev) => new Set([...prev, groupId]));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(null);
    }
  }

  if (!loaded) return null;

  return (
    <div style={{ marginTop: 8, fontSize: "0.85em" }}>
      <span style={{ color: "#888" }}>Groups: </span>
      {myGroups.map((g) => (
        <button
          key={g.id}
          onClick={() => toggle(g.id)}
          disabled={busy === g.id}
          style={{
            marginRight: 4,
            marginBottom: 4,
            padding: "2px 8px",
            fontSize: "0.85em",
            background: inGroups.has(g.id) ? "#22c55e22" : undefined,
            borderColor: inGroups.has(g.id) ? "#22c55e" : undefined,
          }}
        >
          {inGroups.has(g.id) ? "✓ " : "+ "}{g.name}
        </button>
      ))}
      {error && <span className="error" style={{ marginLeft: 4 }}>{error}</span>}
    </div>
  );
}

// Embed snippet for the actor's public profile (docs/wantoff-app-plan.md
// section 3/9 "Embeds": <iframe> to /u/:id?embed=1, no JS widget for v1).
function ShareProfile({ actorId }: { actorId: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}/u/${actorId}?embed=1` : "";
  const snippet = `<iframe src="${url}" style="width:100%;border:0;height:480px"></iframe>`;

  async function copy() {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Share your profile</h3>
      <p>Embed your public wants &amp; offers on another site:</p>
      <textarea readOnly rows={2} value={snippet} style={{ width: "100%" }} />
      <p>
        <button onClick={copy}>{copied ? "Copied!" : "Copy embed code"}</button>
      </p>
    </div>
  );
}
