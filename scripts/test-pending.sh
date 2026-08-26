#!/usr/bin/env bash
# One-shot pending-list smoke test.
# Run with: bash scripts/test-pending.sh

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
echo "  Rizqun — Pending List smoke test"
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
  -d '{"name":"Pending Test Vendor","phone":"01733333333","category":"grocery"}')
VENDOR_ID=$(echo "$VENDOR" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['vendor']['id'])" 2>/dev/null)
GROCERY_ID=1
P1=$(curl -sS --max-time 5 -X POST http://localhost:3000/products \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Test Prod\",\"price\":50.0,\"categoryId\":$GROCERY_ID,\"vendorId\":$VENDOR_ID}")
P1_ID=$(echo "$P1" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['product']['id'])" 2>/dev/null)
echo "   ✓ Vendor=$VENDOR_ID Product=$P1_ID"

# Create an operator (for scope test)
echo ""
echo "── Setup: create operator ───────────────────────────────"
curl -sS --max-time 5 -X POST http://localhost:3000/auth/register \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Op","email":"op-pending@rizqun.com","phone":"01711111111","password":"Password123","role":"user","categoryAccess":["all"]}' > /dev/null
OP_LOGIN=$(curl -sS --max-time 5 -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"op-pending@rizqun.com","password":"Password123"}')
OP_TOKEN=$(echo "$OP_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)
echo "   ✓ Operator token acquired"

# Helper: create a pending order
create_order() {
  local token=$1
  local name=$2
  local phone=$3
  curl -sS --max-time 5 -X POST http://localhost:3000/orders \
    -H "Authorization: Bearer $token" \
    -H 'Content-Type: application/json' \
    -d "{\"customerName\":\"$name\",\"customerPhone\":\"$phone\",\"items\":[{\"productId\":$P1_ID,\"qty\":1}]}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['order']['id'])"
}

# ─── Create test data: mix of statuses ────────────────────────
echo ""
echo "── Setup: create orders with various statuses ───────────"
# 3 pending orders (will stay pending)
O1_ID=$(create_order "$ADMIN_TOKEN" "Alice Pending" "01711111111")
O2_ID=$(create_order "$ADMIN_TOKEN" "Bob Waiting" "01722222222")
O3_ID=$(create_order "$OP_TOKEN" "Carol Op Own" "01733333333")
# Move O2 to waiting_vendor
curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$O2_ID/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"waiting_vendor"}' > /dev/null
# 1 delivered order (should NOT appear in pending)
O4_ID=$(create_order "$ADMIN_TOKEN" "Dave Delivered" "01744444444")
curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$O4_ID/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"waiting_vendor"}' > /dev/null
curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$O4_ID/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"preparing"}' > /dev/null
curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$O4_ID/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"picked_up"}' > /dev/null
curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$O4_ID/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"delivered"}' > /dev/null
# 1 cancelled order (should NOT appear in pending)
O5_ID=$(create_order "$ADMIN_TOKEN" "Eve Cancelled" "01755555555")
curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$O5_ID/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"cancelled"}' > /dev/null
echo "   ✓ Created 5 orders: 2 pending, 1 waiting_vendor, 1 delivered, 1 cancelled"
echo "   ✓ (1 of the pending is op's own — for scoping test)"

# Sleep 2 seconds so minutesSinceCreated is at least 0 (and we can verify it works)
sleep 2

# ─── 1. GET /orders/pending without token → expect 401 ────────
echo ""
echo "── 1. GET /orders/pending without token → expect 401 ────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" http://localhost:3000/orders/pending
cat /tmp/r.json | pp

# ─── 2. GET /orders/pending as admin → expect 3 (pending + waiting_vendor + op's own)
echo ""
echo "── 2. GET /orders/pending as admin → expect 3 ──────────"
curl -sS --max-time 5 http://localhost:3000/orders/pending \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'Total: {d[\"data\"][\"pagination\"][\"total\"]} (expected 3)')
for o in d['data']['data']:
    print(f'  - {o[\"orderCode\"]} customer={o[\"customerName\"]} status={o[\"status\"]} items={o[\"itemsCount\"]} min_ago={o[\"minutesSinceCreated\"]}')
"

# ─── 3. Verify excluded statuses don't appear ─────────────────
echo ""
echo "── 3. Verify delivered/cancelled excluded ──────────────"
curl -sS --max-time 5 http://localhost:3000/orders/pending \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
statuses = set(o['status'] for o in d['data']['data'])
excluded = statuses & {'picked_up', 'delivered', 'cancelled'}
if excluded:
    print(f'FAIL: excluded statuses found: {excluded}')
    sys.exit(1)
print(f'✓ Only in-flight statuses returned: {statuses}')
"

