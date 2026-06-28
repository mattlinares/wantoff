"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { updateMe } from "@/lib/api";

type NominatimResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  importance: number;
};

async function geocodeNeighbourhood(query: string): Promise<NominatimResult[]> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=0`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("Geocoding failed");
  return res.json() as Promise<NominatimResult[]>;
}

export default function EditProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { actor, token, refresh } = useAuth();
  const router = useRouter();

  const isOwner = actor?.id === id;

  const [displayName, setDisplayName] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [results, setResults] = useState<NominatimResult[] | null>(null);
  const [chosenLocation, setChosenLocation] = useState<{ lat: number; lng: number; address: string } | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!actor) return;
    setDisplayName(actor.displayName);
    const loc = actor.location;
    if (loc?.address) {
      setLocationQuery(loc.address);
      setChosenLocation({ lat: loc.lat, lng: loc.lng, address: loc.address });
    }
  }, [actor]);

  useEffect(() => {
    if (!actor && !token) router.replace("/login");
    if (actor && !isOwner) router.replace(`/u/${id}`);
  }, [actor, token, isOwner, id, router]);

  async function onSearch() {
    if (!locationQuery.trim()) return;
    setSearching(true);
    setSearchError(null);
    setResults(null);
    setChosenLocation(null);
    try {
      const found = await geocodeNeighbourhood(locationQuery.trim());
      if (found.length === 0) {
        setSearchError("No locations found — try a more specific name (e.g. 'Hackney, London').");
      } else {
        setResults(found);
      }
    } catch {
      setSearchError("Search failed — check your connection and try again.");
    } finally {
      setSearching(false);
    }
  }

  function pickResult(r: NominatimResult) {
    const address = locationQuery.trim() || r.display_name;
    setChosenLocation({ lat: parseFloat(r.lat), lng: parseFloat(r.lon), address });
    setResults(null);
  }

  async function onSave() {
    if (!token) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateMe(token, {
        displayName: displayName.trim() || undefined,
        ...(chosenLocation !== null ? { location: chosenLocation } : {}),
      });
      await refresh();
      router.push(`/u/${id}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!actor || !isOwner) return <main className="container"><p>Loading…</p></main>;

  return (
    <main className="container" style={{ maxWidth: 520 }}>
      <h1>Edit profile</h1>

      <label style={{ display: "block", marginBottom: 20 }}>
        <span style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>Display name</span>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 15 }}
        />
      </label>

      <fieldset style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "16px 20px", marginBottom: 20 }}>
        <legend style={{ fontWeight: 600, padding: "0 6px" }}>Location</legend>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--muted)" }}>
          Used to show nearby listings. Neighbourhood or district level is fine.
        </p>

        {actor.location && !chosenLocation && (
          <p style={{ margin: "0 0 12px", fontSize: 13 }}>
            Current: <strong>{actor.location.address ?? `${actor.location.lat.toFixed(3)}, ${actor.location.lng.toFixed(3)}`}</strong>
          </p>
        )}

        {chosenLocation && (
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--accent)" }}>
            ✓ Set to: <strong>{chosenLocation.address}</strong>
            <button
              onClick={() => { setChosenLocation(null); setLocationQuery(""); }}
              style={{ marginLeft: 8, fontSize: 12, padding: "1px 6px", background: "none", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer", color: "var(--muted)" }}
            >
              Clear
            </button>
          </p>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            placeholder="e.g. Hackney, London"
            value={locationQuery}
            onChange={(e) => { setLocationQuery(e.target.value); setResults(null); }}
            onKeyDown={(e) => e.key === "Enter" && onSearch()}
            style={{ flex: 1, padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 14 }}
          />
          <button onClick={onSearch} disabled={searching || !locationQuery.trim()}>
            {searching ? "Searching…" : "Find"}
          </button>
        </div>

        {searchError && <p style={{ margin: "8px 0 0", fontSize: 13, color: "#dc2626" }}>{searchError}</p>}

        {results && results.length > 0 && (
          <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
            {results.map((r) => (
              <li key={r.place_id}>
                <button
                  onClick={() => pickResult(r)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 12px",
                    background: "var(--surface)",
                    border: "none",
                    borderBottom: "1px solid var(--border)",
                    cursor: "pointer",
                    fontSize: 13,
                    color: "var(--text)",
                  }}
                >
                  {r.display_name}
                </button>
              </li>
            ))}
          </ul>
        )}

        {!chosenLocation && actor.location && (
          <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--muted)" }}>
            Search above to update location, or{" "}
            <button
              onClick={() => updateMe(token!, { location: null }).then(refresh)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 12, textDecoration: "underline", padding: 0 }}
            >
              remove it
            </button>.
          </p>
        )}
      </fieldset>

      {saveError && <p style={{ color: "#dc2626", marginBottom: 12 }}>{saveError}</p>}

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button
          onClick={() => router.push(`/u/${id}`)}
          style={{ background: "none", border: "1px solid var(--border)", color: "var(--muted)" }}
        >
          Cancel
        </button>
      </div>
    </main>
  );
}
