import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const SEED_PASSWORD = "password123";

async function main() {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  const alice = await prisma.actor.create({
    data: {
      email: "alice@example.com",
      passwordHash,
      displayName: "Alice",
      reputationScore: 72,
      isAdmin: true,
      credits: { create: { creditType: "mealmate.meal-credit", amount: 3 } },
    },
  });
  const bob = await prisma.actor.create({
    data: {
      email: "bob@example.com",
      passwordHash,
      displayName: "Bob",
      reputationScore: 58,
      credits: { create: { creditType: "mealmate.meal-credit", amount: 3 } },
    },
  });

  await prisma.listing.create({
    data: {
      type: "OFFER",
      actorId: alice.id,
      itemType: "mealmate.meal",
      fees: [
        {
          scope: "user",
          kind: "credit",
          creditType: "mealmate.meal-credit",
          amount: 1,
          required: true,
        },
        {
          scope: "user",
          kind: "donation",
          currency: "CRC",
          required: false,
        },
      ],
      currencies: [{ currency: "mealmate.meal-credit", preferred: true }],
      attributes: {
        title: "Veggie chilli for extras",
        description: "Making a big pot of chilli, happy to have 2 more over.",
        location: { lat: 51.5074, lng: -0.1278, address: "Hackney, London" },
        mealTime: new Date(Date.now() + 1000 * 60 * 60 * 5).toISOString(),
        capacity: 3,
        spotsRemaining: 2,
        dietaryInfo: ["vegetarian"],
      },
    },
  });

  await prisma.listing.create({
    data: {
      type: "OFFER",
      actorId: bob.id,
      itemType: "mealmate.meal",
      fees: [
        {
          scope: "user",
          kind: "credit",
          creditType: "mealmate.meal-credit",
          amount: 1,
          required: true,
        },
      ],
      currencies: [{ currency: "mealmate.meal-credit", preferred: true }],
      attributes: {
        title: "Sunday roast, extra portions",
        description: "Roasting a chicken, plenty of veg going spare.",
        location: { lat: 51.4545, lng: -2.5879, address: "Bristol" },
        mealTime: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
        capacity: 2,
        spotsRemaining: 1,
        dietaryInfo: [],
      },
    },
  });

  // wantoff.other examples — show the freeform itemType / WANT side of the
  // protocol alongside Mealmate's meal OFFERs (see docs/wantoff-app-plan.md).
  await prisma.listing.create({
    data: {
      type: "OFFER",
      actorId: bob.id,
      itemType: "wantoff.other",
      fees: [{ scope: "user", kind: "donation", currency: "CRC", required: false }],
      currencies: [{ currency: "CRC", preferred: true }],
      attributes: {
        title: "Spare cordless drill",
        description: "Barely used, happy to lend or give away.",
      },
    },
  });

  await prisma.listing.create({
    data: {
      type: "WANT",
      actorId: alice.id,
      itemType: "wantoff.other",
      fees: [{ scope: "user", kind: "donation", currency: "CRC", required: false }],
      currencies: [{ currency: "CRC", preferred: true }],
      attributes: {
        title: "Looking for: bike pump",
        description: "Just need a track pump for a day, happy to tip in CRC.",
      },
    },
  });

  await prisma.itemTypeTemplate.create({
    data: {
      itemType: "mealmate.meal",
      label: "Spare seats at a meal",
      fieldSchema: [
        { name: "title", label: "Title", type: "string", required: true },
        { name: "description", label: "Description", type: "text", required: false },
        { name: "location", label: "Location", type: "location", required: true },
        { name: "mealTime", label: "Meal time", type: "date", required: true },
        { name: "capacity", label: "Capacity", type: "number", required: true },
        { name: "dietaryInfo", label: "Dietary info", type: "string[]", required: false },
      ],
      defaultFees: [
        { scope: "user", kind: "credit", creditType: "mealmate.meal-credit", amount: 1, required: true },
        { scope: "user", kind: "donation", currency: "CRC", required: false },
      ],
      defaultCurrencies: [{ currency: "mealmate.meal-credit", preferred: true }],
    },
  });

  await prisma.itemTypeTemplate.create({
    data: {
      itemType: "wantoff.other",
      label: "Something else",
      fieldSchema: [],
      defaultFees: [{ scope: "user", kind: "currency", currency: "CRC", required: true }],
      defaultCurrencies: [{ currency: "CRC", preferred: true }],
    },
  });

  console.log(`Seeded alice@example.com / bob@example.com, password "${SEED_PASSWORD}"`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
