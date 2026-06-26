"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { getGroups, createGroup, joinGroup, type Group } from "@/lib/api";

export default function GroupsPage() {
  const { token } = useAuth();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    getGroups(token ?? undefined)
      .then(setGroups)
      .catch((e) => setError(e.message));
  }, [token]);

  async function onJoin(id: string) {
    if (!token) return;
    try {
      await joinGroup(token, id);
      setGroups((prev) =>
        prev?.map((g) => (g.id === id ? { ...g, myRole: "MEMBER", memberCount: (g.memberCount ?? 0) + 1 } : g)) ?? null,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to join");
    }
  }

  return (
    <main className="container">
      <h1>Communities</h1>
      <p>Groups where members share wants &amp; offers.</p>
      {token && (
        <p>
          <button onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? "Cancel" : "+ Create a group"}
          </button>
        </p>
      )}
      {showCreate && token && (
        <CreateGroupForm
          token={token}
          onCreate={(g) => {
            setGroups((prev) => [g, ...(prev ?? [])]);
            setShowCreate(false);
          }}
        />
      )}
      {error && <p className="error">{error}</p>}
      {groups === null && !error && <p>Loading...</p>}
      {groups?.length === 0 && <p>No groups yet.</p>}
      {groups?.map((g) => (
        <div className="card" key={g.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h3 style={{ margin: "0 0 4px" }}>
                <Link href={`/groups/${g.id}`}>{g.name}</Link>
              </h3>
              {g.description && <p style={{ margin: "0 0 4px", color: "#666" }}>{g.description}</p>}
              <p style={{ margin: 0, fontSize: "0.85em", color: "#888" }}>
                {g.joinPolicy === "INVITE_ONLY" ? "🔒 Invite-only" : "Public"} ·{" "}
                {g.memberCount ?? 0} {g.memberCount === 1 ? "member" : "members"} ·{" "}
                {g.listingCount ?? 0} listings
              </p>
            </div>
            {token && !g.myRole && g.joinPolicy === "PUBLIC" && (
              <button style={{ fontSize: "0.85em" }} onClick={() => onJoin(g.id)}>
                Join
              </button>
            )}
            {g.myRole && (
              <span style={{ fontSize: "0.8em", color: "#22c55e" }}>
                {g.myRole === "OWNER" ? "Owner" : g.myRole === "MODERATOR" ? "Mod" : "Member"}
              </span>
            )}
          </div>
        </div>
      ))}
    </main>
  );
}

function CreateGroupForm({
  token,
  onCreate,
}: {
  token: string;
  onCreate: (g: Group) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [joinPolicy, setJoinPolicy] = useState<"PUBLIC" | "INVITE_ONLY">("PUBLIC");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const g = await createGroup(token, { name, description: description || undefined, joinPolicy });
      onCreate(g);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to create group");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>New group</h3>
      <div style={{ marginBottom: 8 }}>
        <label htmlFor="group-name">Name</label>
        <input
          id="group-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          style={{ display: "block", width: "100%", marginTop: 4 }}
        />
      </div>
      <div style={{ marginBottom: 8 }}>
        <label htmlFor="group-desc">Description (optional)</label>
        <textarea
          id="group-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          style={{ display: "block", width: "100%", marginTop: 4 }}
        />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label>
          <input
            type="radio"
            checked={joinPolicy === "PUBLIC"}
            onChange={() => setJoinPolicy("PUBLIC")}
            style={{ marginRight: 6 }}
          />
          Public — anyone can join
        </label>
        <br />
        <label>
          <input
            type="radio"
            checked={joinPolicy === "INVITE_ONLY"}
            onChange={() => setJoinPolicy("INVITE_ONLY")}
            style={{ marginRight: 6 }}
          />
          Invite-only — owner/mods add members
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={busy || !name.trim()}>
        {busy ? "Creating..." : "Create group"}
      </button>
    </form>
  );
}
