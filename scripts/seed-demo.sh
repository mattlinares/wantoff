#!/usr/bin/env bash
# scripts/seed-demo.sh
#
# Populates the app with a demo "Easton Energy Hub" co-working space scenario:
#   - 3 members (Alice, Bob, Carmen)
#   - 1 community group
#   - 9 listings (mix of free, CRC, and one Mealmate meal)
#   - 2 exchanges via the mealmate.meal join flow
#   - Messages and reviews on those exchanges
#
# NOTE: POST /listings/:id/join only works for mealmate.meal.
# Generic wantoff.other listings are created and added to the community,
# but the full exchange flow for those is not yet implemented in the backend.
#
# Usage:
#   ./scripts/seed-demo.sh               # target http://localhost:3002
#   API=http://example.com ./scripts/seed-demo.sh
#
# Safe to re-run — registration failures (already registered) are skipped.
# Requires: curl, jq

set -euo pipefail

API="${API:-http://localhost:3002}"
MEAL_TIME="2026-07-12T12:30:00.000Z"

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
ok()   { echo -e "  ${GREEN}✓${RESET} $*"; }
step() { echo -e "\n${CYAN}${BOLD}▶ $*${RESET}"; }
fail() { echo -e "  ${RED}✗ $*${RESET}"; exit 1; }

command -v jq >/dev/null 2>&1 || fail "jq is required (brew install jq)"

post() {
  local path="$1" data="$2" token="${3:-}"
  if [[ -n "$token" ]]; then
    curl -sf -X POST "$API$path" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $token" \
      --data-raw "$data"
  else
    curl -sf -X POST "$API$path" \
      -H "Content-Type: application/json" \
      --data-raw "$data"
  fi
}

# ── 1. Register users (skip if already registered) ───────────────────────────
step "Registering users"

PASS="demo-pass-123"

post /auth/register '{"email":"alice@eastonhub.test","password":"demo-pass-123","displayName":"Alice Chen"}' >/dev/null \
  && ok "Alice Chen registered" || ok "Alice Chen already exists, skipping"
post /auth/register '{"email":"bob@eastonhub.test","password":"demo-pass-123","displayName":"Bob Osei"}' >/dev/null \
  && ok "Bob Osei registered" || ok "Bob Osei already exists, skipping"
post /auth/register '{"email":"carmen@eastonhub.test","password":"demo-pass-123","displayName":"Carmen Rivera"}' >/dev/null \
  && ok "Carmen Rivera registered" || ok "Carmen Rivera already exists, skipping"

# ── 2. Login ──────────────────────────────────────────────────────────────────
step "Logging in"

TOK_A=$(post /auth/login '{"email":"alice@eastonhub.test","password":"demo-pass-123"}' | jq -r '.token')
TOK_B=$(post /auth/login '{"email":"bob@eastonhub.test","password":"demo-pass-123"}' | jq -r '.token')
TOK_C=$(post /auth/login '{"email":"carmen@eastonhub.test","password":"demo-pass-123"}' | jq -r '.token')

ALICE_ID=$(curl -sf "$API/me" -H "Authorization: Bearer $TOK_A" | jq -r '.id')
BOB_ID=$(curl -sf "$API/me"   -H "Authorization: Bearer $TOK_B" | jq -r '.id')
CARMEN_ID=$(curl -sf "$API/me" -H "Authorization: Bearer $TOK_C" | jq -r '.id')

ok "Alice  ${ALICE_ID}"
ok "Bob    ${BOB_ID}"
ok "Carmen ${CARMEN_ID}"

# ── 3. Create community ───────────────────────────────────────────────────────
step "Creating community: Easton Energy Hub"

GROUP=$(post /groups \
  '{"name":"Easton Energy Hub","description":"Members of the Easton Energy Hub co-working space share skills, tools, and produce — mostly for free or in CRC.","joinPolicy":"PUBLIC"}' \
  "$TOK_A")
GROUP_ID=$(echo "$GROUP" | jq -r '.id')
ok "Group ID: $GROUP_ID"

# ── 4. Bob and Carmen join the community ──────────────────────────────────────
step "Bob and Carmen join the community"

