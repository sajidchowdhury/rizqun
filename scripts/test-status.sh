#!/usr/bin/env bash
# One-shot status-update smoke test.
# Run with: bash scripts/test-status.sh

cd /home/z/my-project/rizqun
unset DATABASE_URL

pkill -f "tsx src/server" 2>/dev/null
sleep 1

echo "Starting server..."
npx tsx src/server.ts > /tmp/rizqun.log 2>&1 &
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
  cat /tmp/rizqun.log
  exit 1
fi

CJ=/tmp/rizqun-cookies.txt
rm -f $CJ /tmp/r.json

pp() { python3 -m json.tool 2>/dev/null || cat; }
PSQL=/home/z/.local/pg-extract/client/usr/lib/postgresql/17/bin/psql

echo ""
echo "═════════════════════════════════════════════════════════"
echo "  Rizqun — Status Update smoke test"
echo "═════════════════════════════════════════════════════════"

# ─── Bootstrap ─────────────────────────────────────────────────
echo ""
echo "── Setup: login as admin ────────────────────────────────"
ADMIN_LOGIN=$(curl -sS --max-time 5 -c $CJ -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@rizqun.com","password":"ChangeMeInProduction123!"}')
ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)
echo "   ✓ Admin token acquired"

# Create vendor + product
echo ""
echo "── Setup: create vendor + product ───────────────────────"
VENDOR=$(curl -sS --max-time 5 -X POST http://localhost:3000/vendors \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Status Test Vendor","phone":"01733333333","category":"grocery"}')
VENDOR_ID=$(echo "$VENDOR" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['vendor']['id'])" 2>/dev/null)
GROCERY_ID=1
P1=$(curl -sS --max-time 5 -X POST http://localhost:3000/products \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Test Prod\",\"price\":50.0,\"categoryId\":$GROCERY_ID,\"vendorId\":$VENDOR_ID}")
P1_ID=$(echo "$P1" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['product']['id'])" 2>/dev/null)
echo "   ✓ Vendor=$VENDOR_ID Product=$P1_ID"

# Create an operator (for scope tests)
echo ""
echo "── Setup: create operator ───────────────────────────────"
curl -sS --max-time 5 -X POST http://localhost:3000/auth/register \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Op","email":"op-status@rizqun.com","phone":"01711111111","password":"Password123","role":"user","categoryAccess":["all"]}' > /dev/null
OP_LOGIN=$(curl -sS --max-time 5 -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"op-status@rizqun.com","password":"Password123"}')
OP_TOKEN=$(echo "$OP_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)
echo "   ✓ Operator token acquired"

# Helper: create a fresh pending order (returns the id)
create_order() {
  local token=$1
  local name=$2
  curl -sS --max-time 5 -X POST http://localhost:3000/orders \
    -H "Authorization: Bearer $token" \
    -H 'Content-Type: application/json' \
    -d "{\"customerName\":\"$name\",\"customerPhone\":\"01712345678\",\"items\":[{\"productId\":$P1_ID,\"qty\":1}]}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['order']['id'])"
}

# ─── 1. PATCH /orders/:id/status without token → expect 401 ────
echo ""
echo "── 1. PATCH without token → expect 401 ──────────────────"
O1_ID=$(create_order "$ADMIN_TOKEN" "Test 1")
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X PATCH "http://localhost:3000/orders/$O1_ID/status" \
  -H 'Content-Type: application/json' \
  -d '{"status":"waiting_vendor"}'
cat /tmp/r.json | pp

# ─── 2. Valid full lifecycle: pending → waiting_vendor → preparing → picked_up → delivered
echo ""
echo "── 2. Full valid lifecycle (5 transitions) ─────────────"
O2_ID=$(create_order "$ADMIN_TOKEN" "Lifecycle Test")
echo "   Order id: $O2_ID — status=pending"

for s in waiting_vendor preparing picked_up delivered; do
  curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$O2_ID/status" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H 'Content-Type: application/json' \
    -d "{\"status\":\"$s\",\"note\":\"Transition to $s\"}" > /dev/null
  CURR=$(curl -sS --max-time 5 "http://localhost:3000/orders/$O2_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['order']['status'])")
  echo "   → status=$CURR"
done

# Verify all 5 status_log entries exist (initial pending + 4 transitions)
LOG_COUNT=$(PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db -tAc "SELECT count(*) FROM status_log WHERE order_id=$O2_ID;")
echo "   status_log rows: $LOG_COUNT (expected 5)"
echo "   status_log entries:"
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db -c "SELECT from_status, to_status, note FROM status_log WHERE order_id=$O2_ID ORDER BY id;" 2>&1 | head -10

# Verify deliveredAt is set
DELIVERED_AT=$(curl -sS --max-time 5 "http://localhost:3000/orders/$O2_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['order']['deliveredAt'])")
echo "   deliveredAt=$DELIVERED_AT (should be non-null)"

# ─── 3. Try to transition out of 'delivered' (terminal) → expect 409
echo ""
echo "── 3. Try transition from delivered → expect 409 ───────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X PATCH "http://localhost:3000/orders/$O2_ID/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"pending"}'
cat /tmp/r.json | pp

# ─── 4. Try invalid jump: pending → picked_up → expect 409 ────
echo ""
echo "── 4. Try pending → picked_up (invalid jump) → 409 ─────"
O3_ID=$(create_order "$ADMIN_TOKEN" "Jump Test")
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X PATCH "http://localhost:3000/orders/$O3_ID/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"picked_up"}'
cat /tmp/r.json | pp

# ─── 5. Idempotent: same status → 200 (no-op) ─────────────────
echo ""
echo "── 5. Same status (idempotent) → expect 200 ───────────"
O4_ID=$(create_order "$ADMIN_TOKEN" "Idempotent Test")
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X PATCH "http://localhost:3000/orders/$O4_ID/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"pending"}'
cat /tmp/r.json | pp

# ─── 6. Cancel from pending → expect 200 ──────────────────────
echo ""
echo "── 6. Cancel from pending → expect 200 ────────────────"
O5_ID=$(create_order "$ADMIN_TOKEN" "Cancel Test")
curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$O5_ID/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"cancelled","note":"Customer cancelled"}' | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'  status={d[\"data\"][\"order\"][\"status\"]} (expected cancelled)')"

# ─── 7. Cancel from delivered → expect 409 (terminal) ────────
echo ""
echo "── 7. Cancel from delivered → expect 409 ──────────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X PATCH "http://localhost:3000/orders/$O2_ID/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"cancelled"}'
cat /tmp/r.json | pp

# ─── 8. Invalid status value → expect 400 ─────────────────────
echo ""
echo "── 8. Invalid status 'shipped' → expect 400 ───────────"
O6_ID=$(create_order "$ADMIN_TOKEN" "Invalid Status Test")
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X PATCH "http://localhost:3000/orders/$O6_ID/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"shipped"}'
cat /tmp/r.json | pp

# ─── 9. Non-existent order → expect 404 ───────────────────────
echo ""
echo "── 9. PATCH /orders/9999/status → expect 404 ─────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X PATCH "http://localhost:3000/orders/9999/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"waiting_vendor"}'
cat /tmp/r.json | pp

# ─── 10. Operator updates their own order → expect 200 ────────
echo ""
echo "── 10. Operator updates own order → expect 200 ────────"
O7_ID=$(create_order "$OP_TOKEN" "Operator Own Order")
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X PATCH "http://localhost:3000/orders/$O7_ID/status" \
  -H "Authorization: Bearer $OP_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"waiting_vendor"}'
cat /tmp/r.json | pp

# ─── 11. Operator tries to update someone else's order → 404 ─
echo ""
echo "── 11. Op updates other's order → expect 404 ──────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X PATCH "http://localhost:3000/orders/$O1_ID/status" \
  -H "Authorization: Bearer $OP_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"waiting_vendor"}'
cat /tmp/r.json | pp

# ─── 12. Note saved in status_log ─────────────────────────────
echo ""
echo "── 12. Verify note saved in status_log ────────────────"
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db -c "SELECT from_status, to_status, note FROM status_log WHERE order_id=$O2_ID AND note IS NOT NULL ORDER BY id;" 2>&1 | head -10

# ─── 13. Verify order is locked after picked_up ────────────────
# (Forward + backward both blocked)
echo ""
echo "── 13. After picked_up, only 'delivered' is allowed ───"
O8_ID=$(create_order "$ADMIN_TOKEN" "Lock Test")
curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$O8_ID/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"waiting_vendor"}' > /dev/null
curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$O8_ID/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"preparing"}' > /dev/null
curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$O8_ID/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"picked_up"}' > /dev/null
echo "   Reached picked_up. Now try going back to preparing..."
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X PATCH "http://localhost:3000/orders/$O8_ID/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"preparing"}'
cat /tmp/r.json | pp

echo ""
echo "═════════════════════════════════════════════════════════"
echo "  Done."
echo "═════════════════════════════════════════════════════════"

# Cleanup
echo ""
echo "Cleaning up test data..."
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db \
  -c "DELETE FROM status_log; DELETE FROM order_items; DELETE FROM orders; DELETE FROM products; DELETE FROM vendors; DELETE FROM users WHERE email='op-status@rizqun.com';" > /dev/null 2>&1
echo "   ✓ Cleaned up"

kill $SRV_PID 2>/dev/null
wait 2>/dev/null
echo "Done."
