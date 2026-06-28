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

# Create a listing only if the actor doesn't already have one with that title.
post_listing() {
  local data="$1" token="$2" label="$3"
  local title
  title=$(echo "$data" | jq -r '.title')
  local existing
  existing=$(curl -sf "$API/listings?mine=true" -H "Authorization: Bearer $token" | jq -r --arg t "$title" '.[] | select(.attributes.title==$t) | .id' | head -1)
  if [[ -n "$existing" ]]; then
    ok "$label already exists -> $existing"
    echo "{\"id\":\"$existing\"}"
  else
    local result
    result=$(post /listings "$data" "$token")
    ok "$label -> $(echo "$result" | jq -r '.id')"
    echo "$result"
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
  "$TOK_A" || true)
GROUP_ID=$(echo "$GROUP" | jq -r '.id // empty')
if [[ -z "$GROUP_ID" ]]; then
  GROUP_ID=$(curl -sf "$API/groups" -H "Authorization: Bearer $TOK_A" | jq -r '.[] | select(.slug=="easton-energy-hub") | .id')
  ok "Group already exists, ID: $GROUP_ID"
else
  ok "Group ID: $GROUP_ID"
fi

# ── 4. Bob and Carmen join the community ──────────────────────────────────────
step "Bob and Carmen join the community"

post "/groups/$GROUP_ID/join" '{}' "$TOK_B" >/dev/null && ok "Bob joined" || ok "Bob already a member"
post "/groups/$GROUP_ID/join" '{}' "$TOK_C" >/dev/null && ok "Carmen joined" || ok "Carmen already a member"

# ── 5. Create listings ────────────────────────────────────────────────────────
step "Alice's listings"

L_A1=$(post_listing \
  '{"itemType":"wantoff.other","title":"Hot desk for the day","description":"Spare a desk at the Hub. Drop in, plug in, get things done. Message first to check availability.","attributes":{"photos":["https://picsum.photos/seed/desk1/800/500"]},"fees":[{"scope":"user","kind":"donation","required":false}],"currencies":[]}' \
  "$TOK_A")
L_A1_ID=$(echo "$L_A1" | jq -r '.id'); ok "Hot desk (free) -> $L_A1_ID"

L_A2=$(post_listing \
  '{"itemType":"wantoff.other","title":"Python coaching session","description":"1hr pairing session on anything Python. Beginner to intermediate. Data wrangling, automation, web scraping.","attributes":{"photos":["https://picsum.photos/seed/code2/800/500"]},"fees":[{"scope":"user","kind":"currency","currency":"CRC","amount":5,"required":true}],"currencies":[{"currency":"CRC"}]}' \
  "$TOK_A")
L_A2_ID=$(echo "$L_A2" | jq -r '.id'); ok "Python coaching (5 CRC) -> $L_A2_ID"

L_A3=$(post_listing \
  "{\"itemType\":\"mealmate.meal\",\"title\":\"Sri Lankan home lunch\",\"description\":\"Dhal, rice, pol sambol, papadum. Every other Friday at the Hub kitchen table.\",\"mealTime\":\"$MEAL_TIME\",\"capacity\":4,\"creditFeeAmount\":0,\"dietaryInfo\":\"vegan-friendly\"}" \
  "$TOK_A")
L_A3_ID=$(echo "$L_A3" | jq -r '.id'); ok "Sri Lankan lunch (mealmate, free) -> $L_A3_ID"

step "Bob's listings"

L_B1=$(post_listing \
  '{"itemType":"wantoff.other","title":"Bicycle tune-up","description":"Brakes, gears, chain clean, tyre pressure. Bring your bike to the Hub yard on a Thursday.","attributes":{"photos":["https://picsum.photos/seed/bike4/800/500"]},"fees":[{"scope":"user","kind":"donation","required":false}],"currencies":[]}' \
  "$TOK_B")
