"use client";

import { useState } from "react";
import { connectCirclesWallet, getTrustOverlap, type CirclesConnection, type TrustOverlap } from "@/lib/circles";

export function TrustSignal({ hostWallet }: { hostWallet: string }) {
  const [connection, setConnection] = useState<CirclesConnection | null>(null);
  const [overlap, setOverlap] = useState<TrustOverlap | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConnect() {
    setBusy(true);
    setError(null);
    try {
      const conn = await connectCirclesWallet();
      if (conn.address.toLowerCase() === hostWallet.toLowerCase()) {
        setConnection(conn);
        return;
      }
      const result = await getTrustOverlap(conn.sdk, conn.avatar, hostWallet);
      setConnection(conn);
      setOverlap(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to connect wallet");
    } finally {
      setBusy(false);
    }
  }

  if (!connection) {
    return (
      <span style={{ fontSize: "0.9em" }}>
        <button
          onClick={onConnect}
          disabled={busy}
          style={{ fontSize: "0.85em", padding: "2px 8px" }}
        >
          {busy ? "Checking..." : "Check trust connections"}
        </button>
        {error && <span className="error" style={{ marginLeft: 8 }}>{error}</span>}
      </span>
    );
  }

  if (connection.address.toLowerCase() === hostWallet.toLowerCase()) {
    return <span style={{ color: "#888", fontSize: "0.9em" }}>This is your profile</span>;
  }

  if (!overlap) return null;

  if (overlap.direct) {
    return (
      <span style={{ color: "#22c55e", fontSize: "0.9em" }}>
        ✓ You directly trust this person
      </span>
    );
  }

  if (overlap.mutualCount > 0) {
    return (
      <span style={{ color: "#84cc16", fontSize: "0.9em" }}>
        {overlap.mutualCount} {overlap.mutualCount === 1 ? "person" : "people"} you trust also trust this person
      </span>
    );
  }

  return (
    <span style={{ color: "#888", fontSize: "0.9em" }}>
      No mutual trust connections yet
    </span>
  );
}
