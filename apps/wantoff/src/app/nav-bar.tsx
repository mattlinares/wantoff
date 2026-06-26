"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

export function NavBar() {
  const { actor, loading, setToken, setActor } = useAuth();

  return (
    <nav className="nav">
      <Link href="/">Wantoff</Link>
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <Link href="/meals">Meals</Link>
        <Link href="/groups">Communities</Link>
        {!loading && actor && <Link href="/dashboard">My wants &amp; offers</Link>}
        {!loading && actor && <Link href={`/u/${actor.id}`}>My public profile</Link>}
        {!loading && actor && (
          <button
            onClick={() => {
              setToken(null);
              setActor(null);
            }}
          >
            Log out
          </button>
        )}
        {!loading && !actor && <Link href="/login">Log in</Link>}
      </div>
    </nav>
  );
}
