"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { createListing, getItemTypeTemplates, type FieldSchema, type ItemTypeTemplate } from "@/lib/api";

// Fields rendered specially (title/description/location are common to every
// itemType; everything else in a template's fieldSchema is "extra").
const COMMON_FIELDS = new Set(["title", "description", "location"]);

function toIsoOrUndefined(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
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
      return <input id={field.name} type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} />;
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
  const { token, loading } = useAuth();

  const [templates, setTemplates] = useState<ItemTypeTemplate[] | null>(null);
  const [itemType, setItemType] = useState("");
  const [type, setType] = useState<"OFFER" | "WANT">("OFFER");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [minReputation, setMinReputation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!token) {
      router.push("/login");
      return;
    }
    getItemTypeTemplates()
      .then((list) => {
        setTemplates(list);
        if (list.length > 0) setItemType(list[0].itemType);
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
      if (template.itemType === "mealmate.meal") {
        await createListing(token, {
          itemType: template.itemType,
          title,
          description: description || undefined,
          location,
          mealTime: toIsoOrUndefined(extra.mealTime ?? ""),
          capacity: extra.capacity ? Number(extra.capacity) : undefined,
          dietaryInfo: extra.dietaryInfo || undefined,
          minReputation: minReputationValue,
        });
      } else {
        const attributes: Record<string, unknown> = {};
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

        await createListing(token, {
          itemType: template.itemType,
          type,
          title,
          description: description || undefined,
          location,
          attributes,
          fees: template.defaultFees,
          currencies: template.defaultCurrencies,
          minReputation: minReputationValue,
        });
      }
      router.push("/dashboard");
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

        {template && template.itemType !== "mealmate.meal" && (
          <p>
            <em>
              Default pricing for &quot;{template.label}&quot;:{" "}
              {template.defaultFees.length === 0
                ? "no fees"
                : template.defaultFees
                    .map((f) => `${f.kind}${f.currency ? ` (${f.currency})` : ""}${f.required ? "" : ", optional"}`)
                    .join(", ")}
              .
            </em>
          </p>
        )}

        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? "Saving..." : "Create listing"}
        </button>
      </form>
    </main>
  );
}