post "/groups/$GROUP_ID/join" '{}' "$TOK_B" >/dev/null && ok "Bob joined"
post "/groups/$GROUP_ID/join" '{}' "$TOK_C" >/dev/null && ok "Carmen joined"

# ── 5. Create listings ────────────────────────────────────────────────────────
step "Alice's listings"

L_A1=$(post /listings \
  '{"itemType":"wantoff.other","title":"Hot desk for the day","description":"Spare a desk at the Hub. Drop in, plug in, get things done. Message first to check availability.","fees":[{"scope":"user","kind":"donation","required":false}],"currencies":[]}' \
  "$TOK_A")
L_A1_ID=$(echo "$L_A1" | jq -r '.id'); ok "Hot desk (free) -> $L_A1_ID"

L_A2=$(post /listings \
  '{"itemType":"wantoff.other","title":"Python coaching session","description":"1hr pairing session on anything Python. Beginner to intermediate. Data wrangling, automation, web scraping.","fees":[{"scope":"user","kind":"currency","currency":"CRC","amount":5,"required":true}],"currencies":[{"currency":"CRC"}]}' \
  "$TOK_A")
L_A2_ID=$(echo "$L_A2" | jq -r '.id'); ok "Python coaching (5 CRC) -> $L_A2_ID"

L_A3=$(post /listings \
  "{\"itemType\":\"mealmate.meal\",\"title\":\"Sri Lankan home lunch\",\"description\":\"Dhal, rice, pol sambol, papadum. Every other Friday at the Hub kitchen table.\",\"mealTime\":\"$MEAL_TIME\",\"capacity\":4,\"creditFeeAmount\":0,\"dietaryInfo\":\"vegan-friendly\"}" \
  "$TOK_A")
L_A3_ID=$(echo "$L_A3" | jq -r '.id'); ok "Sri Lankan lunch (mealmate, free) -> $L_A3_ID"

step "Bob's listings"

L_B1=$(post /listings \
  '{"itemType":"wantoff.other","title":"Bicycle tune-up","description":"Brakes, gears, chain clean, tyre pressure. Bring your bike to the Hub yard on a Thursday.","fees":[{"scope":"user","kind":"donation","required":false}],"currencies":[]}' \
  "$TOK_B")
L_B1_ID=$(echo "$L_B1" | jq -r '.id'); ok "Bicycle tune-up (free) -> $L_B1_ID"

L_B2=$(post /listings \
  '{"itemType":"wantoff.other","title":"Brand identity design","description":"Logo, palette, one-pager. Good fit for co-ops, community projects, or side projects needing a visual identity.","fees":[{"scope":"user","kind":"currency","currency":"CRC","amount":10,"required":true}],"currencies":[{"currency":"CRC"}]}' \
  "$TOK_B")
L_B2_ID=$(echo "$L_B2" | jq -r '.id'); ok "Brand identity design (10 CRC) -> $L_B2_ID"

L_B3=$(post /listings \
  '{"itemType":"wantoff.other","title":"Fresh sourdough loaf","description":"Bake day is Sunday. Order by Friday. White or seeded. Just say the word.","fees":[{"scope":"user","kind":"donation","required":false}],"currencies":[]}' \
  "$TOK_B")
L_B3_ID=$(echo "$L_B3" | jq -r '.id'); ok "Sourdough loaf (free) -> $L_B3_ID"

step "Carmen's listings"

L_C1=$(post /listings \
  '{"itemType":"wantoff.other","title":"Spanish conversation hour","description":"Practice your Spanish in a relaxed setting. All levels. Grammar questions welcome.","fees":[{"scope":"user","kind":"donation","required":false}],"currencies":[]}' \
  "$TOK_C")
L_C1_ID=$(echo "$L_C1" | jq -r '.id'); ok "Spanish conversation (free) -> $L_C1_ID"

L_C2=$(post /listings \
  '{"itemType":"wantoff.other","title":"Yoga class (1hr)","description":"Hatha-based, suitable for all levels. Mat provided. Hub common room, Tuesday mornings.","fees":[{"scope":"user","kind":"currency","currency":"CRC","amount":3,"required":true}],"currencies":[{"currency":"CRC"}]}' \
  "$TOK_C")
L_C2_ID=$(echo "$L_C2" | jq -r '.id'); ok "Yoga class (3 CRC) -> $L_C2_ID"

