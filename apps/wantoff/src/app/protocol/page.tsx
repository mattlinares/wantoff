import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "The Protocol — Wantoff",
  description:
    "An open format for publishing what you have to give and what you're looking for — so any app or community can build on the same network.",
};

const concepts = [
  {
    label: "You publish a listing",
    body: "A meal with spare seats. A tool you'll lend. A skill you'll trade. Any offer or want, in any category.",
  },
  {
    label: "It lives on an open network",
    body: "No single app owns your listing. Mealmate, Wantoff, and any future app built on the protocol can all see it.",
  },
  {
    label: "Someone responds",
    body: "An exchange is created — who's involved, what was agreed, what it costs. Settled directly between people.",
  },
  {
    label: "Reputation follows you",
    body: "After an exchange, both sides can review each other. That trust score travels with your account across every app on the network.",
  },
];

export default function ProtocolPage() {
  return (
    <main className="container">
      <p style={{ fontSize: 13, color: "#888", marginBottom: 8, marginTop: 0 }}>
        A common format. Any app. Any category.
      </p>
      <h1 style={{ fontSize: "2em", marginTop: 0, marginBottom: 12 }}>
        An open protocol for wants &amp; offers
      </h1>
      <p style={{ fontSize: "1.15em", color: "#333", marginBottom: 40, maxWidth: 560 }}>
        Mealmate is one app built on it. Wantoff is another. The protocol itself
        is open — anyone can publish a listing, build an app on top, or add a new
        category to the network.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
          marginBottom: 40,
        }}
      >
        {concepts.map((c, i) => (
          <div
            key={i}
            className="card"
            style={{ display: "flex", flexDirection: "column", gap: 6 }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#1a6b4a",
              }}
            >
              {i + 1}
            </span>
            <strong style={{ fontSize: "1em" }}>{c.label}</strong>
            <p style={{ margin: 0, color: "#555", fontSize: 14, lineHeight: 1.5 }}>
              {c.body}
            </p>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: 48 }}>
        <Link href="/listings/new">
          <button style={{ fontSize: 15, padding: "10px 20px" }}>
            Add a want or offer
          </button>
        </Link>
        <Link href="/protocol/detail" style={{ fontSize: 15 }}>
          How it works in detail →
        </Link>
      </div>

      <hr style={{ border: "none", borderTop: "1px solid #e3e0d8", marginBottom: 32 }} />

      <p style={{ color: "#888", fontSize: 14, maxWidth: 520 }}>
        The protocol is a plain JSON/REST format — no proprietary platform, no single
        owner. Any developer can run a node, register a new item type, or build their
        own app on top.{" "}
        <Link href="/protocol/detail">Full specification and background →</Link>
      </p>
    </main>
  );
}
