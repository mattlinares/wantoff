"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import {
  getGroup,
  joinGroup,
  updateGroup,
  addGroupMember,
  type GroupDetail,
  type Listing,
} from "@/lib/api";
import { ReputationBadge } from "@/lib/reputation";

function listingTitle(listing: Listing): string {
  const attrs = listing.attributes as { title?: unknown };
  return typeof attrs.title === "string" ? attrs.title : `${listing.itemType} listing`;
}

export default function GroupPage() {
  const { id } = useParams<{ id: string }>();
  const { token, actor } = useAuth();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [inviteId, setInviteId] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);

  useEffect(() => {
    getGroup(id, token ?? undefined)
      .then(setGroup)
      .catch((e) => setError(e.message));
  }, [id, token]);

  async function onJoin() {
    if (!token || !group) return;
    setBusy(true);
    try {
      await joinGroup(token, group.id);
      setGroup((g) => g ? { ...g, myRole: "MEMBER", memberCount: (g.memberCount ?? 0) + 1 } : g);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to join");
    } finally {
      setBusy(false);
    }
  }

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !group || !inviteId.trim()) return;
    setBusy(true);
    setInviteError(null);
    try {
      await addGroupMember(token, group.id, inviteId.trim());
      setInviteId("");
      setInviteError(null);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "failed to add member");
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <main className="container">
        <p className="error">{error}</p>
        <Link href="/groups">← Back to groups</Link>
      </main>
    );
  }
  if (!group) return <main className="container"><p>Loading...</p></main>;

  const isOwnerOrMod = group.myRole === "OWNER" || group.myRole === "MODERATOR";

  return (
    <main className="container">
      <p style={{ marginBottom: 4 }}>
        <Link href="/groups">← Groups</Link>
      </p>

      {editMode && isOwnerOrMod ? (
        <EditGroupForm
          token={token!}
          group={group}
          onSave={(updated) => { setGroup({ ...group, ...updated }); setEditMode(false); }}
          onCancel={() => setEditMode(false)}
        />
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div>
              <h1 style={{ margin: "0 0 4px" }}>{group.name}</h1>
              {group.description && <p style={{ margin: "0 0 8px", color: "#666" }}>{group.description}</p>}
              <p style={{ margin: 0, fontSize: "0.85em", color: "#888" }}>
                {group.joinPolicy === "INVITE_ONLY" ? "🔒 Invite-only" : "Public"} ·{" "}
                {group.memberCount ?? 0} members · {group.listingCount ?? 0} listings
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              {token && !group.myRole && group.joinPolicy === "PUBLIC" && (
                <button onClick={onJoin} disabled={busy}>Join</button>
              )}
              {group.myRole && (
                <span style={{ fontSize: "0.85em", color: "#22c55e", alignSelf: "center" }}>
                  {group.myRole === "OWNER" ? "Owner" : group.myRole === "MODERATOR" ? "Mod" : "Member"}
                </span>
              )}
              {isOwnerOrMod && (
                <button style={{ fontSize: "0.85em" }} onClick={() => setEditMode(true)}>Edit</button>
              )}
            </div>
          </div>
        </>
      )}

      {isOwnerOrMod && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>
            {group.joinPolicy === "INVITE_ONLY" ? "Add member" : "Invite member"}
          </h3>
          <form onSubmit={onInvite} style={{ display: "flex", gap: 8 }}>
            <input
              value={inviteId}
              onChange={(e) => setInviteId(e.target.value)}
              placeholder="Actor ID"
              style={{ flex: 1 }}
            />
            <button type="submit" disabled={busy || !inviteId.trim()}>Add</button>
          </form>
          {inviteError && <p className="error" style={{ margin: "4px 0 0" }}>{inviteError}</p>}
        </div>
      )}

      <h2>Listings in this group</h2>
      {group.listings.length === 0 && (
        <p style={{ color: "#888" }}>
          No listings yet.{" "}
          {group.myRole && (
            <>
              Add yours from the <Link href="/dashboard">dashboard</Link>.
            </>
          )}
        </p>
      )}
      {group.listings.map((listing) => (
        <div className="card" key={listing.id}>
          <span className="badge">{listing.type}</span>{" "}
          <span className="badge">{listing.itemType}</span>
          <h3 style={{ margin: "8px 0 4px" }}>{listingTitle(listing)}</h3>
          <p style={{ margin: "0 0 4px", fontSize: "0.9em", color: "#666" }}>
            {listing.host.displayName} ·{" "}
            <ReputationBadge score={listing.host.reputationScore} />
          </p>
          {listing.host.id && (
            <Link href={`/u/${listing.host.id}`} style={{ fontSize: "0.85em" }}>
              View profile →
            </Link>
          )}
        </div>
      ))}
    </main>
  );
}

function EditGroupForm({
  token,
  group,
  onSave,
  onCancel,
}: {
  token: string;
  group: GroupDetail;
  onSave: (updated: Partial<GroupDetail>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? "");
  const [joinPolicy, setJoinPolicy] = useState<"PUBLIC" | "INVITE_ONLY">(group.joinPolicy);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const updated = await updateGroup(token, group.id, {
        name,
        description: description || undefined,
        joinPolicy,
      });
      onSave(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <h1 style={{ marginTop: 0 }}>Edit group</h1>
      <div style={{ marginBottom: 8 }}>
        <label htmlFor="edit-name">Name</label>
        <input
          id="edit-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          style={{ display: "block", width: "100%", marginTop: 4 }}
        />
      </div>
      <div style={{ marginBottom: 8 }}>
        <label htmlFor="edit-desc">Description</label>
        <textarea
          id="edit-desc"
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
          Public
        </label>
        <br />
        <label>
          <input
            type="radio"
            checked={joinPolicy === "INVITE_ONLY"}
            onChange={() => setJoinPolicy("INVITE_ONLY")}
            style={{ marginRight: 6 }}
          />
          Invite-only
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" disabled={busy}>
          {busy ? "Saving..." : "Save"}
        </button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
