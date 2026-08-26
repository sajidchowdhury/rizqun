#!/usr/bin/env bash
# One-shot list/get orders smoke test.
# Run with: bash scripts/test-list-orders.sh

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
echo "  Rizqun — List/Get Orders smoke test"
echo "═════════════════════════════════════════════════════════"

# ─── Bootstrap ─────────────────────────────────────────────────
echo ""
echo "── Setup: login as admin ────────────────────────────────"
ADMIN_LOGIN=$(curl -sS --max-time 5 -c $CJ -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@rizqun.com","password":"ChangeMeInProduction123!"}')
ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)
echo "   ✓ Admin token acquired"

# Create two operators (admin will create orders as admin, op1 as op1, op2 as op2)
echo ""
echo "── Setup: create two operators ─────────────────────────"
curl -sS --max-time 5 -X POST http://localhost:3000/auth/register \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Op One","email":"op1@rizqun.com","phone":"01711111111","password":"Password123","role":"user","categoryAccess":["all"]}' > /dev/null
curl -sS --max-time 5 -X POST http://localhost:3000/auth/register \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Op Two","email":"op2@rizqun.com","phone":"01722222222","password":"Password123","role":"user","categoryAccess":["all"]}' > /dev/null
OP1_LOGIN=$(curl -sS --max-time 5 -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"op1@rizqun.com","password":"Password123"}')
OP1_TOKEN=$(echo "$OP1_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)
OP1_ID=$(echo "$OP1_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['user']['id'])" 2>/dev/null)
OP2_LOGIN=$(curl -sS --max-time 5 -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"op2@rizqun.com","password":"Password123"}')
OP2_TOKEN=$(echo "$OP2_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)
echo "   ✓ Op1 id=$OP1_ID, Op2 token acquired"

# Create vendor + product
echo ""
echo "── Setup: create vendor + product ───────────────────────"
VENDOR=$(curl -sS --max-time 5 -X POST http://localhost:3000/vendors \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"List Test Vendor","phone":"01733333333","category":"grocery"}')
VENDOR_ID=$(echo "$VENDOR" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['vendor']['id'])" 2>/dev/null)
GROCERY_ID=$(PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db -tAc "SELECT id FROM categories WHERE slug='grocery';")
P1=$(curl -sS --max-time 5 -X POST http://localhost:3000/products \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Test Product\",\"price\":50.0,\"categoryId\":$GROCERY_ID,\"vendorId\":$VENDOR_ID}")
P1_ID=$(echo "$P1" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['product']['id'])" 2>/dev/null)
echo "   ✓ Vendor=$VENDOR_ID Product=$P1_ID"

# ─── Create orders for the test ────────────────────────────────
echo ""
echo "── Setup: create 3 orders (1 by admin, 1 by op1, 1 by op2)"
# Order 1 — admin
O1=$(curl -sS --max-time 5 -X POST http://localhost:3000/orders \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"customerName\":\"Admin Customer\",\"customerPhone\":\"01711111111\",\"items\":[{\"productId\":$P1_ID,\"qty\":1}]}")
O1_ID=$(echo "$O1" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['order']['id'])" 2>/dev/null)

# Order 2 — op1
O2=$(curl -sS --max-time 5 -X POST http://localhost:3000/orders \
  -H "Authorization: Bearer $OP1_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"customerName\":\"Op1 Customer\",\"customerPhone\":\"01722222222\",\"items\":[{\"productId\":$P1_ID,\"qty\":2}]}")
O2_ID=$(echo "$O2" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['order']['id'])" 2>/dev/null)

# Order 3 — op2
O3=$(curl -sS --max-time 5 -X POST http://localhost:3000/orders \
  -H "Authorization: Bearer $OP2_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"customerName\":\"Op2 Customer\",\"customerPhone\":\"01733333333\",\"items\":[{\"productId\":$P1_ID,\"qty\":3}]}")
O3_ID=$(echo "$O3" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['order']['id'])" 2>/dev/null)
echo "   ✓ Created orders: admin=$O1_ID, op1=$O2_ID, op2=$O3_ID"

# Manually mark O1 as delivered via psql for filter test
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db -c \
  "UPDATE orders SET status='delivered', delivered_at=NOW() WHERE id=$O1_ID;" > /dev/null
echo "   ✓ Marked O1 ($O1_ID) as delivered via psql"

# ─── 1. GET /orders without token → expect 401 ────────────────
echo ""
echo "── 1. GET /orders without token → expect 401 ──────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" http://localhost:3000/orders
cat /tmp/r.json | pp

# ─── 2. GET /orders as admin → expect 3 orders ─────────────────
echo ""
echo "── 2. GET /orders as admin → expect 3 orders ────────"
curl -sS --max-time 5 http://localhost:3000/orders \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'Total: {d[\"data\"][\"pagination\"][\"total\"]} (expected 3)')
for o in d['data']['data']:
    print(f'  - {o[\"orderCode\"]} customer={o[\"customerName\"]} status={o[\"status\"]} items={o[\"itemsCount\"]} total={o[\"total\"]}')
"

# ─── 3. GET /orders as op1 → expect 1 order (their own) ──────
echo ""
echo "── 3. GET /orders as op1 → expect 1 order (own only) ──"
curl -sS --max-time 5 http://localhost:3000/orders \
  -H "Authorization: Bearer $OP1_TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'Total: {d[\"data\"][\"pagination\"][\"total\"]} (expected 1)')
for o in d['data']['data']:
    print(f'  - {o[\"orderCode\"]} customer={o[\"customerName\"]} userId={o[\"userId\"]}')
"

# ─── 4. GET /orders?status=delivered as admin → expect 1 ─────
echo ""
echo "── 4. GET /orders?status=delivered → expect 1 ────────"
curl -sS --max-time 5 "http://localhost:3000/orders?status=delivered" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'Total: {d[\"data\"][\"pagination\"][\"total\"]} (expected 1)')
for o in d['data']['data']:
    print(f'  - {o[\"orderCode\"]} status={o[\"status\"]} deliveredAt={o[\"deliveredAt\"]}')
"

# ─── 5. GET /orders?search=Op1 as admin → expect 1 ───────────
echo ""
echo "── 5. GET /orders?search=Op1 → expect 1 (Op1 Customer) "
curl -sS --max-time 5 "http://localhost:3000/orders?search=Op1" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'Total: {d[\"data\"][\"pagination\"][\"total\"]} (expected 1)')
for o in d['data']['data']:
    print(f'  - {o[\"orderCode\"]} customer={o[\"customerName\"]}')
"

# ─── 6. GET /orders?search=01733333333 → expect 1 (phone match)
echo ""
echo "── 6. GET /orders?search=01733333333 → expect 1 ──────"
curl -sS --max-time 5 "http://localhost:3000/orders?search=01733333333" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'Total: {d[\"data\"][\"pagination\"][\"total\"]} (expected 1 — Op2 customer)')
for o in d['data']['data']:
    print(f'  - {o[\"orderCode\"]} phone={o[\"customerPhone\"]}')
"

# ─── 7. GET /orders/:id as admin → expect full detail ────────
echo ""
echo "── 7. GET /orders/$O2_ID as admin → full detail ───────"
curl -sS --max-time 5 "http://localhost:3000/orders/$O2_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | pp

# ─── 8. GET /orders/:id as op1 (own order) → expect 200 ──────
echo ""
echo "── 8. GET /orders/$O2_ID as op1 (own) → expect 200 ────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" "http://localhost:3000/orders/$O2_ID" \
  -H "Authorization: Bearer $OP1_TOKEN"
echo "   (response has customer name Op1 Customer)"

# ─── 9. GET /orders/:id as op2 (someone else's order) → 404 ─
echo ""
echo "── 9. GET /orders/$O2_ID as op2 (not own) → expect 404"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" "http://localhost:3000/orders/$O2_ID" \
  -H "Authorization: Bearer $OP2_TOKEN"
cat /tmp/r.json | pp

# ─── 10. GET /orders/9999 → expect 404 ──────────────────────
echo ""
echo "── 10. GET /orders/9999 → expect 404 ────────────────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" "http://localhost:3000/orders/9999" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
cat /tmp/r.json | pp

# ─── 11. GET /orders with invalid status → expect 400 ────────
echo ""
echo "── 11. GET /orders?status=invalid → expect 400 ────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" "http://localhost:3000/orders?status=invalid" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
cat /tmp/r.json | pp

# ─── 12. GET /orders with pagination (limit=2&page=1) ───────
echo ""
echo "── 12. GET /orders?limit=2&page=1 → paginated ─────────"
curl -sS --max-time 5 "http://localhost:3000/orders?limit=2&page=1" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
p = d['data']['pagination']
print(f'Page {p[\"page\"]} of {p[\"totalPages\"]} (total {p[\"total\"]})')
for o in d['data']['data']:
    print(f'  - {o[\"orderCode\"]}')
"

# ─── 13. GET /orders/:id response shape verification ────────
echo ""
echo "── 13. Verify GET /orders/:id response shape ──────────"
curl -sS --max-time 5 "http://localhost:3000/orders/$O2_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
o = d['data']['order']
required = ['id', 'orderCode', 'userId', 'customerName', 'customerPhone', 'subtotal', 'deliveryFee', 'total', 'status', 'createdAt', 'items']
missing = [k for k in required if k not in o]
if missing:
    print(f'FAIL: missing fields {missing}')
    sys.exit(1)
print('All order fields present:')
for k in required:
    print(f'  ✓ {k}: {o[k] if k != \"items\" else f\"[{len(o[k])} items]\"}')
item = o['items'][0]
required_item = ['id', 'productId', 'vendorId', 'productNameSnapshot', 'priceSnapshot', 'qty', 'lineTotal', 'addedAfterFinalize', 'vendor']
missing_item = [k for k in required_item if k not in item]
if missing_item:
    print(f'FAIL: missing item fields {missing_item}')
    sys.exit(1)
print('All item fields present:')
for k in required_item:
    print(f'  ✓ {k}: {item[k]}')
"

echo ""
echo "═════════════════════════════════════════════════════════"
echo "  Done."
echo "═════════════════════════════════════════════════════════"

# Cleanup
echo ""
echo "Cleaning up test data..."
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db \
  -c "DELETE FROM status_log WHERE order_id IN (SELECT id FROM orders);" > /dev/null 2>&1
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db \
  -c "DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders);" > /dev/null 2>&1
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db \
  -c "DELETE FROM orders;" > /dev/null 2>&1
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db \
  -c "DELETE FROM products WHERE vendor_id = $VENDOR_ID;" > /dev/null 2>&1
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db \
  -c "DELETE FROM vendors WHERE id = $VENDOR_ID;" > /dev/null 2>&1
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db \
  -c "DELETE FROM users WHERE email IN ('op1@rizqun.com', 'op2@rizqun.com');" > /dev/null 2>&1
echo "   ✓ Cleaned up"

kill $SRV_PID 2>/dev/null
wait 2>/dev/null
echo "Done."
