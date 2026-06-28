// Fetches trust in-degree for a Circles wallet from the Circles Hub v1
// subgraph on Gnosis Chain, normalised to 0-100.
//
// Endpoint may need updating if The Graph hosted service goes away —
// swap SUBGRAPH_URL for the decentralised network URL + API key.
// The function returns null on any fetch/parse failure so the caller can
// gracefully fall back to local-only reputation.

import { normaliseTrustCount } from "./lib.js";

const SUBGRAPH_URL =
  process.env.CIRCLES_SUBGRAPH_URL ??
  "https://api.thegraph.com/subgraphs/name/circlesubi/circles-ubi";

const QUERY = `
  query TrustCount($address: String!) {
    trusts(where: { canSendTo: $address, limitPercentage_gt: 0 }) {
      id
    }
  }
`;

export async function fetchCirclesTrustScore(walletAddress: string): Promise<number | null> {
  try {
    const res = await fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { address: walletAddress.toLowerCase() } }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = await res.json() as { data?: { trusts?: { id: string }[] } };
    const count = json.data?.trusts?.length ?? null;
    if (count === null) return null;
    return normaliseTrustCount(count);
  } catch {
    return null;
  }
}
