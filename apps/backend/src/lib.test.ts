import { describe, expect, it } from "vitest";
import {
  canAddToGroup,
  distanceKm,
  isFrequentDiner,
  nextReputationScore,
  parseCurrencyOptions,
  parseFees,
  parseFieldSchema,
  parseMinReputation,
  scoreToStars,
  serializeListing,
  slugify,
} from "./lib.js";

describe("scoreToStars", () => {
  it("maps 0 to 1 star (floor clamp)", () => expect(scoreToStars(0)).toBe(1));
  it("maps 30 to 2 stars", () => expect(scoreToStars(30)).toBe(2));
  it("maps 50 to 3 stars", () => expect(scoreToStars(50)).toBe(3));
  it("maps 70 to 4 stars", () => expect(scoreToStars(70)).toBe(4));
  it("maps 100 to 5 stars", () => expect(scoreToStars(100)).toBe(5));
  it("rounds to nearest star", () => {
    expect(scoreToStars(25)).toBe(1); // Math.round(1.25) = 1
    expect(scoreToStars(35)).toBe(2); // Math.round(1.75) = 2
  });
});

describe("canAddToGroup", () => {
  it("blocks actors with < 2 stars (score < 30)", () => {
    expect(canAddToGroup(0)).toBe(false);
    expect(canAddToGroup(29)).toBe(false);
  });
  it("allows actors with ≥ 2 stars (score ≥ 30)", () => {
    expect(canAddToGroup(30)).toBe(true);
    expect(canAddToGroup(100)).toBe(true);
  });
});

describe("slugify", () => {
  it("lowercases and replaces spaces with hyphens", () =>
    expect(slugify("Bristol Food Sharers")).toBe("bristol-food-sharers"));
  it("strips leading/trailing hyphens", () =>
    expect(slugify("  hello world  ")).toBe("hello-world"));
  it("collapses multiple non-alphanumeric chars", () =>
    expect(slugify("hello---world!!")).toBe("hello-world"));
});

describe("distanceKm", () => {
  it("is zero for the same point", () => {
    expect(distanceKm({ lat: 51.5, lng: -0.12 }, { lat: 51.5, lng: -0.12 })).toBeCloseTo(0);
  });

  it("matches the known distance between London and Bristol (~170km)", () => {
    const london = { lat: 51.5074, lng: -0.1278 };
    const bristol = { lat: 51.4545, lng: -2.5879 };
    expect(distanceKm(london, bristol)).toBeCloseTo(170.5, 0);
  });
});

describe("nextReputationScore", () => {
  it("moves toward the review score by alpha * weight", () => {
    // current=50, review=100, weight=1, alpha=0.2 -> 50 + 0.2*(100-50) = 60
    expect(nextReputationScore(50, 100, 1)).toBeCloseTo(60);
  });

  it("moves down for low review scores", () => {
    // current=50, review=0, weight=1 -> 50 + 0.2*(0-50) = 40
    expect(nextReputationScore(50, 0, 1)).toBeCloseTo(40);
  });

  it("clamps to [0, 100]", () => {
    expect(nextReputationScore(99, 100, 10)).toBeLessThanOrEqual(100);
    expect(nextReputationScore(1, 0, 10)).toBeGreaterThanOrEqual(0);
  });
});

describe("isFrequentDiner", () => {
  it("is false when last week had at most one meal", () => {
    expect(isFrequentDiner(1, 1)).toBe(false);
    expect(isFrequentDiner(5, 0)).toBe(false);
  });

  it("is false when this week's join would still be the first this week", () => {
    expect(isFrequentDiner(0, 2)).toBe(false);
  });

  it("is true after >1 meal/week for >1 consecutive week", () => {
    // last week had 2 (>1), this week already has 1, so this join is the 2nd this week.
    expect(isFrequentDiner(1, 2)).toBe(true);
    expect(isFrequentDiner(3, 5)).toBe(true);
  });
});

describe("parseFees", () => {
  it("treats undefined as no fees", () => {
    expect(parseFees(undefined)).toEqual([]);
  });

  it("rejects non-array input", () => {
    expect(parseFees("not an array")).toBeNull();
    expect(parseFees({})).toBeNull();
  });

  it("accepts a valid fee list", () => {
    expect(parseFees([{ scope: "user", kind: "currency", currency: "CRC", amount: 5, required: false }])).toEqual([
      { scope: "user", kind: "currency", currency: "CRC", amount: 5, required: false },
    ]);
  });

  it("rejects an invalid scope/kind/required", () => {
    expect(parseFees([{ scope: "bogus", kind: "currency", required: false }])).toBeNull();
    expect(parseFees([{ scope: "user", kind: "bogus", required: false }])).toBeNull();
    expect(parseFees([{ scope: "user", kind: "currency", required: "yes" }])).toBeNull();
  });
});

