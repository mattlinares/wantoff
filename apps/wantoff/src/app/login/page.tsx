"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { login, register, getWalletNonce, verifyWalletLogin } from "@/lib/api";

const IS_EMBEDDED = process.env.NEXT_PUBLIC_WALLET_MODE === "embedded";

export default function LoginPage() {
  const router = useRouter();
  const { setToken, refresh } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);

  // In embedded mode, the Circles host injects the wallet — subscribe to changes.
  useEffect(() => {
    if (!IS_EMBEDDED) return;
    let unsub: (() => void) | undefined;
    import("@aboutcircles/miniapp-sdk").then(({ onWalletChange }) => {
      unsub = onWalletChange((addr) => setWalletAddress(addr));
    });
    return () => unsub?.();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = mode === "login" ? await login(email, password) : await register(email, password, displayName);
      setToken(result.token);
      await refresh();
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function onWalletSignIn() {
    setWalletError(null);
    setWalletBusy(true);
    try {
      const { signMessage, requestCreateAccount } = await import("@aboutcircles/miniapp-sdk");

      let address = walletAddress;
      if (!address) {
        // Prompt the host's account creation / login flow.
        const result = await requestCreateAccount();
        address = result.address;
      }

      const { message } = await getWalletNonce(address);
      // SDK signs via Safe ERC-1271 — no window.ethereum involved.
      const { signature } = await signMessage(message);
      const result = await verifyWalletLogin(address, signature);
      setToken(result.token);
      await refresh();
      router.push("/dashboard");
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : "wallet sign-in failed");
    } finally {
      setWalletBusy(false);
    }
  }

  return (
    <main className="container">
      <h1>{mode === "login" ? "Log in" : "Create an account"}</h1>

      {IS_EMBEDDED && (
        <>
          <div className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ marginTop: 0 }}>Sign in with your Circles wallet</h3>
            {walletAddress ? (
              <p style={{ color: "#555", margin: "0 0 12px", fontFamily: "monospace", fontSize: 13 }}>
                {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
              </p>
            ) : (
              <p style={{ color: "#555", margin: "0 0 12px" }}>
                No wallet connected — the Circles host will prompt you.
              </p>
            )}
            {walletError && <p className="error">{walletError}</p>}
            <button onClick={onWalletSignIn} disabled={walletBusy}>
              {walletBusy
                ? "Waiting for wallet..."
                : walletAddress
                ? "Sign in with wallet"
                : "Connect Circles account"}
            </button>
          </div>
          <p style={{ color: "#888", textAlign: "center", margin: "0 0 16px" }}>— or use email —</p>
        </>
      )}

      <p>
        <button type="button" onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "Need an account? Register" : "Have an account? Log in"}
        </button>
      </p>
      <form onSubmit={onSubmit}>
        {mode === "register" && (
          <div className="form-row">
            <label htmlFor="displayName">Display name</label>
            <input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          </div>
        )}
        <div className="form-row">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="form-row">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {mode === "login" ? "Log in" : "Register"}
        </button>
      </form>
    </main>
  );
}
