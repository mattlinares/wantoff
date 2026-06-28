import type { Metadata } from "next";
import Link from "next/link";
import { ReputationBadge } from "@/lib/reputation";

export const metadata: Metadata = {
  title: "Building your reputation — Wantoff",
};

const steps = [
  {
    action: "Join a listing and complete the exchange",
    detail:
      "Browse what's available, request or join something, and follow through. Once the exchange is done, both sides can leave a review. Each positive review moves your score up.",
    cta: { label: "Browse listings", href: "/" },
  },
  {
    action: "Post your own listing",
    detail:
      "Offer something — a skill, an item, a meal. When someone takes you up on it and things go well, they'll review you. Hosting consistently is the fastest way to build a score.",
    cta: { label: "Add a listing", href: "/listings/new" },
  },
  {
    action: "Join a community",
    detail:
      "Communities connect you with people who share context — neighbours, co-working spaces, local groups. Exchanges within a community tend to generate reviews.",
    cta: { label: "Browse communities", href: "/groups" },
  },
];

export default function ReputationPage() {
  return (
    <main className="container">
      <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>
        <Link href="/">← Back</Link>
      </p>

      <h1>Building your reputation</h1>
      <p style={{ color: "var(--muted)", maxWidth: 520, marginBottom: 16 }}>
        Your reputation is shown as a star rating (<ReputationBadge score={50} /> to <ReputationBadge score={100} />)
        based on reviews from people you&apos;ve exchanged with — weighted toward recent
        activity, so it reflects who you are now, not just your history.
      </p>
      <p style={{ color: "var(--muted)", maxWidth: 520, marginBottom: 32, fontSize: 14 }}>
        Everyone starts at <ReputationBadge score={50} />. A few good exchanges will get you to <ReputationBadge score={80} /> or above, which clears most listing thresholds.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 40 }}>
        {steps.map((s, i) => (
          <div key={i} className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <strong style={{ fontSize: "1em" }}>{s.action}</strong>
            <p style={{ margin: 0, color: "var(--muted)", fontSize: 14, lineHeight: 1.6 }}>{s.detail}</p>
            <p style={{ margin: 0 }}>
              <Link href={s.cta.href} style={{ fontSize: 14, fontWeight: 500 }}>{s.cta.label} →</Link>
            </p>
          </div>
        ))}
      </div>

      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 24 }}>
        <p style={{ fontSize: 13, color: "var(--muted)", maxWidth: 480, margin: 0 }}>
          Scores update immediately after a review is submitted. A few good exchanges
          will get you above most thresholds — most listings don&apos;t require a high score
          to join.
        </p>
      </div>
    </main>
  );
}
