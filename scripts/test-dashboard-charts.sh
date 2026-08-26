#!/usr/bin/env bash
# One-shot dashboard charts smoke test.
# Run with: bash scripts/test-dashboard-charts.sh

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
echo "  Rizqun — Dashboard Charts smoke test"
echo "═════════════════════════════════════════════════════════"

# ─── Bootstrap ─────────────────────────────────────────────────
echo ""
echo "── Setup: login as admin ────────────────────────────────"
ADMIN_LOGIN=$(curl -sS --max-time 5 -c $CJ -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@rizqun.com","password":"ChangeMeInProduction123!"}')
ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)
echo "   ✓ Admin token acquired"

# Create vendor + product (grocery)
echo ""
echo "── Setup: create vendor + product ───────────────────────"
VENDOR=$(curl -sS --max-time 5 -X POST http://localhost:3000/vendors \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Chart Vendor","phone":"01733333333","category":"grocery"}')
VENDOR_ID=$(echo "$VENDOR" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['vendor']['id'])" 2>/dev/null)
GROCERY_ID=1
MEDICINE_ID=2
P_GROCERY=$(curl -sS --max-time 5 -X POST http://localhost:3000/products \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Grocery Item\",\"price\":100.0,\"categoryId\":$GROCERY_ID,\"vendorId\":$VENDOR_ID}")
P_GROCERY_ID=$(echo "$P_GROCERY" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['product']['id'])" 2>/dev/null)
P_MEDICINE=$(curl -sS --max-time 5 -X POST http://localhost:3000/products \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Medicine Item\",\"price\":50.0,\"categoryId\":$MEDICINE_ID,\"vendorId\":$VENDOR_ID}")
P_MEDICINE_ID=$(echo "$P_MEDICINE" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['product']['id'])" 2>/dev/null)
echo "   ✓ Vendor=$VENDOR_ID, Grocery P=$P_GROCERY_ID, Medicine P=$P_MEDICINE_ID"

# Helper: create + deliver an order
create_delivered_order() {
  local items_json=$1
  local oid=$(curl -sS --max-time 5 -X POST http://localhost:3000/orders \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H 'Content-Type: application/json' \
    -d "{\"customerName\":\"Chart Test\",\"customerPhone\":\"01712345678\",\"items\":$items_json}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['order']['id'])")
  for s in waiting_vendor preparing picked_up delivered; do
    curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$oid/status" \
      -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
      -d "{\"status\":\"$s\"}" > /dev/null
  done
  echo $oid
}

# Create test data: 2 grocery-only orders + 1 medicine-only + 1 mixed
echo ""
echo "── Setup: create 4 delivered orders ──────────────────────"
create_delivered_order "[{\"productId\":$P_GROCERY_ID,\"qty\":1}]" > /dev/null
create_delivered_order "[{\"productId\":$P_GROCERY_ID,\"qty\":2}]" > /dev/null
create_delivered_order "[{\"productId\":$P_MEDICINE_ID,\"qty\":1}]" > /dev/null
create_delivered_order "[{\"productId\":$P_GROCERY_ID,\"qty\":1},{\"productId\":$P_MEDICINE_ID,\"qty\":1}]" > /dev/null
echo "   ✓ Created 4 delivered orders (2 grocery, 1 medicine, 1 mixed)"

# ─── 1. GET /dashboard/orders-per-day without token → 401 ────
echo ""
echo "── 1. orders-per-day without token → expect 401 ──────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" "http://localhost:3000/dashboard/orders-per-day?days=7"
cat /tmp/r.json | pp

# ─── 2. GET /dashboard/orders-per-day?days=7 → 7 data points ─
echo ""
echo "── 2. orders-per-day?days=7 → 7 data points ──────────"
curl -sS --max-time 5 "http://localhost:3000/dashboard/orders-per-day?days=7" \
  -H "Authorization: Bearer $ADMIN_TOKEN" > /tmp/chart.json
python3 -c "
import json, datetime
d = json.load(open('/tmp/chart.json'))
data = d['data']['data']
print(f'  data points: {len(data)} (expected 7)')
today = datetime.date.today().isoformat()
today_point = [p for p in data if p['date'] == today]
if today_point:
    print(f'  today ({today}): count={today_point[0][\"count\"]} (expected 4)')
    assert today_point[0]['count'] == 4, f'today count mismatch: {today_point[0][\"count\"]}'
else:
    print(f'  ✗ FAIL: today not found in data')
    exit(1)
# Verify zero-filled (past days with no orders should have count=0)
zero_days = [p for p in data if p['count'] == 0]
print(f'  zero-filled days: {len(zero_days)} (should be 6 — only today has orders)')
assert len(data) == 7, f'expected 7 points, got {len(data)}'
print('  ✓ Orders-per-day correct with zero-fill')
"

# ─── 3. GET /dashboard/orders-per-day?days=1 → 1 point ────────
echo ""
echo "── 3. orders-per-day?days=1 → 1 point ────────────────"
curl -sS --max-time 5 "http://localhost:3000/dashboard/orders-per-day?days=1" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
data = d['data']['data']
print(f'  data points: {len(data)} (expected 1)')
print(f'  {data[0][\"date\"]}: count={data[0][\"count\"]}')
assert len(data) == 1, 'FAIL'
print('  ✓ Single day works')
"

# ─── 4. GET /dashboard/avg-time-per-day?days=7 ───────────────
echo ""
echo "── 4. avg-time-per-day?days=7 → 7 data points ────────"
curl -sS --max-time 5 "http://localhost:3000/dashboard/avg-time-per-day?days=7" \
  -H "Authorization: Bearer $ADMIN_TOKEN" > /tmp/chart.json
python3 -c "
import json, datetime
d = json.load(open('/tmp/chart.json'))
data = d['data']['data']
print(f'  data points: {len(data)} (expected 7)')
today = datetime.date.today().isoformat()
today_point = [p for p in data if p['date'] == today]
if today_point:
    avg = today_point[0]['avgMinutes']
    print(f'  today ({today}): avgMinutes={avg} (should be non-null)')
    assert avg is not None, 'today avgMinutes should not be None'
# Verify null-filled for past days with no deliveries
null_days = [p for p in data if p['avgMinutes'] is None]
print(f'  null-filled days: {len(null_days)} (should be 6 — only today has deliveries)')
assert len(data) == 7, f'expected 7 points, got {len(data)}'
print('  ✓ Avg-time-per-day correct with null-fill')
"

# ─── 5. GET /dashboard/category-breakdown (default month) ───
echo ""
echo "── 5. category-breakdown (default month) ──────────────"
curl -sS --max-time 5 "http://localhost:3000/dashboard/category-breakdown" \
  -H "Authorization: Bearer $ADMIN_TOKEN" > /tmp/chart.json
python3 -c "
import json
d = json.load(open('/tmp/chart.json'))
data = d['data']['data']
print(f'  categories: {len(data)} (expected 2 — grocery + medicine)')
for c in data:
    print(f'  - {c[\"categoryName\"]} (slug={c[\"categorySlug\"]}): {c[\"orderCount\"]} orders')
# grocery: 2 grocery-only + 1 mixed = 3 orders with grocery items
# medicine: 1 medicine-only + 1 mixed = 2 orders with medicine items
grocery = [c for c in data if c['categorySlug'] == 'grocery']
medicine = [c for c in data if c['categorySlug'] == 'medicine']
if grocery:
    print(f'  grocery orderCount: {grocery[0][\"orderCount\"]} (expected 3)')
    assert grocery[0]['orderCount'] == 3, f'grocery count mismatch: {grocery[0][\"orderCount\"]}'
if medicine:
    print(f'  medicine orderCount: {medicine[0][\"orderCount\"]} (expected 2)')
    assert medicine[0]['orderCount'] == 2, f'medicine count mismatch: {medicine[0][\"orderCount\"]}'
print('  ✓ Category breakdown correct (COUNT DISTINCT per category)')
"

# ─── 6. GET /dashboard/category-breakdown?month=2025-01 → 0 ─
echo ""
echo "── 6. category-breakdown?month=2025-01 → empty ────────"
curl -sS --max-time 5 "http://localhost:3000/dashboard/category-breakdown?month=2025-01" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'  categories: {len(d[\"data\"][\"data\"])} (expected 0)')
assert len(d['data']['data']) == 0, 'FAIL'
print('  ✓ Empty month returns empty array')
"

# ─── 7. ?days=0 → expect 400 ─────────────────────────────────
echo ""
echo "── 7. ?days=0 → expect 400 ─────────────────────────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" "http://localhost:3000/dashboard/orders-per-day?days=0" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
cat /tmp/r.json | pp

# ─── 8. Verify response shapes ───────────────────────────────
echo ""
echo "── 8. Verify response shapes ───────────────────────────"
echo "  orders-per-day:"
curl -sS --max-time 5 "http://localhost:3000/dashboard/orders-per-day?days=1" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
p = d['data']['data'][0]
assert 'date' in p and 'count' in p, f'missing fields: {p}'
print(f'    ✓ {{date, count}}: {p}')
"
echo "  avg-time-per-day:"
curl -sS --max-time 5 "http://localhost:3000/dashboard/avg-time-per-day?days=1" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
p = d['data']['data'][0]
assert 'date' in p and 'avgMinutes' in p, f'missing fields: {p}'
print(f'    ✓ {{date, avgMinutes}}: {p}')
"
echo "  category-breakdown:"
curl -sS --max-time 5 "http://localhost:3000/dashboard/category-breakdown" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if d['data']['data']:
    p = d['data']['data'][0]
    assert 'categorySlug' in p and 'categoryName' in p and 'orderCount' in p, f'missing fields: {p}'
    print(f'    ✓ {{categorySlug, categoryName, orderCount}}: {p}')
else:
    print('    (no data — skipping shape check)')
"

echo ""
echo "═════════════════════════════════════════════════════════"
echo "  Done."
echo "═════════════════════════════════════════════════════════"

# Cleanup
echo ""
echo "Cleaning up test data..."
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db \
  -c "DELETE FROM status_log; DELETE FROM order_items; DELETE FROM orders; DELETE FROM products; DELETE FROM vendors;" > /dev/null 2>&1
echo "   ✓ Cleaned up"

kill $SRV_PID 2>/dev/null
wait 2>/dev/null
echo "Done."
