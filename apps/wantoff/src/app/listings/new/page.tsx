"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { createListing, getItemTypeTemplates, getGroups, addListingToGroup, type FieldSchema, type ItemTypeTemplate, type Group } from "@/lib/api";

// Fields rendered specially (title/description/location are common to every
// itemType; everything else in a template's fieldSchema is "extra").
const COMMON_FIELDS = new Set(["title", "description", "location"]);

function toIsoOrUndefined(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = ["00", "15", "30", "45"];

function DateTimeInput({ id, value, onChange }: { id?: string; value: string; onChange: (v: string) => void }) {
  const [datePart, timePart] = value.includes("T") ? value.split("T") : [value, ""];
  const [extHh, extMm] = timePart ? timePart.split(":") : ["", ""];

  // Keep hour/minute in local state so selections persist even before a date is chosen
  const [hh, setHh] = useState(extHh);
  const [mm, setMm] = useState(extMm);

  // Sync if parent resets the value externally
  useEffect(() => { setHh(extHh); }, [extHh]);
  useEffect(() => { setMm(extMm); }, [extMm]);

  const emit = (d: string, h: string, m: string) => {
    if (d) onChange(`${d}T${h || "00"}:${m || "00"}`);
  };

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      <input id={id} type="date" value={datePart} onChange={(e) => emit(e.target.value, hh, mm)} style={{ flex: "1 1 auto" }} />
      <select value={hh} onChange={(e) => { setHh(e.target.value); emit(datePart, e.target.value, mm); }} style={{ width: 70 }}>
        <option value="">HH</option>
        {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
      <select value={mm} onChange={(e) => { setMm(e.target.value); emit(datePart, hh, e.target.value); }} style={{ width: 70 }}>
        <option value="">MM</option>
        {MINUTES.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
    </div>
  );
}

function ExtraField({
  field,
  value,
  onChange,
}: {
  field: FieldSchema;
  value: string;
  onChange: (value: string) => void;
}) {
  switch (field.type) {
    case "text":
      return (
        <textarea id={field.name} value={value} onChange={(e) => onChange(e.target.value)} rows={3} />
      );
    case "number":
      return <input id={field.name} type="number" value={value} onChange={(e) => onChange(e.target.value)} />;
    case "date":
      return <DateTimeInput id={field.name} value={value} onChange={onChange} />;
    case "boolean":
      return (
        <input
          id={field.name}
          type="checkbox"
          checked={value === "true"}
          onChange={(e) => onChange(e.target.checked ? "true" : "false")}
        />
      );
    case "string[]":
      return (
        <input
          id={field.name}
          value={value}
          placeholder="comma-separated"
          onChange={(e) => onChange(e.target.value)}
        />
      );
    default:
      return <input id={field.name} value={value} onChange={(e) => onChange(e.target.value)} />;
  }
}

export default function NewListingPage() {
  const router = useRouter();
  const { token, actor, loading } = useAuth();

  const [templates, setTemplates] = useState<ItemTypeTemplate[] | null>(null);
  const [itemType, setItemType] = useState("");
  const [type, setType] = useState<"OFFER" | "WANT">("OFFER");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [duration, setDuration] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [creditFeeAmount, setCreditFeeAmount] = useState("1");
  const [minReputation, setMinReputation] = useState("");
  const [priceType, setPriceType] = useState<"free" | "crc">("free");
  const [priceAmount, setPriceAmount] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([""]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!token) {
      router.push("/login");
      return;
    }
    Promise.all([
      getItemTypeTemplates(),
      getGroups(token),
    ])
      .then(([list, myGroups]) => {
        setTemplates(list);
        if (list.length > 0) setItemType(list[0].itemType);
        setGroups(myGroups.filter((g) => g.myRole != null));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "failed to load item types"));
  }, [loading, token, router]);

  const template = templates?.find((t) => t.itemType === itemType);
  const extraFields = (template?.fieldSchema ?? []).filter((f) => !COMMON_FIELDS.has(f.name));
  const hasLocationField = (template?.fieldSchema ?? []).some((f) => f.name === "location");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !template) return;
    setError(null);
    setSubmitting(true);

    const location =
      address || lat || lng
        ? {
            ...(address ? { address } : {}),
            ...(lat ? { lat: Number(lat) } : {}),
            ...(lng ? { lng: Number(lng) } : {}),
          }
        : undefined;

    const minReputationValue = minReputation ? Number(minReputation) : undefined;

    try {
      const photos = photoUrls.map((u) => u.trim()).filter(Boolean);
      let listing;
      if (template.itemType === "mealmate.meal") {
        listing = await createListing(token, {
          itemType: template.itemType,
          title,
          description: description || undefined,
          location,
          mealTime: toIsoOrUndefined(extra.mealTime ?? ""),
          capacity: extra.capacity ? Number(extra.capacity) : undefined,
          dietaryInfo: extra.dietaryInfo || undefined,
          creditFeeAmount: creditFeeAmount !== "" ? Number(creditFeeAmount) : 1,
          minReputation: minReputationValue,
          attributes: photos.length > 0 ? { photos } : undefined,
        });
      } else {
        const attributes: Record<string, unknown> = {};
        if (photos.length > 0) attributes.photos = photos;
        if (duration) attributes.duration = Number(duration);
        if (scheduledTime) attributes.scheduledTime = toIsoOrUndefined(scheduledTime);
        for (const field of extraFields) {
          const raw = extra[field.name] ?? "";
          if (!raw) continue;
          switch (field.type) {
            case "number":
              attributes[field.name] = Number(raw);
              break;
            case "boolean":
              attributes[field.name] = raw === "true";
              break;
            case "date":
              attributes[field.name] = toIsoOrUndefined(raw);
              break;
            case "string[]":
              attributes[field.name] = raw.split(",").map((s) => s.trim()).filter(Boolean);
              break;
            default:
              attributes[field.name] = raw;
          }
        }

        const fees = priceType === "crc" && priceAmount
          ? [{ scope: "user" as const, kind: "currency" as const, currency: "CRC", amount: Number(priceAmount), required: true }]
          : [{ scope: "user" as const, kind: "donation" as const, currency: "CRC", required: false }];

        listing = await createListing(token, {
          itemType: template.itemType,
          type,
          title,
          description: description || undefined,
          location,
          attributes,
          fees,
          currencies: [{ currency: "CRC", preferred: true }],
          minReputation: minReputationValue,
        });
      }
      if (selectedGroupIds.length > 0) {
        await Promise.allSettled(
          selectedGroupIds.map((gid) => addListingToGroup(token, listing.id, gid)),
        );
      }
      router.push(actor ? `/u/${actor.id}` : "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to create listing");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || templates === null) {
    return (
      <main className="container">
        <p>Loading...</p>
      </main>
    );
  }

  return (
    <main className="container">
      <h1>Add a want or offer</h1>
      <form onSubmit={onSubmit}>
        <div className="form-row">
          <label htmlFor="itemType">Type of listing</label>
          <select
            id="itemType"
            value={itemType}
            onChange={(e) => {
              setItemType(e.target.value);
              setExtra({});
            }}
          >
            {templates.map((t) => (
              <option key={t.itemType} value={t.itemType}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {template && template.itemType !== "mealmate.meal" && (
          <div className="form-row">
            <label htmlFor="type">I am...</label>
            <select id="type" value={type} onChange={(e) => setType(e.target.value as "OFFER" | "WANT")}>
              <option value="OFFER">Offering this</option>
              <option value="WANT">Looking for this</option>
            </select>
          </div>
        )}

        <div className="form-row">
          <label htmlFor="title">Title</label>
          <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>

        <div className="form-row">
          <label htmlFor="description">Description</label>
          <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </div>

        {template && template.itemType !== "mealmate.meal" && (
          <>
            <div className="form-row">
              <label htmlFor="duration">Duration in minutes (optional)</label>
              <input
                id="duration"
                type="number"
                min="1"
                placeholder="e.g. 60 for 1 hour"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
            <div className="form-row">
              <label htmlFor="scheduledTime">Scheduled date &amp; time (optional)</label>
              <DateTimeInput id="scheduledTime" value={scheduledTime} onChange={setScheduledTime} />
            </div>
          </>
        )}

        {(hasLocationField || template?.itemType === "wantoff.other") && (
          <>
            <div className="form-row">
              <label htmlFor="address">Location (address)</label>
              <input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="form-row">
              <label htmlFor="lat">Latitude</label>
              <input id="lat" type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} />
            </div>
            <div className="form-row">
              <label htmlFor="lng">Longitude</label>
              <input id="lng" type="number" step="any" value={lng} onChange={(e) => setLng(e.target.value)} />
            </div>
          </>
        )}

        {extraFields.map((field) => (
          <div className="form-row" key={field.name}>
            <label htmlFor={field.name}>
              {field.label}
              {field.required ? " *" : ""}
            </label>
            <ExtraField
              field={field}
              value={extra[field.name] ?? ""}
              onChange={(value) => setExtra((prev) => ({ ...prev, [field.name]: value }))}
            />
          </div>
        ))}

        <div className="form-row">
          <label>Photos (optional)</label>
          {photoUrls.map((url, i) => (
            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <input
                type="url"
                placeholder="https://..."
                value={url}
                onChange={(e) => setPhotoUrls((prev) => prev.map((u, j) => j === i ? e.target.value : u))}
                style={{ flex: 1 }}
              />
              {url.trim() && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url.trim()} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4, border: "1px solid var(--border)", flexShrink: 0 }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              )}
              {photoUrls.length > 1 && (
                <button type="button" onClick={() => setPhotoUrls((prev) => prev.filter((_, j) => j !== i))} style={{ padding: "0 8px", background: "none", color: "var(--muted)", border: "1px solid var(--border)" }}>✕</button>
              )}
            </div>
          ))}
          {photoUrls.length < 5 && (
            <button type="button" onClick={() => setPhotoUrls((prev) => [...prev, ""])} style={{ fontSize: 13, padding: "4px 10px", background: "none", border: "1px solid var(--border)", color: "var(--muted)" }}>
              + Add photo
            </button>
          )}
        </div>

        {groups.length > 0 && (
          <div className="form-row">
            <label>Add to community (optional)</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
              {groups.map((g) => (
                <label key={g.id} style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: "normal", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={selectedGroupIds.includes(g.id)}
                    onChange={(e) =>
                      setSelectedGroupIds((prev) =>
                        e.target.checked ? [...prev, g.id] : prev.filter((id) => id !== g.id),
                      )
                    }
                  />
                  {g.name}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="form-row">
          <label htmlFor="minReputation">Minimum reputation to respond (optional)</label>
          <input
            id="minReputation"
            type="number"
            min="0"
            max="100"
            value={minReputation}
            onChange={(e) => setMinReputation(e.target.value)}
          />
        </div>

        {template && template.itemType === "mealmate.meal" && (
          <div className="form-row">
            <label htmlFor="creditFeeAmount">Cost per guest (Mealshare credits)</label>
            <input
              id="creditFeeAmount"
              type="number"
              min="0"
              step="1"
              value={creditFeeAmount}
              onChange={(e) => setCreditFeeAmount(e.target.value)}
              style={{ width: 100 }}
            />
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)" }}>
              Set to 0 for a free meal. Guests need this many Mealshare credits to join.
            </p>
          </div>
        )}

        {template && template.itemType !== "mealmate.meal" && (
          <div className="form-row">
            <label>Price</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: "normal", cursor: "pointer" }}>
                <input type="radio" name="priceType" value="free" checked={priceType === "free"} onChange={() => setPriceType("free")} />
                Free / donation
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: "normal", cursor: "pointer" }}>
                <input type="radio" name="priceType" value="crc" checked={priceType === "crc"} onChange={() => setPriceType("crc")} />
                Fixed price in CRC
              </label>
              {priceType === "crc" && (
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="Amount in CRC"
                  value={priceAmount}
                  onChange={(e) => setPriceAmount(e.target.value)}
                  style={{ width: 160, marginLeft: 24 }}
                />
              )}
            </div>
          </div>
        )}

        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? "Saving..." : "Create listing"}
        </button>
      </form>
    </main>
  );
}
