"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { login, register } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const { setToken, refresh } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  return (
    <main className="container">
      <h1>{mode === "login" ? "Log in" : "Create an account"}</h1>
      <p>
        Same account as Mealmate — one login works across both. {" "}
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
