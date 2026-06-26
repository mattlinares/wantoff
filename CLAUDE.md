# Mealmate / Circles Wantoff — project instructions

## Every feature needs tests and docs

When adding or changing a feature:

- **Tests**: add or update tests alongside the code. Backend pure-logic
  helpers live in `apps/backend/src/lib.ts` with unit tests in
  `apps/backend/src/lib.test.ts` (`npm run test --workspace=@mealmate/backend`,
  via vitest). When you add a new piece of business logic (fee rules,
  reputation math, matching/sorting, etc.), extract it as a pure function in
  `lib.ts` and cover it with a test — don't leave the only coverage as an
  ad-hoc curl command in a chat transcript.
- **Docs**: update `README.md` (setup/run instructions) and
  `docs/exchange-protocol.md` (protocol/schema decisions) when behaviour,
  endpoints, env vars, or schema change. New env vars must be added to
  `apps/backend/.env.example` and root `.env.example`/`docker-compose.prod.yml`.

Don't consider a feature done until both of the above are in place.
