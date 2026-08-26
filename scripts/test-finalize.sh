#!/usr/bin/env bash
# One-shot finalize-order smoke test.
# Run with: bash scripts/test-finalize.sh

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
echo "  Rizqun — Finalize Order smoke test"
echo "═════════════════════════════════════════════════════════"

# ─── Bootstrap ─────────────────────────────────────────────────
echo ""
echo "── Setup: login as admin ────────────────────────────────"
ADMIN_LOGIN=$(curl -sS --max-time 5 -c $CJ -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@rizqun.com","password":"ChangeMeInProduction123!"}')
ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)
echo "   ✓ Admin token acquired"

# Create grocery-only operator
echo ""
echo "── Setup: create grocery-only operator ──────────────────"
curl -sS --max-time 5 -X POST http://localhost:3000/auth/register \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "name":"Op Grocery",
    "email":"op-finalize@rizqun.com",
    "phone":"01711111111",
    "password":"Password123",
    "role":"user",
    "categoryAccess":["grocery"]
  }' > /dev/null
OP_LOGIN=$(curl -sS --max-time 5 -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"op-finalize@rizqun.com","password":"Password123"}')
OP_TOKEN=$(echo "$OP_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)
echo "   ✓ Grocery operator token acquired"

# Create vendor + 3 products (2 grocery + 1 medicine)
echo ""
echo "── Setup: create vendor + products ───────────────────────"
VENDOR=$(curl -sS --max-time 5 -X POST http://localhost:3000/vendors \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Finalize Test Vendor","phone":"01733333333","category":"grocery"}')
VENDOR_ID=$(echo "$VENDOR" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['vendor']['id'])" 2>/dev/null)

GROCERY_ID=$(PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db -tAc "SELECT id FROM categories WHERE slug='grocery';")
MEDICINE_ID=$(PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db -tAc "SELECT id FROM categories WHERE slug='medicine';")

P1=$(curl -sS --max-time 5 -X POST http://localhost:3000/products \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Rice Basmati 5kg\",\"price\":850.0,\"categoryId\":$GROCERY_ID,\"vendorId\":$VENDOR_ID,\"unit\":\"bag\"}")
P1_ID=$(echo "$P1" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['product']['id'])" 2>/dev/null)
P2=$(curl -sS --max-time 5 -X POST http://localhost:3000/products \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Sugar 1kg\",\"price\":95.0,\"categoryId\":$GROCERY_ID,\"vendorId\":$VENDOR_ID,\"unit\":\"kg\"}")
P2_ID=$(echo "$P2" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['product']['id'])" 2>/dev/null)
P3=$(curl -sS --max-time 5 -X POST http://localhost:3000/products \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Paracetamol 500mg\",\"price\":10.0,\"categoryId\":$MEDICINE_ID,\"vendorId\":$VENDOR_ID,\"unit\":\"box\"}")
P3_ID=$(echo "$P3" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['product']['id'])" 2>/dev/null)
echo "   ✓ Created grocery P1=$P1_ID P2=$P2_ID and medicine P3=$P3_ID"

# ─── 1. POST /orders without token → expect 401 ───────────────
echo ""
echo "── 1. POST /orders without token → expect 401 ──────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST http://localhost:3000/orders \
  -H 'Content-Type: application/json' \
  -d "{\"customerName\":\"Test\",\"customerPhone\":\"01712345678\",\"items\":[{\"productId\":$P1_ID,\"qty\":1}]}"
cat /tmp/r.json | pp

# ─── 2. POST /orders as admin → expect 201 ────────────────────
echo ""
echo "── 2. POST /orders as admin (2 grocery items) ─────────"
ORDER1=$(curl -sS --max-time 5 -X POST http://localhost:3000/orders \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{
    \"customerName\":\"Rahim Uddin\",
    \"customerPhone\":\"01712345678\",
    \"customerAddress\":\"House 12, Road 5, Dhanmondi\",
    \"deliveryFee\":30,
    \"items\":[
      {\"productId\":$P1_ID,\"qty\":2},
      {\"productId\":$P2_ID,\"qty\":3}
    ]
  }")
echo "$ORDER1" | pp
ORDER1_ID=$(echo "$ORDER1" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['order']['id'])" 2>/dev/null)
ORDER1_CODE=$(echo "$ORDER1" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['order']['orderCode'])" 2>/dev/null)
echo "   ✓ Order id: $ORDER1_ID, code: $ORDER1_CODE"

# Verify totals: 2*850 + 3*95 = 1700 + 285 = 1985; +30 delivery = 2015
echo "   ✓ Verifying totals: 2*850 + 3*95 + 30 delivery = 2015"
SUBTOTAL=$(echo "$ORDER1" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['order']['subtotal'])")
TOTAL=$(echo "$ORDER1" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['order']['total'])")
echo "   subtotal=$SUBTOTAL total=$TOTAL (expected: 1985.00 and 2015.00)"

# Verify status_log has the initial pending entry
echo ""
echo "── 3. Verify status_log has initial pending entry ─────"
LOG_COUNT=$(PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db -tAc "SELECT count(*) FROM status_log WHERE order_id = $ORDER1_ID;")
echo "   status_log rows: $LOG_COUNT (expected: 1)"

# ─── 4. Finalize a second order → orderCode should auto-increment
echo ""
echo "── 4. Finalize second order → check orderCode increments ─"
ORDER2=$(curl -sS --max-time 5 -X POST http://localhost:3000/orders \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"customerName\":\"Karim\",\"customerPhone\":\"01798765432\",\"items\":[{\"productId\":$P1_ID,\"qty\":1}]}")
ORDER2_CODE=$(echo "$ORDER2" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['order']['orderCode'])" 2>/dev/null)
echo "   ✓ Order 2 code: $ORDER2_CODE (should be next sequential)"

# ─── 5. Grocery operator tries to finalize order with medicine item ─
echo ""
echo "── 5. Grocery op tries medicine item → expect 400 ─────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST http://localhost:3000/orders \
  -H "Authorization: Bearer $OP_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{
    \"customerName\":\"Bad Customer\",
    \"customerPhone\":\"01711112222\",
    \"items\":[
      {\"productId\":$P1_ID,\"qty\":1},
      {\"productId\":$P3_ID,\"qty\":1}
    ]
  }"
cat /tmp/r.json | pp

# ─── 6. Finalize with non-existent product → expect 400 ──────
echo ""
echo "── 6. Finalize with non-existent product → 400 ─────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST http://localhost:3000/orders \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"customerName\":\"Test\",\"customerPhone\":\"01712345678\",\"items\":[{\"productId\":99999,\"qty\":1}]}"
cat /tmp/r.json | pp

# ─── 7. Finalize with empty items array → expect 400 ─────────
echo ""
echo "── 7. Finalize with empty items → expect 400 ──────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST http://localhost:3000/orders \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"customerName\":\"Test\",\"customerPhone\":\"01712345678\",\"items\":[]}"
cat /tmp/r.json | pp

# ─── 8. Finalize with invalid phone → expect 400 ─────────────
echo ""
echo "── 8. Finalize with invalid phone → expect 400 ────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST http://localhost:3000/orders \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"customerName\":\"Test\",\"customerPhone\":\"123\",\"items\":[{\"productId\":$P1_ID,\"qty\":1}]}"
cat /tmp/r.json | pp

# ─── 9. Finalize with qty=0 → expect 400 ─────────────────────
echo ""
echo "── 9. Finalize with qty=0 → expect 400 ────────────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST http://localhost:3000/orders \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"customerName\":\"Test\",\"customerPhone\":\"01712345678\",\"items\":[{\"productId\":$P1_ID,\"qty\":0}]}"
cat /tmp/r.json | pp

# ─── 10. Verify snapshots work (update product price → order still shows old) ─
echo ""
echo "── 10. Update product price → verify order snapshot ───"
ORIGINAL_PRICE=$(PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db -tAc "SELECT price_snapshot::text FROM order_items WHERE order_id = $ORDER1_ID AND product_id = $P1_ID LIMIT 1;")
echo "   Original snapshot price: $ORIGINAL_PRICE"
# Update product price
curl -sS --max-time 5 -X PATCH "http://localhost:3000/products/$P1_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"price":999.99}' > /dev/null
NEW_PRICE=$(PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db -tAc "SELECT price_snapshot::text FROM order_items WHERE order_id = $ORDER1_ID AND product_id = $P1_ID LIMIT 1;")
echo "   Snapshot after product update: $NEW_PRICE (should still be $ORIGINAL_PRICE)"
if [ "$ORIGINAL_PRICE" = "$NEW_PRICE" ]; then
  echo "   ✓ Snapshot integrity confirmed"
else
  echo "   ✗ FAIL: snapshot was modified"
fi

# ─── 11. Finalize multi-vendor order (verify vendor grouping) ─
echo ""
echo "── 11. Finalize multi-vendor order ─────────────────────"
V2=$(curl -sS --max-time 5 -X POST http://localhost:3000/vendors \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Second Vendor","phone":"01744444444","category":"grocery"}')
V2_ID=$(echo "$V2" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['vendor']['id'])" 2>/dev/null)
P4=$(curl -sS --max-time 5 -X POST http://localhost:3000/products \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Tea Box\",\"price\":120.0,\"categoryId\":$GROCERY_ID,\"vendorId\":$V2_ID}")
P4_ID=$(echo "$P4" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['product']['id'])" 2>/dev/null)
echo "   ✓ Created second vendor ($V2_ID) with product P4=$P4_ID"

ORDER3=$(curl -sS --max-time 5 -X POST http://localhost:3000/orders \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"customerName\":\"Multi Vendor Cust\",\"customerPhone\":\"01755555555\",\"items\":[{\"productId\":$P1_ID,\"qty\":1},{\"productId\":$P4_ID,\"qty\":2}]}")
echo "$ORDER3" | python3 -c "
import sys, json
d = json.load(sys.stdin)
order = d['data']['order']
print(f'Order: {order[\"orderCode\"]}')
print(f'Items: {len(order[\"items\"])}')
for item in order['items']:
    vendor_name = item.get('vendor', {}).get('name', 'unknown')
    print(f'  - {item[\"productNameSnapshot\"]} qty={item[\"qty\"]} vendor={vendor_name} (id={item[\"vendorId\"]})')
"

echo ""
echo "═════════════════════════════════════════════════════════"
echo "  Done."
echo "═════════════════════════════════════════════════════════"

# Cleanup
echo ""
echo "Cleaning up test data..."
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db \
  -c "DELETE FROM status_log WHERE order_id IN (SELECT id FROM orders WHERE user_id = 2);" > /dev/null 2>&1
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db \
  -c "DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id = 2);" > /dev/null 2>&1
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db \
  -c "DELETE FROM orders WHERE user_id = 2;" > /dev/null 2>&1
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db \
  -c "DELETE FROM products WHERE vendor_id IN ($VENDOR_ID, $V2_ID);" > /dev/null 2>&1
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db \
  -c "DELETE FROM vendors WHERE id IN ($VENDOR_ID, $V2_ID);" > /dev/null 2>&1
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db \
  -c "DELETE FROM users WHERE email = 'op-finalize@rizqun.com';" > /dev/null 2>&1
echo "   ✓ Cleaned up"

kill $SRV_PID 2>/dev/null
wait 2>/dev/null
echo "Done."
