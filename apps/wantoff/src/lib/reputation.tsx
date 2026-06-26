import type { CSSProperties } from "react";

const COLORS: Record<number, string> = {
  1: "#ef4444",
  2: "#f97316",
  3: "#eab308",
  4: "#84cc16",
  5: "#22c55e",
};

export function scoreToStars(score: number): number {
  return Math.max(1, Math.min(5, Math.round(score / 20)));
}

export function thresholdToStars(minReputation: number): number {
  return Math.max(1, Math.min(5, Math.ceil(minReputation / 20)));
}

export function ReputationBadge({
  score,
  reviewCount,
  style,
}: {
  score: number;
  reviewCount?: number;
  style?: CSSProperties;
}) {
  const stars = scoreToStars(score);
  const color = COLORS[stars];
  return (
    <span style={{ color, fontWeight: 600, ...style }}>
      {"★".repeat(stars)}{"☆".repeat(5 - stars)}
      {reviewCount !== undefined && (
        <span style={{ color: "#888", fontWeight: 400, fontSize: "0.85em", marginLeft: 6 }}>
          {reviewCount} {reviewCount === 1 ? "review" : "reviews"}
        </span>
      )}
    </span>
  );
}

export function ReputationGate({ minReputation }: { minReputation: number }) {
  const stars = thresholdToStars(minReputation);
  const color = COLORS[stars];
  return (
    <span style={{ color, fontSize: "0.9em" }}>
      Requires {"★".repeat(stars)}{"☆".repeat(5 - stars)}
    </span>
  );
}