describe("parseCurrencyOptions", () => {
  it("treats undefined as no currencies", () => {
    expect(parseCurrencyOptions(undefined)).toEqual([]);
  });

  it("rejects non-array input", () => {
    expect(parseCurrencyOptions("not an array")).toBeNull();
  });

  it("accepts a valid currency list", () => {
    expect(parseCurrencyOptions([{ currency: "CRC", walletAddress: "0xabc" }])).toEqual([
      { currency: "CRC", walletAddress: "0xabc" },
    ]);
  });

  it("rejects entries with a missing/empty currency", () => {
    expect(parseCurrencyOptions([{ walletAddress: "0xabc" }])).toBeNull();
    expect(parseCurrencyOptions([{ currency: "" }])).toBeNull();
  });
});

describe("parseMinReputation", () => {
  it("treats undefined/null/empty string as no requirement", () => {
    expect(parseMinReputation(undefined)).toEqual({ ok: true, value: null });
    expect(parseMinReputation(null)).toEqual({ ok: true, value: null });
    expect(parseMinReputation("")).toEqual({ ok: true, value: null });
  });

  it("accepts a value in [0, 100]", () => {
    expect(parseMinReputation(75)).toEqual({ ok: true, value: 75 });
    expect(parseMinReputation("40")).toEqual({ ok: true, value: 40 });
  });

  it("rejects values outside [0, 100] or non-numeric", () => {
    expect(parseMinReputation(-1)).toEqual({ ok: false });
    expect(parseMinReputation(101)).toEqual({ ok: false });
    expect(parseMinReputation("not a number")).toEqual({ ok: false });
  });
});

describe("parseFieldSchema", () => {
  it("treats undefined as no fields (freeform)", () => {
    expect(parseFieldSchema(undefined)).toEqual([]);
  });

  it("rejects non-array input", () => {
    expect(parseFieldSchema("not an array")).toBeNull();
    expect(parseFieldSchema({})).toBeNull();
  });

  it("accepts a valid field list", () => {
    expect(
      parseFieldSchema([
        { name: "title", label: "Title", type: "string", required: true },
        { name: "dietaryInfo", label: "Dietary info", type: "string[]", required: false },
      ]),
    ).toEqual([
      { name: "title", label: "Title", type: "string", required: true },
      { name: "dietaryInfo", label: "Dietary info", type: "string[]", required: false },
    ]);
  });

  it("rejects entries with a missing name/label, invalid type, or non-boolean required", () => {
    expect(parseFieldSchema([{ label: "Title", type: "string", required: true }])).toBeNull();
    expect(parseFieldSchema([{ name: "title", type: "string", required: true }])).toBeNull();
    expect(parseFieldSchema([{ name: "title", label: "Title", type: "bogus", required: true }])).toBeNull();
    expect(parseFieldSchema([{ name: "title", label: "Title", type: "string", required: "yes" }])).toBeNull();
  });
});

describe("serializeListing", () => {
  const host = { id: "host-1", displayName: "Host", reputationScore: 80, circlesWallet: "0xhost" };
  const listing = {
    id: "listing-1",
    type: "OFFER",
    itemType: "wantoff.other",
    status: "OPEN",
    attributes: { title: "Spare drill" },
    fees: [],
    currencies: [],
    minReputation: null,
  };

  it("includes the listing fields and host summary", () => {
    expect(serializeListing(listing, host)).toEqual({
      id: "listing-1",
      type: "OFFER",
      itemType: "wantoff.other",
      status: "OPEN",
      attributes: { title: "Spare drill" },
      fees: [],
      currencies: [],
      minReputation: null,
      host: { id: "host-1", displayName: "Host", reputationScore: 80, circlesWallet: "0xhost" },
    });
  });

  it("includes optional distanceKm/joinedByMe only when provided", () => {
    const result = serializeListing(listing, host, { distanceKm: 12.5, joinedByMe: true });
    expect(result.distanceKm).toBe(12.5);
    expect(result.joinedByMe).toBe(true);
  });
});
