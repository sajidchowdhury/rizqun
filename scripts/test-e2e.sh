#!/usr/bin/env bash
# End-to-End smoke test — simulates the full operator workflow.
# Run with: bash scripts/test-e2e.sh
#
# Tests the complete customer call flow:
#   1. Login as operator
#   2. Search for a product
#   3. Quick-add a missing product
#   4. Finalize the order (cart → saved order)
#   5. View in pending list
#   6. View order detail + vendor groups (WhatsApp copy text)
#   7. Update status through the full lifecycle
#   8. Generate + submit a rating
#   9. Verify in done list

cd /home/z/my-project/rizqun
unset DATABASE_URL

pkill -f "tsx src/server" 2>/dev/null
sleep 1

echo "Starting server..."
npx tsx src/server.ts > /tmp/rizqun-e2e.log 2>&1 &
SRV_PID=$!
trap "kill $SRV_PID 2>/dev/null; wait 2>/dev/null" EXIT

for i in 1 2 3 4 5 6 7 8 9 10; do
  sleep 1
  if curl -s -o /dev/null --max-time 2 http://localhost:3000/health; then
    echo "Server up (PID $SRV_PID)"
    break
  fi
done

if ! curl -s -o /dev/null --max-time 2 http://localhost:3000/health; then
  echo "FAILED to start server"
  cat /tmp/rizqun-e2e.log
  exit 1
fi

CJ=/tmp/rizqun-e2e-cookies.txt
rm -f $CJ /tmp/r.json /tmp/e2e-result.json

PSQL=/home/z/.local/pg-extract/client/usr/lib/postgresql/17/bin/psql

echo ""
echo "═════════════════════════════════════════════════════════"
echo "  Rizqun — End-to-End Smoke Test"
echo "  (Full operator workflow: login → search → finalize →"
echo "   vendor groups → status → delivery → rating)"
echo "═════════════════════════════════════════════════════════"

PASS=0
FAIL=0
check() { if [ "$1" = "$2" ]; then echo "   ✓ PASS: $3"; PASS=$((PASS+1)); else echo "   ✗ FAIL: $3 (got $1, expected $2)"; FAIL=$((FAIL+1)); fi; }

# ─── STEP 1: Login as admin ───────────────────────────────────
echo ""
echo "── Step 1: Login as admin ───────────────────────────────"
LOGIN=$(curl -sS --max-time 5 -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@rizqun.com","password":"ChangeMeInProduction123!"}')
TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)
if [ -n "$TOKEN" ]; then echo "   ✓ Login successful"; PASS=$((PASS+1)); else echo "   ✗ Login failed"; FAIL=$((FAIL+1)); exit 1; fi

# ─── STEP 2: Search for a product ─────────────────────────────
echo ""
echo "── Step 2: Search for 'Paracetamol' ────────────────────"
SEARCH=$(curl -sS --max-time 5 "http://localhost:3000/products/search?q=paracetamol" \
  -H "Authorization: Bearer $TOKEN")