L_C3=$(post /listings \
  '{"itemType":"wantoff.other","title":"Kombucha SCOBY to share","description":"Have a healthy SCOBY ready to go. Bring a jar and I will get you started.","fees":[{"scope":"user","kind":"donation","required":false}],"currencies":[]}' \
  "$TOK_C")
L_C3_ID=$(echo "$L_C3" | jq -r '.id'); ok "Kombucha SCOBY (free, NOT in community) -> $L_C3_ID"

# ── 6. Add listings to community ──────────────────────────────────────────────
# mealmate.meal (L_A3) and Carmen's SCOBY (L_C3) intentionally excluded.
step "Adding listings to community"

for entry in "$L_A1_ID:$TOK_A" "$L_A2_ID:$TOK_A" "$L_B1_ID:$TOK_B" "$L_B2_ID:$TOK_B" "$L_B3_ID:$TOK_B" "$L_C1_ID:$TOK_C" "$L_C2_ID:$TOK_C"; do
  LID="${entry%%:*}"
  TOK="${entry##*:}"
  post "/listings/$LID/groups/$GROUP_ID" '{}' "$TOK" >/dev/null
  ok "Added $LID"
done

# ── 7. Exchanges — Bob and Carmen join Alice's mealmate lunch ─────────────────
step "Exchanges: Bob and Carmen join Alice's lunch"

EX_B=$(post "/listings/$L_A3_ID/join" '{}' "$TOK_B")
EX_B_ID=$(echo "$EX_B" | jq -r '.exchangeId'); ok "Bob joined -> $EX_B_ID"

EX_C=$(post "/listings/$L_A3_ID/join" '{}' "$TOK_C")
EX_C_ID=$(echo "$EX_C" | jq -r '.exchangeId'); ok "Carmen joined -> $EX_C_ID"

# ── 8. Messages ───────────────────────────────────────────────────────────────
step "Messages"

post "/exchanges/$EX_B_ID/messages"   '{"body":"Looking forward to it! Any dietary things I should know about?"}' "$TOK_B" >/dev/null
post "/exchanges/$EX_B_ID/messages"   '{"body":"All vegan-friendly. See you Friday!"}' "$TOK_A" >/dev/null
ok "Bob <-> Alice"

post "/exchanges/$EX_C_ID/messages"   '{"body":"Can I bring anything?"}' "$TOK_C" >/dev/null
post "/exchanges/$EX_C_ID/messages"   '{"body":"Just yourself. Maybe some fresh herbs if you have any!"}' "$TOK_A" >/dev/null
ok "Carmen <-> Alice"

# ── 9. Reviews ────────────────────────────────────────────────────────────────
step "Reviews"

post "/exchanges/$EX_B_ID/reviews" \
  "{\"revieweeId\":\"$ALICE_ID\",\"score\":90,\"tags\":[\"warm\",\"generous\"],\"comment\":\"Incredible food and a lovely atmosphere. Will definitely be back.\"}" \
  "$TOK_B" >/dev/null
ok "Bob reviewed Alice (90)"

post "/exchanges/$EX_B_ID/reviews" \
  "{\"revieweeId\":\"$BOB_ID\",\"score\":85,\"tags\":[\"reliable\",\"good-chat\"],\"comment\":\"Great guest, showed up on time and was great company.\"}" \
  "$TOK_A" >/dev/null
ok "Alice reviewed Bob (85)"

post "/exchanges/$EX_C_ID/reviews" \
  "{\"revieweeId\":\"$ALICE_ID\",\"score\":95,\"tags\":[\"generous\",\"skilled-cook\"],\"comment\":\"One of the best meals I have had. The pol sambol was outstanding.\"}" \
  "$TOK_C" >/dev/null
ok "Carmen reviewed Alice (95)"

# ── Summary ───────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}${GREEN}Done.${RESET}"
echo -e "\nCommunity: ${CYAN}http://localhost:3001/groups/$GROUP_ID${RESET}"
echo ""
echo "Log in as any of:"
echo "  alice@eastonhub.test  / demo-pass-123  (community owner)"
echo "  bob@eastonhub.test    / demo-pass-123"
echo "  carmen@eastonhub.test / demo-pass-123"