L_B1_ID=$(echo "$L_B1" | jq -r '.id'); ok "Bicycle tune-up (free) -> $L_B1_ID"

L_B2=$(post_listing \
  '{"itemType":"wantoff.other","title":"Brand identity design","description":"Logo, palette, one-pager. Good fit for co-ops, community projects, or side projects needing a visual identity.","attributes":{"photos":["https://picsum.photos/seed/design5/800/500"]},"fees":[{"scope":"user","kind":"currency","currency":"CRC","amount":10,"required":true}],"currencies":[{"currency":"CRC"}]}' \
  "$TOK_B")
L_B2_ID=$(echo "$L_B2" | jq -r '.id'); ok "Brand identity design (10 CRC) -> $L_B2_ID"

L_B3=$(post_listing \
  '{"itemType":"wantoff.other","title":"Fresh sourdough loaf","description":"Bake day is Sunday. Order by Friday. White or seeded. Just say the word.","attributes":{"photos":["https://picsum.photos/seed/bread6/800/500"]},"fees":[{"scope":"user","kind":"donation","required":false}],"currencies":[]}' \
  "$TOK_B")
L_B3_ID=$(echo "$L_B3" | jq -r '.id'); ok "Sourdough loaf (free) -> $L_B3_ID"

step "Carmen's listings"

L_C1=$(post_listing \
  '{"itemType":"wantoff.other","title":"Spanish conversation hour","description":"Practice your Spanish in a relaxed setting. All levels. Grammar questions welcome.","attributes":{"photos":["https://picsum.photos/seed/lang7/800/500"]},"fees":[{"scope":"user","kind":"donation","required":false}],"currencies":[]}' \
  "$TOK_C")
L_C1_ID=$(echo "$L_C1" | jq -r '.id'); ok "Spanish conversation (free) -> $L_C1_ID"

L_C2=$(post_listing \
  '{"itemType":"wantoff.other","title":"Yoga class (1hr)","description":"Hatha-based, suitable for all levels. Mat provided. Hub common room, Tuesday mornings.","attributes":{"photos":["https://picsum.photos/seed/yoga8/800/500"]},"fees":[{"scope":"user","kind":"currency","currency":"CRC","amount":3,"required":true}],"currencies":[{"currency":"CRC"}]}' \
  "$TOK_C")
L_C2_ID=$(echo "$L_C2" | jq -r '.id'); ok "Yoga class (3 CRC) -> $L_C2_ID"

L_C3=$(post_listing \
  '{"itemType":"wantoff.other","title":"Kombucha SCOBY to share","description":"Have a healthy SCOBY ready to go. Bring a jar and I will get you started.","attributes":{"photos":["https://picsum.photos/seed/scoby9/800/500"]},"fees":[{"scope":"user","kind":"donation","required":false}],"currencies":[]}' \
  "$TOK_C")
L_C3_ID=$(echo "$L_C3" | jq -r '.id'); ok "Kombucha SCOBY (free, NOT in community) -> $L_C3_ID"

step "Items listings"

L_ITEMS1=$(post_listing \
  '{"itemType":"wantoff.items","title":"Power drill to lend","description":"Bosch 18V cordless drill, two batteries. Borrow for a weekend, just return it clean.","attributes":{"photos":["https://picsum.photos/seed/drill42/800/500"]},"fees":[{"scope":"user","kind":"donation","required":false}],"currencies":[]}' \
  "$TOK_B")
L_ITEMS1_ID=$(echo "$L_ITEMS1" | jq -r '.id'); ok "Power drill (lend, free) -> $L_ITEMS1_ID"

L_ITEMS2=$(post_listing \
  '{"itemType":"wantoff.items","title":"Box of books to rehome","description":"Mix of fiction and non-fiction — take one, take all. Mainly literary fiction and popular science.","attributes":{"photos":["https://picsum.photos/seed/books19/800/500"]},"fees":[{"scope":"user","kind":"donation","required":false}],"currencies":[]}' \
  "$TOK_C")
