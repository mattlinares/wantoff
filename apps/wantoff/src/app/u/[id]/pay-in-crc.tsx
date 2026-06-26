"use client";

import { useState } from "react";
import { connectCirclesWallet, getTrustPathAmount, payInCrc, type CirclesConnection } from "@/lib/circles";

// In-app CRC payment with a hard trust-path gate (docs/wantoff-app-plan.md
// "Decisions: Trust-path gating") — Circles personal currencies can only
// move along a chain of trust connections, so we check for a path before
// allowing "Pay" rather than letting the transfer fail.
export function PayInCrc({ wallet, defaultAmount }: { wallet: string; defaultAmount?: number }) {
  const [connection, setConnection] = useState<CirclesConnection | null>(null);
  const [maxAmount, setMaxAmount] = useState<number | null>(null);
  const [amount, setAmount] = useState(defaultAmount ? String(defaultAmount) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);

  async function onConnectAndCheck() {
    setError(null);
    setBusy(true);
    try {
      const conn = await connectCirclesWallet();
      setConnection(conn);
      const max = await getTrustPathAmount(conn.avatar, wallet);
      setMaxAmount(max);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to connect wallet");
    } finally {
      setBusy(false);
    }
  }

  async function onPay() {
    if (!connection || !amount) return;
    setError(null);
    setBusy(true);
    try {
      await payInCrc(connection.avatar, wallet, Number(amount));
      setPaid(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "payment failed");
    } finally {
      setBusy(false);
    }
  }

  if (paid) {
    return <p>Payment sent. Thank you!</p>;
  }

  if (!connection) {
    return (
      <div>
        <button onClick={onConnectAndCheck} disabled={busy}>
          {busy ? "Connecting..." : "Connect wallet to pay in CRC"}
        </button>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  if (maxAmount === 0) {
    return (
      <p>
        No trust path to this person yet — you can&apos;t send CRC until your trust graphs
        connect.{" "}
        <a href="https://docs.aboutcircles.com" target="_blank" rel="noopener noreferrer">
          Learn about Circles trust connections →
        </a>
      </p>
    );
  }

  return (
    <div>
      <p>Trust path found — you can send up to {maxAmount} CRC.</p>
      <input
        type="number"
        min="0"
        step="any"
        max={maxAmount ?? undefined}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Amount (CRC)"
        style={{ width: "120px", marginRight: "8px" }}
      />
      <button onClick={onPay} disabled={busy || !amount}>
        {busy ? "Sending..." : "Pay in CRC"}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
