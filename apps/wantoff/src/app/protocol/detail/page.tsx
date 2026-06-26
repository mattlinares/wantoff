import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Protocol detail — Wantoff",
  description:
    "Full specification: item types, how to add your own product or activity, sharing, and the relationship to prior work like Valueflows.",
};

export default function ProtocolDetailPage() {
  return (
    <main className="container">
      <p style={{ marginTop: 0 }}>
        <Link href="/protocol">← Back to overview</Link>
      </p>

      <h1>How the protocol works</h1>

      <h2>The four core concepts</h2>
      <p>At its core, the protocol is a common shape for four things:</p>
      <ul>
        <li>
          <strong>Listings</strong> — an offer (&ldquo;I have spare portions of tonight&apos;s
          dinner&rdquo;) or a want (&ldquo;I&apos;m looking for a lift to Brighton on
          Friday&rdquo;). Every listing carries a type, a set of terms (fees, currencies,
          minimum reputation), and an app-specific payload of structured details.
        </li>
        <li>
          <strong>Actors</strong> — the person or organisation making the listing. One account
          works across every app on the protocol (Mealmate, Wantoff, and any future app).
        </li>
        <li>
          <strong>Exchanges</strong> — created when an offer and a want are matched: who&apos;s
          involved, what was agreed, what was paid, and what happened next.
        </li>
        <li>
          <strong>Reviews</strong> — mutual reputation feedback after an exchange, building a
          behavioural trust signal that travels with you across apps.
        </li>
      </ul>
      <p>
        Mealmate fills this in with &ldquo;home-cooked meals&rdquo;. Wantoff uses the same
        backbone for anything else. The idea is that the format — not any one app — becomes
        the shared layer, so different communities and tools can interoperate.
      </p>

      <h2>Item types: how apps define their own thing</h2>
      <p>
        Every listing has an <code>itemType</code> — a namespaced string that says what kind
        of thing is being offered or wanted. Mealmate uses <code>mealmate.meal</code>. A
        skill-swap app might use <code>myapp.skill</code>. A community library might use{" "}
        <code>brightontools.item</code>.
      </p>
      <p>
        Each item type comes with a <strong>field schema</strong> — a description of the
        structured details that make sense for that type (for a meal: title, time, capacity,
        dietary info; for a tool loan: tool name, collection point, return period). The schema
        travels with the type definition, so any client that knows the schema can render a
        proper form and validate the data.
      </p>
      <p>
        There is also a built-in freeform fallback — <code>wantoff.other</code> — with just a
        title and description, for anything that doesn&apos;t have a curated type yet.
      </p>

      <h2>How to add your own product or activity</h2>
      <p>There are two routes, depending on what you&apos;re trying to do:</p>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ margin: "0 0 8px" }}>1. Post a listing right now, using the freeform type</h3>
        <p style={{ margin: "0 0 8px" }}>
          <Link href="/login">Log in</Link> (or create an account), then go to{" "}
          <Link href="/listings/new">Add a want or offer</Link>. Choose &ldquo;Other /
          freeform&rdquo; as the type, fill in a title, description, location, and any price
          or terms. Your listing appears on the network immediately and shows up on your{" "}
          <Link href="/dashboard">public profile</Link>.
        </p>
        <p style={{ margin: 0, color: "#555", fontSize: 14 }}>
          Good for: one-off listings, testing, or anything that doesn&apos;t need a structured
          form yet.
        </p>
      </div>

      <div className="card" style={{ marginBottom: 40 }}>
        <h3 style={{ margin: "0 0 8px" }}>2. Register a curated item type for your product or community</h3>
        <p style={{ margin: "0 0 8px" }}>
          If you run a product, service, or community and want a proper structured type (with
          its own field schema, default pricing, and a dedicated form in every client that
          implements the protocol), you can register an <code>itemType</code> via the template
          registry. Registered types:
        </p>
        <ul style={{ margin: "0 0 8px" }}>
          <li>
            get a machine-readable JSON field schema, published at{" "}
            <code>GET /item-type-templates</code>
          </li>
          <li>appear in the item-type picker when anyone creates a listing via Wantoff</li>
          <li>
            can carry default fee and currency settings (e.g. &ldquo;this type defaults to CRC
            pricing&rdquo;)
          </li>
          <li>become a shared vocabulary other apps can adopt</li>
        </ul>
        <p style={{ margin: 0, color: "#555", fontSize: 14 }}>
          To register a type, get in touch — admin registration is currently manual while the
          governance model is being worked out, but the intent is to open this up to
          self-registration with community review.
        </p>
      </div>

      <h2>Sharing your listings</h2>
      <p>
        Every actor on the network has a <strong>public profile page</strong> — a linkable,
        embeddable page that shows their open listings across all item types, their reputation
        score, and (if they&apos;ve connected a Circles wallet) a CRC payment link.
      </p>
      <p>
        Your profile URL is <code>/u/[your-id]</code>. You can share it directly, or embed it
        in any page as a compact card:
      </p>
      <pre
        style={{
          background: "#f0efeb",
          border: "1px solid #e3e0d8",
          borderRadius: 8,
          padding: 16,
          overflowX: "auto",
          fontSize: 14,
        }}
      >
        {`<iframe
  src="https://wantoff.example.com/u/[your-id]?embed=1"
  width="400"
  height="300"
  style="border:none; border-radius:10px;"
></iframe>`}
      </pre>
      <p>
        The <code>?embed=1</code> variant strips the site header so the card fits cleanly
        inside another page.
      </p>

      <h2>Prior art: Valueflows</h2>
      <p>
        The closest existing work is{" "}
        <a href="https://www.valueflo.ws/" target="_blank" rel="noopener noreferrer">
          Valueflows
        </a>{" "}
        — an open vocabulary for economic networks, built on the REA
        (Resources–Events–Agents) accounting ontology and serialised as RDF/Linked Data. It
        has been in development since around 2015, maintained by a small group of volunteers
        from the solidarity-economy world. The conceptual overlap with this protocol is
        significant: Valueflows&apos; <em>Agent</em> maps to our <code>Actor</code>, its{" "}
        <em>Intent</em> (offers and requests) maps to our <code>Listing</code>, and its{" "}
        <em>Commitment</em> and <em>Economic Event</em> map to our <code>Exchange</code> and{" "}
        <code>Payment</code>.
      </p>
      <p>
        Despite that, very few apps have been built on Valueflows. The reasons are
        instructive: it specifies a vocabulary, not an API — every implementer has to design
        their own protocol on top of an RDF ontology, which is a steep starting point for most
        developers. It also covers far more than most use cases need (production recipes, supply
        chains, ecological accounting across organisations) with no equivalent of reputation,
        Circles/CRC payments, or a practical item-type registry.
      </p>
      <p>
        This protocol is intended to solve the same interoperability goal — a shared vocabulary
        anyone can read and build on — but as plain JSON schemas over a REST API rather than
        RDF. If you&apos;re coming from the Valueflows or solidarity-economy world, the
        concepts should feel familiar; the packaging is just different.
      </p>

      <h2>The technical schema</h2>
      <p>
        The full data model —{" "}
        <code>Actor</code>, <code>Listing</code>, <code>Fee</code>, <code>Exchange</code>,{" "}
        <code>Review</code>, and <code>ItemTypeTemplate</code> — is documented in{" "}
        <code>docs/exchange-protocol.md</code> in the repository. The API is plain JSON/REST.
        An ATProto lexicon mapping is on the roadmap for when federation between separate
        backends is wanted.
      </p>
      <p style={{ color: "#555" }}>
        The current backend is open source. If you want to run your own node of the network,
        contribute a new item type definition, or just look at how the matching and reputation
        maths work, that&apos;s the place to start.
      </p>
    </main>
  );
}
