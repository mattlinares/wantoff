"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  getPublicProfile,
  getMyListings,
  getGroups,
  getExchanges,
  updateExchangeStatus,
  getExchangeMessages,
  sendExchangeMessage,
  addListingToGroup,
  removeListingFromGroup,
  updateListing,
  type PublicProfile,
  type Listing,
  type Exchange,
  type ExchangeMessage,
  type Fee,
  type Group,
} from "@/lib/api";
import { PayInCrc } from "./pay-in-crc";
import { ReputationBadge, ReputationGate } from "@/lib/reputation";
import { TrustSignal } from "./trust-signal";
import { WalletConnect } from "./wallet-connect";

function RequestCard({
  exchange,
  token,
  actorId,
  onAction,
}: {
  exchange: Exchange;
  token: string;
  actorId: string;
  onAction: (id: string, status: "CONFIRMED" | "DECLINED") => void;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ExchangeMessage[] | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [actioning, setActioning] = useState(false);

  async function loadMessages() {
    if (messages !== null) return;
    const msgs = await getExchangeMessages(token, exchange.id);
    setMessages(msgs);
  }

  async function onToggle() {
    if (!open) await loadMessages();
    setOpen((v) => !v);
  }

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    try {
      const msg = await sendExchangeMessage(token, exchange.id, reply.trim());
      setMessages((prev) => [...(prev ?? []), msg]);
      setReply("");
    } finally {
      setSending(false);
    }
  }

  async function handleAction(status: "CONFIRMED" | "DECLINED") {
    setActioning(true);
    try { onAction(exchange.id, status); } finally { setActioning(false); }
  }

  const other = exchange.otherActor;
  const isPending = exchange.status === "PENDING";

  return (
    <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: 12, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>
            {other ? <Link href={`/u/${other.id}`}>{other.displayName}</Link> : "Someone"}
            {other && (
              <span style={{ marginLeft: 8, fontWeight: 400 }}>
                <ReputationBadge score={other.reputationScore} />
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>
            Wants your <Link href={`/listings/${exchange.listing.id}`}>{String(exchange.listing.title ?? "listing")}</Link>
            {" · "}{new Date(exchange.createdAt).toLocaleDateString()}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button onClick={onToggle} style={{ fontSize: 12, padding: "3px 10px", background: "none", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", color: "var(--muted)" }}>
            {open ? "Hide" : "Thread"}
          </button>
          {isPending && <>
            <button onClick={() => handleAction("CONFIRMED")} disabled={actioning} style={{ padding: "3px 12px", background: "#22c55e", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>Accept</button>
            <button onClick={() => handleAction("DECLINED")} disabled={actioning} style={{ padding: "3px 12px", background: "none", color: "var(--muted)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>Decline</button>
          </>}
          {!isPending && <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 4, background: exchange.status === "CONFIRMED" ? "#22c55e22" : "#ef444422", color: exchange.status === "CONFIRMED" ? "#22c55e" : "#ef4444", fontWeight: 600 }}>{exchange.status}</span>}
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 10, paddingLeft: 12, borderLeft: "2px solid var(--border)" }}>
          {messages === null && <p style={{ fontSize: 13, color: "var(--muted)" }}>Loading...</p>}
          {messages?.length === 0 && <p style={{ fontSize: 13, color: "var(--muted)" }}>No messages yet.</p>}
          {messages?.map((m) => (
            <div key={m.id} style={{ marginBottom: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 12 }}>{m.senderName === (other?.displayName) ? m.senderName : "You"}</span>
              <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 6 }}>{new Date(m.createdAt).toLocaleString()}</span>
              <p style={{ margin: "2px 0 0", fontSize: 13 }}>{m.body}</p>
            </div>
          ))}
          <form onSubmit={onSend} style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Reply..."
              style={{ flex: 1, fontSize: 13, padding: "4px 8px" }}
            />
            <button type="submit" disabled={sending || !reply.trim()} style={{ padding: "4px 12px", fontSize: 13 }}>
              {sending ? "..." : "Send"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  MATCHED: "Matched",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};
const STATUS_ORDER = ["OPEN", "MATCHED", "CLOSED", "CANCELLED"];

function listingTitle(listing: Listing): string {
  const attrs = listing.attributes as { title?: unknown };
  return typeof attrs.title === "string" ? attrs.title : `${listing.itemType} listing`;
}

function listingDescription(listing: Listing): string | null {
  const attrs = listing.attributes as { description?: unknown };
  return typeof attrs.description === "string" && attrs.description ? attrs.description : null;
}

function describeFee(fee: Fee): string {
  if (fee.kind === "credit") {
    const amount = fee.amount ?? 1;
    return `${fee.required ? "Costs" : "Suggested"} ${amount} ${fee.creditType ?? "credit"}${amount === 1 ? "" : "s"}`;
  }
  const currency = fee.currency ?? "currency";
  const amount = fee.amount !== undefined ? ` (${fee.amount} ${currency})` : ` in ${currency}`;
  if (fee.kind === "donation") return `Suggested tip${amount}`;
  return `${fee.required ? "Requires payment" : "Suggested payment"}${amount}`;
}

function crcWalletFor(listing: Listing): string | null {
  const crc = listing.currencies.find((c) => c.currency === "CRC" && c.walletAddress);
  return crc?.walletAddress ?? listing.host.circlesWallet ?? null;
}

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
    <div className="card" style={{ marginBottom: 24 }}>
      <h3 style={{ marginTop: 0 }}>Share your profile</h3>
      <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--muted)" }}>Embed your public wants &amp; offers on another site:</p>
      <textarea readOnly rows={2} value={snippet} style={{ width: "100%", fontSize: 12 }} />
      <p style={{ margin: "8px 0 0" }}>
        <button onClick={copy}>{copied ? "Copied!" : "Copy embed code"}</button>
      </p>
    </div>
  );
}

function ListingGroupManager({ token, listingId, myGroups }: { token: string; listingId: string; myGroups: Group[] }) {
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
      <span style={{ color: "var(--muted)" }}>Groups: </span>
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
            color: "var(--text)",
            background: inGroups.has(g.id) ? "#22c55e22" : "var(--surface)",
            borderColor: inGroups.has(g.id) ? "#22c55e" : "var(--border)",
          }}
        >
          {inGroups.has(g.id) ? "✓ " : "+ "}{g.name}
        </button>
      ))}
      {error && <span className="error" style={{ marginLeft: 4 }}>{error}</span>}
    </div>
  );
}

