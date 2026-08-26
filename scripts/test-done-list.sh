#!/usr/bin/env bash
# One-shot done-list smoke test.
# Run with: bash scripts/test-done-list.sh

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
echo "  Rizqun — Done List smoke test"
echo "═════════════════════════════════════════════════════════"

# ─── Bootstrap ─────────────────────────────────────────────────
echo ""
echo "── Setup: login as admin ────────────────────────────────"
ADMIN_LOGIN=$(curl -sS --max-time 5 -c $CJ -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@rizqun.com","password":"ChangeMeInProduction123!"}')
ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)
echo "   ✓ Admin token acquired"

# Create operator
echo ""
echo "── Setup: create operator ───────────────────────────────"
curl -sS --max-time 5 -X POST http://localhost:3000/auth/register \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Op","email":"op-done@rizqun.com","phone":"01711111111","password":"Password123","role":"user","categoryAccess":["all"]}' > /dev/null
OP_LOGIN=$(curl -sS --max-time 5 -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"op-done@rizqun.com","password":"Password123"}')
OP_TOKEN=$(echo "$OP_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)
echo "   ✓ Operator token acquired"

# Create vendor + product
echo ""
echo "── Setup: create vendor + product ───────────────────────"
VENDOR=$(curl -sS --max-time 5 -X POST http://localhost:3000/vendors \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Done Test Vendor","phone":"01733333333","category":"grocery"}')
VENDOR_ID=$(echo "$VENDOR" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['vendor']['id'])" 2>/dev/null)
GROCERY_ID=1
P1=$(curl -sS --max-time 5 -X POST http://localhost:3000/products \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Done Product\",\"price\":100.0,\"categoryId\":$GROCERY_ID,\"vendorId\":$VENDOR_ID}")
P1_ID=$(echo "$P1" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['product']['id'])" 2>/dev/null)
echo "   ✓ Vendor=$VENDOR_ID Product=$P1_ID"

# Helper: create + deliver an order
create_delivered_order() {
  local name=$1
  local phone=$2
  local token=$3
  local oid=$(curl -sS --max-time 5 -X POST http://localhost:3000/orders \
    -H "Authorization: Bearer $token" \
    -H 'Content-Type: application/json' \
    -d "{\"customerName\":\"$name\",\"customerPhone\":\"$phone\",\"items\":[{\"productId\":$P1_ID,\"qty\":1}]}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['order']['id'])")
  # Transition to delivered
  for s in waiting_vendor preparing picked_up delivered; do
    curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$oid/status" \
      -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
      -d "{\"status\":\"$s\"}" > /dev/null
  done
  echo $oid
}

# Helper: create + keep pending (should NOT appear in done list)
create_pending_order() {
  curl -sS --max-time 5 -X POST http://localhost:3000/orders \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H 'Content-Type: application/json' \
    -d "{\"customerName\":\"Pending Only\",\"customerPhone\":\"01799999999\",\"items\":[{\"productId\":$P1_ID,\"qty\":1}]}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['order']['id'])"
}

# Helper: create + cancel (should NOT appear in done list)
create_cancelled_order() {
  local oid=$(curl -sS --max-time 5 -X POST http://localhost:3000/orders \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H 'Content-Type: application/json' \
    -d "{\"customerName\":\"Cancelled Only\",\"customerPhone\":\"01788888888\",\"items\":[{\"productId\":$P1_ID,\"qty\":1}]}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['order']['id'])")
  curl -sS --max-time 5 -X DELETE "http://localhost:3000/orders/$oid" \
    -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null
  echo $oid
}

# ─── Create test data ─────────────────────────────────────────
echo ""
echo "── Setup: create test data ──────────────────────────────"
# 3 delivered orders by admin
D1_ID=$(create_delivered_order "Alice Delivered" "01711111111" "$ADMIN_TOKEN")
D2_ID=$(create_delivered_order "Bob Delivered" "01722222222" "$ADMIN_TOKEN")
D3_ID=$(create_delivered_order "Carol Delivered" "01733333333" "$ADMIN_TOKEN")
# 1 delivered order by operator
D4_ID=$(create_delivered_order "Op Delivered" "01744444444" "$OP_TOKEN")
# 1 pending (should NOT appear)
P_ID=$(create_pending_order)
# 1 cancelled (should NOT appear)
C_ID=$(create_cancelled_order)
echo "   ✓ Created: 3 admin delivered + 1 op delivered + 1 pending + 1 cancelled"

# ─── 1. GET /orders/done without token → 401 ─────────────────
echo ""
echo "── 1. GET /orders/done without token → expect 401 ─────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" http://localhost:3000/orders/done
cat /tmp/r.json | pp

# ─── 2. GET /orders/done as admin → expect 4 delivered ────────
echo ""
echo "── 2. GET /orders/done as admin → expect 4 ────────────"
curl -sS --max-time 5 http://localhost:3000/orders/done \
  -H "Authorization: Bearer $ADMIN_TOKEN" > /tmp/done.json
python3 -c "
import json
d = json.load(open('/tmp/done.json'))
print(f'Total: {d[\"data\"][\"pagination\"][\"total\"]} (expected 4)')
for o in d['data']['data']:
    print(f'  - {o[\"orderCode\"]} customer={o[\"customerName\"]} status={o[\"status\"]} deliveredAt={o[\"deliveredAt\"][:19] if o[\"deliveredAt\"] else None}')
"

# ─── 3. Verify pending/cancelled excluded ────────────────────
echo ""
echo "── 3. Verify pending/cancelled excluded ──────────────"
python3 -c "
import json
d = json.load(open('/tmp/done.json'))
statuses = set(o['status'] for o in d['data']['data'])
if statuses == {'delivered'}:
    print(f'✓ Only delivered orders returned: {statuses}')
else:
    print(f'✗ FAIL: found non-delivered statuses: {statuses}')
    exit(1)
"

# ─── 4. Verify sort order (deliveredAt DESC = newest first) ─
echo ""
echo "── 4. Verify sort order (newest delivered first) ──────"
python3 -c "
import json
d = json.load(open('/tmp/done.json'))
delivered_ats = [o['deliveredAt'] for o in d['data']['data'] if o['deliveredAt']]
if delivered_ats == sorted(delivered_ats, reverse=True):
    print('✓ Orders sorted by deliveredAt DESC (newest first)')
else:
    print('✗ FAIL: not sorted correctly')
    exit(1)
"

# ─── 5. GET /orders/done as op → expect 1 (own only) ────────
echo ""
echo "── 5. GET /orders/done as op → expect 1 (own only) ───"
curl -sS --max-time 5 http://localhost:3000/orders/done \
  -H "Authorization: Bearer $OP_TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'Total: {d[\"data\"][\"pagination\"][\"total\"]} (expected 1)')
for o in d['data']['data']:
    print(f'  - {o[\"orderCode\"]} customer={o[\"customerName\"]} userId={o[\"userId\"]}')
"

# ─── 6. ?month=2026-08 → filter by month ─────────────────────
echo ""
echo "── 6. ?month=2026-08 → filter by current month ────────"
CURRENT_MONTH=$(date -u +%Y-%m)
curl -sS --max-time 5 "http://localhost:3000/orders/done?month=$CURRENT_MONTH" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'Total for month $CURRENT_MONTH: {d[\"data\"][\"pagination\"][\"total\"]} (expected 4 — all created just now)')
"

# ─── 7. ?month=2025-01 → expect 0 (no orders in that month) ─
echo ""
echo "── 7. ?month=2025-01 → expect 0 ───────────────────────"
curl -sS --max-time 5 "http://localhost:3000/orders/done?month=2025-01" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'Total for 2025-01: {d[\"data\"][\"pagination\"][\"total\"]} (expected 0)')
assert d['data']['pagination']['total'] == 0, 'FAIL: should be 0'
print('✓ Empty month returns 0 (no errors)')
"

# ─── 8. ?search=Alice → expect 1 ─────────────────────────────
echo ""
echo "── 8. ?search=Alice → expect 1 ────────────────────────"
curl -sS --max-time 5 "http://localhost:3000/orders/done?search=Alice" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'Total for search=Alice: {d[\"data\"][\"pagination\"][\"total\"]} (expected 1)')
for o in d['data']['data']:
    print(f'  - {o[\"customerName\"]}')
