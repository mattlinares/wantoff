"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { login, register, getWalletNonce, verifyWalletLogin } from "@/lib/api";
import { signLoginMessage } from "@/lib/circles";

export default function LoginPage() {
  const router = useRouter();
  const { setToken, refresh } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);

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
      // Get address from wallet first (minimal prompt — just account access)
      const { BrowserProvider } = await import("ethers");
      if (typeof window === "undefined" || !window.ethereum) {
        throw new Error("No Ethereum wallet found. Install MetaMask or a Circles-compatible wallet.");
      }
      const provider = new BrowserProvider(window.ethereum as Parameters<typeof BrowserProvider>[0]);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();

      // Get nonce + message from backend
      const { message } = await getWalletNonce(address);

      // Sign
      const { address: signedAddress, signature } = await signLoginMessage(message);

      // Verify with backend → JWT
      const result = await verifyWalletLogin(signedAddress, signature);
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

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginTop: 0 }}>Sign in with a Circles wallet</h3>
        <p style={{ color: "#555", margin: "0 0 12px" }}>
          No password needed — sign a message with your wallet to verify your identity.
        </p>
        {walletError && <p className="error">{walletError}</p>}
        <button onClick={onWalletSignIn} disabled={walletBusy}>
          {walletBusy ? "Waiting for wallet..." : "Connect wallet & sign in"}
        </button>
      </div>

      <p style={{ color: "#888", textAlign: "center", margin: "0 0 16px" }}>— or use email —</p>

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