export default function PublicProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { actor, token } = useAuth();
  const isOwner = actor?.id === id;

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [myListings, setMyListings] = useState<Listing[] | null>(null);
  const [myGroups, setMyGroups] = useState<Group[]>([]);
  const [exchanges, setExchanges] = useState<Exchange[] | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    getPublicProfile(id)
      .then(setProfile)
      .catch(() => setNotFound(true));
  }, [id]);

  useEffect(() => {
    if (!isOwner || !token) return;
    getMyListings(token).then(setMyListings).catch(() => {});
    getGroups(token).then((gs) => setMyGroups(gs.filter((g) => g.myRole))).catch(() => {});
    getExchanges(token).then(setExchanges).catch(() => {});
  }, [isOwner, token]);

  async function onCancel(listingId: string) {
    if (!token) return;
    setCancellingId(listingId);
    setCancelError(null);
    try {
      const updated = await updateListing(token, listingId, { status: "CANCELLED" });
      setMyListings((prev) => prev?.map((l) => (l.id === listingId ? updated : l)) ?? null);
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "failed to cancel");
    } finally {
      setCancellingId(null);
    }
  }

  async function onExchangeAction(exchangeId: string, status: "CONFIRMED" | "DECLINED") {
    if (!token) return;
    try {
      const updated = await updateExchangeStatus(token, exchangeId, status);
      setExchanges((prev) => prev?.map((e) => e.id === exchangeId ? { ...e, status: updated.status } : e) ?? null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "failed");
    }
  }

  if (notFound) return <main className="container"><p>Profile not found.</p></main>;
  if (!profile) return <main className="container"><p>Loading...</p></main>;

  return (
    <main className="container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ margin: "0 0 4px" }}>{profile.displayName}</h1>
          <p style={{ margin: 0 }}>
            <ReputationBadge score={profile.reputationScore} reviewCount={profile.reviewCount} />
            <span style={{ marginLeft: 8, fontSize: 13, color: "var(--muted)" }}>({Math.round(profile.reputationScore)}/100)</span>
          </p>
        </div>
        {isOwner && (
          <Link href={`/u/${id}/edit`} style={{ fontSize: 13, color: "var(--muted)", marginTop: 6 }}>
            Edit profile
          </Link>
        )}
      </div>

      {profile.location?.address && (
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--muted)" }}>📍 {profile.location.address}</p>
      )}

      {isOwner && exchanges !== null && exchanges.some((e) => e.isIncoming) && (
        <section style={{ margin: "24px 0", padding: "20px", borderRadius: 8, border: "1px solid #f59e0b44", background: "var(--surface)" }}>
          <h2 style={{ marginTop: 0, marginBottom: 16, fontSize: "1.1em" }}>
            Requests <span style={{ fontSize: 13, fontWeight: 400, color: "var(--muted)" }}>({exchanges.filter((e) => e.isIncoming && e.status === "PENDING").length} pending)</span>
          </h2>
          {exchanges.filter((e) => e.isIncoming).map((e) => (
            <RequestCard key={e.id} exchange={e} token={token!} actorId={actor!.id} onAction={onExchangeAction} />
          ))}
        </section>
      )}

      {isOwner && <div style={{ marginTop: 20 }}><ShareProfile actorId={id} /></div>}

      <section
        id="circles-trust"
        className="circles-trust-section"
        style={{ margin: "24px 0", padding: "20px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)" }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: "1.1em" }}>Circles trust</h2>
        {profile.circlesWallet ? (
          <>
            <p style={{ margin: "0 0 12px", fontSize: 14, color: "var(--muted)" }}>
              Shows how you&apos;re connected through the Circles trust network. Trust connections contribute to{" "}
              <Link href="/reputation">reputation scores</Link>.
            </p>
            {profile.circlesScore !== null && (
              <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--muted)" }}>
                Circles trust score:{" "}
                <strong style={{ color: "var(--text)" }}>{Math.round(profile.circlesScore)}</strong>/100
                {" "}· adds up to{" "}
                <strong style={{ color: "var(--text)" }}>
                  +{Math.round(Math.pow(profile.circlesScore / 100, 2) * 15 * 10) / 10}
                </strong>{" "}
                pts to reputation
              </p>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              {!isOwner && <TrustSignal hostWallet={profile.circlesWallet} viewerWallet={actor?.circlesWallet} />}
              <span style={{ color: "#aaa", fontSize: "0.85em" }}>
                wallet: <code>{profile.circlesWallet.slice(0, 8)}…</code>
              </span>
            </div>
          </>
        ) : (
          <p style={{ margin: 0, fontSize: 14, color: "var(--muted)" }}>
            {isOwner
              ? "Connect a Circles wallet to show your trust connections and boost your reputation."
              : "This person hasn't connected a Circles wallet yet."}
          </p>
        )}
        {isOwner && <div style={{ marginTop: 16 }}><WalletConnect circlesWallet={profile.circlesWallet} /></div>}
      </section>

      {isOwner ? (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>My wants &amp; offers</h2>
            <Link href="/listings/new">+ Add listing</Link>
          </div>
          {cancelError && <p className="error">{cancelError}</p>}
          {myListings === null && <p>Loading...</p>}
          {myListings !== null && myListings.length === 0 && <p>You haven&apos;t listed anything yet.</p>}
          {myListings !== null && STATUS_ORDER.map((status) => {
            const group = myListings.filter((l) => l.status === status);
            if (group.length === 0) return null;
            return (
              <section key={status}>
                <h3 style={{ margin: "20px 0 8px", fontSize: "0.9em", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>
                  {STATUS_LABELS[status]}
                </h3>
                {group.map((listing) => (
                  <div className={`card card-${listing.type.toLowerCase()}`} key={listing.id}>
                    <span className="badge">{listing.type}</span>{" "}
                    <span className="badge">{listing.itemType}</span>
                    <h3 style={{ margin: "8px 0" }}>
                      <Link href={`/listings/${listing.id}`} style={{ color: "var(--text)", textDecoration: "none" }}>
                        {listingTitle(listing)}
                      </Link>
                    </h3>
                    {listing.minReputation !== null && <p><ReputationGate minReputation={listing.minReputation} /></p>}
                    {myGroups.length > 0 && token && (
                      <ListingGroupManager token={token} listingId={listing.id} myGroups={myGroups} />
                    )}
                    {listing.status === "OPEN" && (
                      <button
                        onClick={() => onCancel(listing.id)}
                        disabled={cancellingId === listing.id}
                        style={{ marginTop: 8 }}
                      >
                        {cancellingId === listing.id ? "Cancelling..." : "Cancel listing"}
                      </button>
                    )}
                  </div>
                ))}
              </section>
            );
          })}
        </>
      ) : (
        <>
          <h2>Open wants &amp; offers</h2>
          {profile.listings.length === 0 && <p>Nothing listed right now.</p>}
          {profile.listings.map((listing) => {
            const wallet = crcWalletFor(listing);
            return (
              <div className={`card card-${listing.type.toLowerCase()}`} key={listing.id}>
                <span className="badge">{listing.type}</span>{" "}
                <span className="badge">{listing.itemType}</span>
                <h3 style={{ margin: "8px 0" }}>{listingTitle(listing)}</h3>
                {listingDescription(listing) && <p>{listingDescription(listing)}</p>}
                {listing.minReputation !== null && <p><ReputationGate minReputation={listing.minReputation} /></p>}
                {listing.fees.length > 0 && (
                  <ul>
                    {listing.fees.map((fee, i) => <li key={i}>{describeFee(fee)}</li>)}
                  </ul>
                )}
                {wallet && (
                  <PayInCrc
                    wallet={wallet}
                    defaultAmount={listing.fees.find((f) => f.kind !== "credit" && f.currency === "CRC")?.amount}
                  />
                )}
              </div>
            );
          })}
        </>
      )}
    </main>
  );
}