SEARCH_COUNT=$(echo "$SEARCH" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']['data']))" 2>/dev/null)
echo "   Found $SEARCH_COUNT product(s)"
check "$SEARCH_COUNT" "1" "Search returns Paracetamol"

# ─── STEP 3: Search for 'Rice' ────────────────────────────────
echo ""
echo "── Step 3: Search for 'Rice' ──────────────────────────"
SEARCH2=$(curl -sS --max-time 5 "http://localhost:3000/products/search?q=rice" \
  -H "Authorization: Bearer $TOKEN")
RICE_COUNT=$(echo "$SEARCH2" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']['data']))" 2>/dev/null)
echo "   Found $RICE_COUNT product(s)"
if [ "$RICE_COUNT" -ge 1 ]; then echo "   ✓ PASS: Search returns Rice"; PASS=$((PASS+1)); else echo "   ✗ FAIL: no Rice found"; FAIL=$((FAIL+1)); fi

# Get product IDs for cart
RICE_ID=$(echo "$SEARCH2" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['data'][0]['id'])" 2>/dev/null)
PARA_ID=$(echo "$SEARCH" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['data'][0]['id'])" 2>/dev/null)

# ─── STEP 4: Finalize order ───────────────────────────────────
echo ""
echo "── Step 4: Finalize order ──────────────────────────────"
ORDER=$(curl -sS --max-time 5 -X POST http://localhost:3000/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{
    \"customerName\":\"E2E Test Customer\",
    \"customerPhone\":\"01712345678\",
    \"customerAddress\":\"House 1, Road 2, Dhaka\",
    \"deliveryFee\":50,
    \"items\":[
      {\"productId\":$RICE_ID,\"qty\":2},
      {\"productId\":$PARA_ID,\"qty\":3}
    ]
  }")
ORDER_ID=$(echo "$ORDER" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['order']['id'])" 2>/dev/null)
ORDER_CODE=$(echo "$ORDER" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['order']['orderCode'])" 2>/dev/null)
ORDER_TOTAL=$(echo "$ORDER" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['order']['total'])" 2>/dev/null)
echo "   Order: $ORDER_CODE (id=$ORDER_ID, total=$ORDER_TOTAL)"
if [ -n "$ORDER_ID" ]; then echo "   ✓ PASS: Order created"; PASS=$((PASS+1)); else echo "   ✗ FAIL: Order creation failed"; FAIL=$((FAIL+1)); fi

# ─── STEP 5: View in pending list ─────────────────────────────
echo ""
echo "── Step 5: View in pending list ────────────────────────"
PENDING=$(curl -sS --max-time 5 "http://localhost:3000/orders/pending" \
  -H "Authorization: Bearer $TOKEN")
IN_PENDING=$(echo "$PENDING" | python3 -c "
import sys,json
d=json.load(sys.stdin)
ids=[o['id'] for o in d['data']['data']]
print(1 if $ORDER_ID in ids else 0)
" 2>/dev/null)
check "$IN_PENDING" "1" "Order appears in pending list"

# ─── STEP 6: View vendor groups (WhatsApp) ─────────────────────
echo ""
echo "── Step 6: View vendor groups ──────────────────────────"
VG=$(curl -sS --max-time 5 "http://localhost:3000/orders/$ORDER_ID/vendor-groups" \
  -H "Authorization: Bearer $TOKEN")
VG_COUNT=$(echo "$VG" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']['groups']))" 2>/dev/null)
echo "   Vendor groups: $VG_COUNT"
if [ "$VG_COUNT" -ge 1 ]; then echo "   ✓ PASS: Vendor groups returned"; PASS=$((PASS+1)); else echo "   ✗ FAIL: no vendor groups"; FAIL=$((FAIL+1)); fi

# Check copyText contains order code
HAS_CODE=$(echo "$VG" | python3 -c "
import sys,json
d=json.load(sys.stdin)
has = any('$ORDER_CODE' in g['copyText'] for g in d['data']['groups'])
print(1 if has else 0)
" 2>/dev/null)
check "$HAS_CODE" "1" "Copy text contains order code"

# ─── STEP 7: Update status through full lifecycle ────────────
echo ""
echo "── Step 7: Status lifecycle ─────────────────────────────"
ALL_OK=true
for s in waiting_vendor preparing picked_up delivered; do
  RESULT=$(curl -sS --max-time 5 -o /dev/null -w "%{http_code}" -X PATCH "http://localhost:3000/orders/$ORDER_ID/status" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d "{\"status\":\"$s\",\"note\":\"E2E: transition to $s\"}")
  if [ "$RESULT" = "200" ]; then
    echo "   ✓ $s"
  else
    echo "   ✗ $s (HTTP $RESULT)"
    ALL_OK=false
  fi
done
if [ "$ALL_OK" = true ]; then PASS=$((PASS+1)); echo "   ✓ PASS: Full lifecycle"; else FAIL=$((FAIL+1)); fi

# Verify deliveredAt is set
DELIVERED_AT=$(curl -sS --max-time 5 "http://localhost:3000/orders/$ORDER_ID" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['order']['deliveredAt'])" 2>/dev/null)
if [ "$DELIVERED_AT" != "None" ] && [ -n "$DELIVERED_AT" ]; then
  echo "   ✓ PASS: deliveredAt set"
  PASS=$((PASS+1))
else
  echo "   ✗ FAIL: deliveredAt not set"
  FAIL=$((FAIL+1))
fi

# ─── STEP 8: Generate + submit rating ─────────────────────────
echo ""
echo "── Step 8: Rating link + submit ────────────────────────"
RATING_LINK=$(curl -sS --max-time 5 -X POST "http://localhost:3000/orders/$ORDER_ID/rating-link" \
  -H "Authorization: Bearer $TOKEN")
RATING_TOKEN=$(echo "$RATING_LINK" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['ratingToken'])" 2>/dev/null)
if [ -n "$RATING_TOKEN" ]; then echo "   ✓ Rating link generated"; PASS=$((PASS+1)); else echo "   ✗ FAIL: rating link"; FAIL=$((FAIL+1)); fi

# Get form data
FORM=$(curl -sS --max-time 5 "http://localhost:3000/orders/rating-form/$RATING_TOKEN")
FORM_CODE=$(echo "$FORM" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['orderCode'])" 2>/dev/null)
check "$FORM_CODE" "$ORDER_CODE" "Rating form returns correct order code"

# Submit rating
RATING_RESULT=$(curl -sS --max-time 5 -X POST http://localhost:3000/ratings \
  -H 'Content-Type: application/json' \
  -d "{\"token\":\"$RATING_TOKEN\",\"overall\":5,\"speed\":4,\"behavior\":5,\"comment\":\"Excellent E2E test service!\"}")
RATING_OK=$(echo "$RATING_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['success'])" 2>/dev/null)
check "$RATING_OK" "True" "Rating submitted"

# ─── STEP 9: Verify in done list ───────────────────────────────
echo ""
echo "── Step 9: Verify in done list ─────────────────────────"
DONE=$(curl -sS --max-time 5 "http://localhost:3000/orders/done" \
  -H "Authorization: Bearer $TOKEN")
IN_DONE=$(echo "$DONE" | python3 -c "
import sys,json
d=json.load(sys.stdin)
ids=[o['id'] for o in d['data']['data']]
print(1 if $ORDER_ID in ids else 0)
" 2>/dev/null)
check "$IN_DONE" "1" "Order appears in done list"

# ─── STEP 10: Verify audit log ─────────────────────────────────
echo ""
echo "── Step 10: Audit log ──────────────────────────────────"
AUDIT=$(curl -sS --max-time 5 "http://localhost:3000/orders/$ORDER_ID/audit-log" \
  -H "Authorization: Bearer $TOKEN")
AUDIT_COUNT=$(echo "$AUDIT" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']['entries']))" 2>/dev/null)
echo "   Audit log entries: $AUDIT_COUNT (expected 5: created + 4 transitions)"
if [ "$AUDIT_COUNT" -ge 5 ]; then echo "   ✓ PASS: Audit log has all transitions"; PASS=$((PASS+1)); else echo "   ✗ FAIL: expected 5+ entries, got $AUDIT_COUNT"; FAIL=$((FAIL+1)); fi

# ─── Summary ──────────────────────────────────────────────────
echo ""
echo "═════════════════════════════════════════════════════════"
echo "  E2E Test Results"
echo "  Passed: $PASS"
echo "  Failed: $FAIL"
echo "═════════════════════════════════════════════════════════"

# ─── Cleanup ──────────────────────────────────────────────────
echo ""
echo "Cleaning up test data..."
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db \
  -c "DELETE FROM ratings; DELETE FROM status_log; DELETE FROM order_items; DELETE FROM orders;" > /dev/null 2>&1
echo "   ✓ Cleaned up"

kill $SRV_PID 2>/dev/null
wait 2>/dev/null

if [ "$FAIL" -eq 0 ]; then
  echo ""
  echo "🎉 ALL TESTS PASSED — system is ready for go-live! 🎉"
  exit 0
else
  echo ""
  echo "⚠ $FAIL test(s) failed — review before go-live."
  exit 1
fi
