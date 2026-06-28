"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { updateMe } from "@/lib/api";
import { connectCirclesWallet } from "@/lib/circles";

// Connects an injected Circles-compatible wallet (e.g. MetaMask on Gnosis
// Chain) and saves its address as the actor's circlesWallet (used as the
// CRC payment destination on the public profile and listings).
export function WalletConnect({ circlesWallet }: { circlesWallet: string | null }) {
  const { token, refresh } = useAuth();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConnect() {
    if (!token) return;
    setError(null);
    setConnecting(true);
    try {
      const { address } = await connectCirclesWallet();
      await updateMe(token, { circlesWallet: address });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to connect wallet");
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Circles wallet</h3>
      {circlesWallet ? (
        <p>
          Connected: <code>{circlesWallet}</code>
        </p>
      ) : (
        <p>No Circles wallet connected yet — connect one to receive CRC payments on your listings.</p>
      )}
      <button onClick={onConnect} disabled={connecting}>
        {connecting ? "Connecting..." : circlesWallet ? "Reconnect wallet" : "Connect wallet"}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
