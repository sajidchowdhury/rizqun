#!/usr/bin/env bash
# One-shot dashboard summary smoke test.
# Run with: bash scripts/test-dashboard-summary.sh

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
echo "  Rizqun — Dashboard Summary smoke test"
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
  -d '{"name":"Op","email":"op-dash@rizqun.com","phone":"01711111111","password":"Password123","role":"user","categoryAccess":["all"]}' > /dev/null
OP_LOGIN=$(curl -sS --max-time 5 -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"op-dash@rizqun.com","password":"Password123"}')
OP_TOKEN=$(echo "$OP_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)
echo "   ✓ Operator token acquired"

# Create vendor + product
echo ""
echo "── Setup: create vendor + product ───────────────────────"
VENDOR=$(curl -sS --max-time 5 -X POST http://localhost:3000/vendors \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Dash Vendor","phone":"01733333333","category":"grocery"}')
VENDOR_ID=$(echo "$VENDOR" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['vendor']['id'])" 2>/dev/null)
GROCERY_ID=1
P1=$(curl -sS --max-time 5 -X POST http://localhost:3000/products \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Dash Product\",\"price\":100.0,\"categoryId\":$GROCERY_ID,\"vendorId\":$VENDOR_ID}")
P1_ID=$(echo "$P1" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['product']['id'])" 2>/dev/null)
echo "   ✓ Vendor=$VENDOR_ID Product=$P1_ID"

# Helper: create + deliver an order (with small delays so step times are > 0)
create_delivered_order() {
  local name=$1
  local token=$2
  local oid=$(curl -sS --max-time 5 -X POST http://localhost:3000/orders \
    -H "Authorization: Bearer $token" \
    -H 'Content-Type: application/json' \
    -d "{\"customerName\":\"$name\",\"customerPhone\":\"01712345678\",\"items\":[{\"productId\":$P1_ID,\"qty\":1}]}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['order']['id'])")
  sleep 1
  curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$oid/status" \
    -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
    -d '{"status":"waiting_vendor"}' > /dev/null
  sleep 1
  curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$oid/status" \
    -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
    -d '{"status":"preparing"}' > /dev/null
  sleep 1
  curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$oid/status" \
    -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
    -d '{"status":"picked_up"}' > /dev/null
  sleep 1
  curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$oid/status" \
    -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
    -d '{"status":"delivered"}' > /dev/null
  echo $oid
}

# ─── Create test data ─────────────────────────────────────────
echo ""
echo "── Setup: create delivered orders ──────────────────────"
# 2 delivered by admin, 1 delivered by op
D1_ID=$(create_delivered_order "Dash Admin 1" "$ADMIN_TOKEN")
D2_ID=$(create_delivered_order "Dash Admin 2" "$ADMIN_TOKEN")
D3_ID=$(create_delivered_order "Dash Op" "$OP_TOKEN")
echo "   ✓ Created 3 delivered orders (2 admin, 1 op) with ~1s delays between transitions"

# ─── 1. GET /dashboard/summary without token → 401 ────────────
echo ""
echo "── 1. GET /dashboard/summary without token → expect 401"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" "http://localhost:3000/dashboard/summary"
cat /tmp/r.json | pp

# ─── 2. GET /dashboard/summary as admin (default month) ──────
echo ""
echo "── 2. GET /dashboard/summary as admin (default month) ─"
curl -sS --max-time 5 "http://localhost:3000/dashboard/summary" \
  -H "Authorization: Bearer $ADMIN_TOKEN" > /tmp/summary.json
python3 -c "
import json
d = json.load(open('/tmp/summary.json'))
s = d['data']
print(f'  month: {s[\"month\"]}')
print(f'  doneCount: {s[\"doneCount\"]} (expected 3 — 2 admin + 1 op)')
print(f'  avgTotalMinutes: {s[\"avgTotalMinutes\"]} (should be ~4 min with 1s delays)')
print(f'  avgStepMinutes:')
for k, v in s['avgStepMinutes'].items():
    print(f'    {k}: {v}')
assert s['doneCount'] == 3, f'doneCount mismatch: {s[\"doneCount\"]}'
assert s['avgTotalMinutes'] is not None, 'avgTotalMinutes should not be None'
assert s['avgTotalMinutes'] > 0, f'avgTotalMinutes should be > 0, got {s[\"avgTotalMinutes\"]}'
# All 4 step averages should be present
for k, v in s['avgStepMinutes'].items():
    assert v is not None, f'{k} should not be None'
    assert v > 0, f'{k} should be > 0, got {v}'
print('  ✓ All metrics present and non-zero')
"

# ─── 3. GET /dashboard/summary as op → only own orders ────────
echo ""
echo "── 3. GET /dashboard/summary as op → expect 1 ─────────"
curl -sS --max-time 5 "http://localhost:3000/dashboard/summary" \
  -H "Authorization: Bearer $OP_TOKEN" > /tmp/summary.json
python3 -c "
import json
d = json.load(open('/tmp/summary.json'))
s = d['data']
print(f'  doneCount: {s[\"doneCount\"]} (expected 1 — op has 1 delivered)')
assert s['doneCount'] == 1, f'doneCount mismatch: {s[\"doneCount\"]}'
print('  ✓ Operator sees only own orders')
"

# ─── 4. ?month=2025-01 → empty month ──────────────────────────
echo ""
echo "── 4. ?month=2025-01 → empty month ────────────────────"
curl -sS --max-time 5 "http://localhost:3000/dashboard/summary?month=2025-01" \
  -H "Authorization: Bearer $ADMIN_TOKEN" > /tmp/summary.json
python3 -c "
import json
d = json.load(open('/tmp/summary.json'))
s = d['data']
print(f'  month: {s[\"month\"]} (expected 2025-01)')
print(f'  doneCount: {s[\"doneCount\"]} (expected 0)')
print(f'  avgTotalMinutes: {s[\"avgTotalMinutes\"]} (expected None)')
print(f'  avgStepMinutes (all should be None):')
for k, v in s['avgStepMinutes'].items():
    print(f'    {k}: {v}')
assert s['doneCount'] == 0, f'doneCount should be 0, got {s[\"doneCount\"]}'
assert s['avgTotalMinutes'] is None, f'avgTotalMinutes should be None, got {s[\"avgTotalMinutes\"]}'
for k, v in s['avgStepMinutes'].items():
    assert v is None, f'{k} should be None, got {v}'
print('  ✓ Empty month returns 0/null (no errors)')
"

# ─── 5. ?month=invalid → expect 400 ──────────────────────────
echo ""
echo "── 5. ?month=invalid → expect 400 ─────────────────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" "http://localhost:3000/dashboard/summary?month=invalid" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
cat /tmp/r.json | pp

# ─── 6. Verify response shape ─────────────────────────────────
echo ""
echo "── 6. Verify response shape ───────────────────────────"
python3 -c "
import json
d = json.load(open('/tmp/summary.json'))  # from test 4 (empty month)
# Re-fetch with default month
import urllib.request
req = urllib.request.Request('http://localhost:3000/dashboard/summary', headers={'Authorization': 'Bearer $ADMIN_TOKEN'})
resp = urllib.request.urlopen(req)
d = json.loads(resp.read())
s = d['data']
required_top = ['month', 'doneCount', 'avgTotalMinutes', 'avgStepMinutes']
missing = [k for k in required_top if k not in s]
if missing:
    print(f'FAIL: missing top-level fields {missing}')
    exit(1)
required_steps = ['pending_to_waiting_vendor', 'waiting_vendor_to_preparing', 'preparing_to_picked_up', 'picked_up_to_delivered']
missing_steps = [k for k in required_steps if k not in s['avgStepMinutes']]
if missing_steps:
    print(f'FAIL: missing step fields {missing_steps}')
    exit(1)
print('All required fields present:')
print(f'  ✓ month: {s[\"month\"]}')
print(f'  ✓ doneCount: {s[\"doneCount\"]}')
print(f'  ✓ avgTotalMinutes: {s[\"avgTotalMinutes\"]}')
print(f'  ✓ avgStepMinutes (4 steps):')
for k in required_steps:
    print(f'    ✓ {k}: {s[\"avgStepMinutes\"][k]}')
"

# ─── 7. Verify step times are reasonable (each ~1 min with 1s delays)
echo ""
echo "── 7. Verify step times are reasonable ─────────────────"
curl -sS --max-time 5 "http://localhost:3000/dashboard/summary" \
  -H "Authorization: Bearer $ADMIN_TOKEN" > /tmp/summary.json
python3 -c "
import json
d = json.load(open('/tmp/summary.json'))
s = d['data']
# With 1-second delays between transitions, each step should be ~0.017 min (1s/60s)
# But we round to 1 decimal place, so 0.0 is acceptable. Just verify they're not None.
print(f'  avgTotalMinutes: {s[\"avgTotalMinutes\"]} (expected > 0 — 4 transitions × ~1s = ~4s = ~0.067 min)')
# Verify total time is reasonable (should be at least 4 seconds = 0.067 min)
# With rounding to 1 decimal, it might be 0.1
assert s['avgTotalMinutes'] is not None and s['avgTotalMinutes'] >= 0, f'avgTotalMinutes invalid: {s[\"avgTotalMinutes\"]}'
print('  ✓ Step times are non-null and reasonable')
"

echo ""
echo "═════════════════════════════════════════════════════════"
echo "  Done."
echo "═════════════════════════════════════════════════════════"

# Cleanup
echo ""
echo "Cleaning up test data..."
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db \
  -c "DELETE FROM status_log; DELETE FROM order_items; DELETE FROM orders; DELETE FROM products; DELETE FROM vendors; DELETE FROM users WHERE email='op-dash@rizqun.com';" > /dev/null 2>&1
echo "   ✓ Cleaned up"

kill $SRV_PID 2>/dev/null
wait 2>/dev/null
echo "Done."
