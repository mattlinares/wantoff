"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

export function NavBar() {
  const { actor, loading, setToken, setActor } = useAuth();

  return (
    <nav className="nav">
      <div>
        <Link href="/" className="nav-brand">Wantoff</Link>
        <Link href="/groups">Communities</Link>
        {!loading && actor && <Link href={`/u/${actor.id}`}>My profile</Link>}
        {!loading && actor && <Link href="/listings/new">Add item</Link>}
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
      <div>
        <span className="nav-channels-label">Channels</span>
        <Link href="/meals">Mealshare</Link>
        <Link href="/items">Items</Link>
        <Link href="/skills">Skills</Link>
        <Link href="/digital">Digital</Link>
      </div>
    </nav>
  );
}