L_ITEMS2_ID=$(echo "$L_ITEMS2" | jq -r '.id'); ok "Box of books (free) -> $L_ITEMS2_ID"

step "Skills listings"

L_SKILLS1=$(post_listing \
  '{"itemType":"wantoff.skills","title":"Web design session","description":"1hr session on layout, typography, or basic CSS. Good for small projects or freelancers getting started.","attributes":{"duration":60,"photos":["https://picsum.photos/seed/webdes10/800/500"]},"fees":[{"scope":"user","kind":"currency","currency":"CRC","amount":4,"required":true}],"currencies":[{"currency":"CRC"}]}' \
  "$TOK_A")
L_SKILLS1_ID=$(echo "$L_SKILLS1" | jq -r '.id'); ok "Web design session (60min, 4 CRC) -> $L_SKILLS1_ID"

L_SKILLS2=$(post_listing \
  '{"itemType":"wantoff.skills","title":"Bicycle repair lesson","description":"Learn to fix a puncture, adjust brakes, and tune gears yourself. Bring your bike to the Hub yard.","attributes":{"duration":90,"photos":["https://picsum.photos/seed/bicycle77/800/500"]},"fees":[{"scope":"user","kind":"donation","required":false}],"currencies":[]}' \
  "$TOK_B")
L_SKILLS2_ID=$(echo "$L_SKILLS2" | jq -r '.id'); ok "Bicycle repair lesson (90min, free) -> $L_SKILLS2_ID"

L_SKILLS3=$(post_listing \
  '{"itemType":"wantoff.skills","title":"Spanish conversation hour","description":"Practice your Spanish in a relaxed setting. All levels welcome, grammar questions fine.","attributes":{"duration":60,"photos":["https://picsum.photos/seed/span11/800/500"]},"fees":[{"scope":"user","kind":"donation","required":false}],"currencies":[]}' \
  "$TOK_C")
L_SKILLS3_ID=$(echo "$L_SKILLS3" | jq -r '.id'); ok "Spanish conversation (60min, free) -> $L_SKILLS3_ID"

L_SKILLS4=$(post_listing \
  '{"itemType":"wantoff.skills","title":"Python coaching","description":"1hr pairing session on anything Python — data wrangling, automation, web scraping. Beginner to intermediate.","attributes":{"duration":60,"photos":["https://picsum.photos/seed/pyth12/800/500"]},"fees":[{"scope":"user","kind":"currency","currency":"CRC","amount":5,"required":true}],"currencies":[{"currency":"CRC"}]}' \
  "$TOK_A")
L_SKILLS4_ID=$(echo "$L_SKILLS4" | jq -r '.id'); ok "Python coaching (60min, 5 CRC) -> $L_SKILLS4_ID"

step "Digital listings"

L_DIGITAL1=$(post_listing \
  '{"itemType":"wantoff.digital","title":"Spare Figma seat","description":"Have a spare seat on a team plan until end of year. First come first served.","attributes":{"photos":["https://picsum.photos/seed/figma13/800/500"]},"fees":[{"scope":"user","kind":"donation","required":false}],"currencies":[]}' \
  "$TOK_A")
L_DIGITAL1_ID=$(echo "$L_DIGITAL1" | jq -r '.id'); ok "Spare Figma seat (free) -> $L_DIGITAL1_ID"

L_DIGITAL2=$(post_listing \
  '{"itemType":"wantoff.digital","title":"Notion template pack","description":"Six templates for project tracking, meeting notes, and personal journaling. Download link on exchange.","attributes":{"photos":["https://picsum.photos/seed/notion14/800/500"]},"fees":[{"scope":"user","kind":"currency","currency":"CRC","amount":2,"required":true}],"currencies":[{"currency":"CRC"}]}' \
  "$TOK_C")
L_DIGITAL2_ID=$(echo "$L_DIGITAL2" | jq -r '.id'); ok "Notion template pack (2 CRC) -> $L_DIGITAL2_ID"

