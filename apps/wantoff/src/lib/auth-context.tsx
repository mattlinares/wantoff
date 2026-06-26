"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getMe, type Actor } from "./api";

const TOKEN_KEY = "wantoff.token";

type AuthState = {
  token: string | null;
  actor: Actor | null;
  loading: boolean;
  setToken: (token: string | null) => void;
  setActor: (actor: Actor | null) => void;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [actor, setActor] = useState<Actor | null>(null);
  const [loading, setLoading] = useState(true);

  function setToken(next: string | null) {
    if (next) {
      localStorage.setItem(TOKEN_KEY, next);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
    setTokenState(next);
  }

  async function refresh() {
    const stored = token ?? localStorage.getItem(TOKEN_KEY);
    if (!stored) {
      setActor(null);
      setLoading(false);
      return;
    }
    try {
      const me = await getMe(stored);
      setTokenState(stored);
      setActor(me);
    } catch {
      setToken(null);
      setActor(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <AuthContext.Provider value={{ token, actor, loading, setToken, setActor, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