# ─── 4. Verify minutesSinceCreated is computed ────────────────
echo ""
echo "── 4. Verify minutesSinceCreated field ─────────────────"
curl -sS --max-time 5 http://localhost:3000/orders/pending \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for o in d['data']['data']:
    msc = o['minutesSinceCreated']
    if not isinstance(msc, int) or msc < 0:
        print(f'FAIL: minutesSinceCreated={msc} for {o[\"orderCode\"]}')
        sys.exit(1)
    print(f'  ✓ {o[\"orderCode\"]} minutesSinceCreated={msc}')
"

# ─── 5. GET /orders/pending as op → expect 1 (own only) ──────
echo ""
echo "── 5. GET /orders/pending as op → expect 1 (own only) ──"
curl -sS --max-time 5 http://localhost:3000/orders/pending \
  -H "Authorization: Bearer $OP_TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'Total: {d[\"data\"][\"pagination\"][\"total\"]} (expected 1)')
for o in d['data']['data']:
    print(f'  - {o[\"orderCode\"]} customer={o[\"customerName\"]} userId={o[\"userId\"]}')
"

# ─── 6. Search by customer name ───────────────────────────────
echo ""
echo "── 6. ?customer=Alice → expect 1 ──────────────────────"
curl -sS --max-time 5 "http://localhost:3000/orders/pending?customer=Alice" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'Total: {d[\"data\"][\"pagination\"][\"total\"]} (expected 1)')
for o in d['data']['data']:
    print(f'  - {o[\"orderCode\"]} customer={o[\"customerName\"]}')
"

# ─── 7. Search by phone ───────────────────────────────────────
echo ""
echo "── 7. ?customer=01722222222 → expect 1 (Bob Waiting) ──"
curl -sS --max-time 5 "http://localhost:3000/orders/pending?customer=01722222222" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'Total: {d[\"data\"][\"pagination\"][\"total\"]} (expected 1)')
for o in d['data']['data']:
    print(f'  - {o[\"orderCode\"]} customer={o[\"customerName\"]} phone={o[\"customerPhone\"]}')
"

# ─── 8. Verify sort order (oldest first) ──────────────────────
echo ""
echo "── 8. Verify sort order (oldest first) ────────────────"
curl -sS --max-time 5 http://localhost:3000/orders/pending \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
created_ats = [o['createdAt'] for o in d['data']['data']]
if created_ats == sorted(created_ats):
    print('✓ Orders are sorted oldest-first (ascending createdAt)')
else:
    print('✗ FAIL: orders not sorted oldest-first')
    sys.exit(1)
for o in d['data']['data']:
    print(f'  - {o[\"orderCode\"]} createdAt={o[\"createdAt\"]}')
"

# ─── 9. Pagination ───────────────────────────────────────────
echo ""
echo "── 9. Pagination ?limit=2&page=1 → page 1 of 2 ────────"
curl -sS --max-time 5 "http://localhost:3000/orders/pending?limit=2&page=1" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
p = d['data']['pagination']
print(f'Page {p[\"page\"]} of {p[\"totalPages\"]} (total {p[\"total\"]})')
for o in d['data']['data']:
    print(f'  - {o[\"orderCode\"]} customer={o[\"customerName\"]}')
"

# ─── 10. Verify response shape ────────────────────────────────
echo ""
echo "── 10. Verify response shape ───────────────────────────"
curl -sS --max-time 5 "http://localhost:3000/orders/pending?limit=1" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
o = d['data']['data'][0]
required = ['id', 'orderCode', 'userId', 'customerName', 'customerPhone', 'status', 'total', 'itemsCount', 'createdAt', 'minutesSinceCreated']
missing = [k for k in required if k not in o]
if missing:
    print(f'FAIL: missing fields {missing}')
    sys.exit(1)
print('All required fields present:')
for k in required:
    print(f'  ✓ {k}: {o[k]}')
"

# ─── 11. Invalid query (limit=0) → expect 400 ─────────────────
echo ""
echo "── 11. ?limit=0 → expect 400 ───────────────────────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" "http://localhost:3000/orders/pending?limit=0" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
cat /tmp/r.json | pp

# ─── 12. Verify 'pending' isn't captured as :id ───────────────
echo ""
echo "── 12. GET /orders/pending (not captured as :id) ──────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" "http://localhost:3000/orders/pending" \
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
  -c "DELETE FROM status_log; DELETE FROM order_items; DELETE FROM orders; DELETE FROM products; DELETE FROM vendors; DELETE FROM users WHERE email='op-pending@rizqun.com';" > /dev/null 2>&1
echo "   ✓ Cleaned up"

kill $SRV_PID 2>/dev/null
wait 2>/dev/null
echo "Done."