# ── 6. Add listings to community ──────────────────────────────────────────────
# mealmate.meal (L_A3) and Carmen's SCOBY (L_C3) intentionally excluded.
step "Adding listings to community"

for entry in "$L_A1_ID:$TOK_A" "$L_A2_ID:$TOK_A" "$L_B1_ID:$TOK_B" "$L_B2_ID:$TOK_B" "$L_B3_ID:$TOK_B" "$L_C1_ID:$TOK_C" "$L_C2_ID:$TOK_C" "$L_ITEMS1_ID:$TOK_B" "$L_ITEMS2_ID:$TOK_C" "$L_SKILLS1_ID:$TOK_A" "$L_SKILLS2_ID:$TOK_B" "$L_SKILLS3_ID:$TOK_C" "$L_SKILLS4_ID:$TOK_A" "$L_DIGITAL1_ID:$TOK_A" "$L_DIGITAL2_ID:$TOK_C"; do
  LID="${entry%%:*}"
  TOK="${entry##*:}"
  post "/listings/$LID/groups/$GROUP_ID" '{}' "$TOK" >/dev/null 2>&1 && ok "Added $LID" || ok "Already in community: $LID"
done

# ── 7. Exchanges — Bob and Carmen join Alice's mealmate lunch ─────────────────
step "Exchanges: Bob and Carmen join Alice's lunch"

join_meal() {
  local listing_id="$1" token="$2" label="$3"
  local result ex_id
  result=$(post "/listings/$listing_id/join" '{}' "$token" 2>/dev/null || true)
  ex_id=$(echo "$result" | jq -r '.exchangeId // empty' 2>/dev/null || true)
  if [[ -z "$ex_id" ]]; then
    ex_id=$(curl -sf "$API/exchanges" -H "Authorization: Bearer $token" \
      | jq -r --arg lid "$listing_id" '.[] | select(.listing.id==$lid) | .id' | head -1)
    ok "$label already joined -> $ex_id"
  else
    ok "$label joined -> $ex_id"
  fi
  echo "{\"exchangeId\":\"$ex_id\"}"
}

EX_B=$(join_meal "$L_A3_ID" "$TOK_B" "Bob")
EX_B_ID=$(echo "$EX_B" | jq -r '.exchangeId')

EX_C=$(join_meal "$L_A3_ID" "$TOK_C" "Carmen")
EX_C_ID=$(echo "$EX_C" | jq -r '.exchangeId')

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
  "$TOK_B" >/dev/null 2>&1 && ok "Bob reviewed Alice (90)" || ok "Bob already reviewed Alice"

post "/exchanges/$EX_B_ID/reviews" \
  "{\"revieweeId\":\"$BOB_ID\",\"score\":85,\"tags\":[\"reliable\",\"good-chat\"],\"comment\":\"Great guest, showed up on time and was great company.\"}" \
  "$TOK_A" >/dev/null 2>&1 && ok "Alice reviewed Bob (85)" || ok "Alice already reviewed Bob"

post "/exchanges/$EX_C_ID/reviews" \
  "{\"revieweeId\":\"$ALICE_ID\",\"score\":95,\"tags\":[\"generous\",\"skilled-cook\"],\"comment\":\"One of the best meals I have had. The pol sambol was outstanding.\"}" \
  "$TOK_C" >/dev/null 2>&1 && ok "Carmen reviewed Alice (95)" || ok "Carmen already reviewed Alice"

# ── Summary ───────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}${GREEN}Done.${RESET}"
echo -e "\nCommunity: ${CYAN}http://localhost:3001/groups/$GROUP_ID${RESET}"
echo ""
echo "Log in as any of:"
echo "  alice@eastonhub.test  / demo-pass-123  (community owner)"
echo "  bob@eastonhub.test    / demo-pass-123"
echo "  carmen@eastonhub.test / demo-pass-123"
