import { getPublicProfile, type Fee, type Listing } from "@/lib/api";
import { PayInCrc } from "./pay-in-crc";
import { ReputationBadge, ReputationGate } from "@/lib/reputation";
import { TrustSignal } from "./trust-signal";

function listingTitle(listing: Listing): string {
  const attrs = listing.attributes as { title?: unknown; description?: unknown };
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
  if (fee.kind === "donation") {
    return `Suggested tip${amount}`;
  }
  return `${fee.required ? "Requires payment" : "Suggested payment"}${amount}`;
}

// CRC wallet for this listing, if it accepts CRC — used for the "tip in CRC" link.
function crcWalletFor(listing: Listing): string | null {
  const crc = listing.currencies.find((c) => c.currency === "CRC" && c.walletAddress);
  return crc?.walletAddress ?? listing.host.circlesWallet ?? null;
}

export default async function PublicProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ embed?: string }>;
}) {
  const { id } = await params;
  const { embed } = await searchParams;
  const profile = await getPublicProfile(id).catch(() => null);

  if (!profile) {
    return (
      <main className="container">
        <p>Profile not found.</p>
      </main>
    );
  }

  // embed=1 strips chrome for compact <iframe> use (docs/wantoff-app-plan.md section 3).
  const isEmbed = embed === "1";

  return (
    <>
      {isEmbed && <style>{".nav { display: none; }"}</style>}
      <main className="container" style={isEmbed ? { paddingTop: 0 } : undefined}>
        <h1>{profile.displayName}</h1>
        <p>
          <ReputationBadge score={profile.reputationScore} reviewCount={profile.reviewCount} />
        </p>
        {profile.circlesWallet && (
          <p style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <TrustSignal hostWallet={profile.circlesWallet} />
            <span style={{ color: "#aaa", fontSize: "0.85em" }}>
              wallet: <code>{profile.circlesWallet.slice(0, 8)}…</code>
            </span>
          </p>
        )}
        <h2>Open wants &amp; offers</h2>
        {profile.listings.length === 0 && <p>Nothing listed right now.</p>}
        {profile.listings.map((listing) => {
          const wallet = crcWalletFor(listing);
          return (
            <div className="card" key={listing.id}>
              <span className="badge">{listing.type}</span> <span className="badge">{listing.itemType}</span>
              <h3 style={{ margin: "8px 0" }}>{listingTitle(listing)}</h3>
              {listingDescription(listing) && <p>{listingDescription(listing)}</p>}
              {listing.minReputation !== null && <p><ReputationGate minReputation={listing.minReputation} /></p>}
              {listing.fees.length > 0 && (
                <ul>
                  {listing.fees.map((fee, i) => (
                    <li key={i}>{describeFee(fee)}</li>
                  ))}
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
      </main>
    </>
  );
}