"

# ─── 9. ?search=01722222222 → expect 1 (phone search) ───────
echo ""
echo "── 9. ?search=01722222222 → expect 1 ──────────────────"
curl -sS --max-time 5 "http://localhost:3000/orders/done?search=01722222222" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'Total: {d[\"data\"][\"pagination\"][\"total\"]} (expected 1 — Bob)')
for o in d['data']['data']:
    print(f'  - {o[\"customerName\"]} phone={o[\"customerPhone\"]}')
"

# ─── 10. ?month=invalid → expect 400 ─────────────────────────
echo ""
echo "── 10. ?month=invalid → expect 400 ────────────────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" "http://localhost:3000/orders/done?month=invalid" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
cat /tmp/r.json | pp

# ─── 11. Pagination ──────────────────────────────────────────
echo ""
echo "── 11. Pagination ?limit=2&page=1 → page 1 of 2 ──────"
curl -sS --max-time 5 "http://localhost:3000/orders/done?limit=2&page=1" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
p = d['data']['pagination']
print(f'Page {p[\"page\"]} of {p[\"totalPages\"]} (total {p[\"total\"]})')
for o in d['data']['data']:
    print(f'  - {o[\"orderCode\"]} customer={o[\"customerName\"]}')
"

# ─── 12. Verify response shape ───────────────────────────────
echo ""
echo "── 12. Verify response shape ───────────────────────────"
curl -sS --max-time 5 "http://localhost:3000/orders/done?limit=1" \
  -H "Authorization: Bearer $ADMIN_TOKEN" > /tmp/done.json
python3 -c "
import json
d = json.load(open('/tmp/done.json'))
o = d['data']['data'][0]
required = ['id', 'orderCode', 'userId', 'customerName', 'customerPhone', 'status', 'total', 'itemsCount', 'createdAt', 'deliveredAt']
missing = [k for k in required if k not in o]
if missing:
    print(f'FAIL: missing fields {missing}')
    exit(1)
print('All required fields present:')
for k in required:
    val = o[k]
    if isinstance(val, str) and len(val) > 50:
        val = val[:50] + '...'
    print(f'  ✓ {k}: {val}')
"

# ─── 13. Verify 'done' not captured as :id ────────────────────
echo ""
echo "── 13. GET /orders/done (not captured as :id) ────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" "http://localhost:3000/orders/done" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
echo "   (should be 200, not 400 'Invalid order id' from GET /:id)"

echo ""
echo "═════════════════════════════════════════════════════════"
echo "  Done."
echo "═════════════════════════════════════════════════════════"

# Cleanup
echo ""
echo "Cleaning up test data..."
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db \
  -c "DELETE FROM status_log; DELETE FROM order_items; DELETE FROM orders; DELETE FROM products; DELETE FROM vendors; DELETE FROM users WHERE email='op-done@rizqun.com';" > /dev/null 2>&1
echo "   ✓ Cleaned up"

kill $SRV_PID 2>/dev/null
wait 2>/dev/null
echo "Done."
