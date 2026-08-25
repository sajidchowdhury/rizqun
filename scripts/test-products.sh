#!/usr/bin/env bash
# One-shot product CRUD smoke test — starts server, runs tests, kills server.
# Run with: bash scripts/test-products.sh

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
rm -f $CJ /tmp/r.json /tmp/op-cookies.txt

pp() { python3 -m json.tool 2>/dev/null || cat; }

echo ""
echo "═════════════════════════════════════════════════════════"
echo "  Rizqun — Product CRUD smoke test"
echo "═════════════════════════════════════════════════════════"

# ─── Bootstrap: login as admin + create an operator ───────────
echo ""
echo "── Setup: login as admin ────────────────────────────────"
ADMIN_LOGIN=$(curl -sS --max-time 5 -c $CJ -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@rizqun.com","password":"ChangeMeInProduction123!"}')
ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)
if [ -z "$ADMIN_TOKEN" ]; then
  echo "FAILED to login as admin"
  echo "$ADMIN_LOGIN"
  exit 1
fi
echo "   ✓ Admin token acquired"

# Create an operator (for 403 tests)
echo ""
echo "── Setup: create operator user ───────────────────────────"
curl -sS --max-time 5 -X POST http://localhost:3000/auth/register \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "name":"Test Op",
    "email":"op-products@rizqun.com",
    "phone":"01712345678",
    "password":"Password123",
    "role":"user",
    "categoryAccess":["grocery"]
  }' > /dev/null
OP_LOGIN=$(curl -sS --max-time 5 -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"op-products@rizqun.com","password":"Password123"}')
OP_TOKEN=$(echo "$OP_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)
echo "   ✓ Operator token acquired"

# Create a vendor + get grocery category for product creation
echo ""
echo "── Setup: create test vendor + fetch categories ────────"
VENDOR=$(curl -sS --max-time 5 -X POST http://localhost:3000/vendors \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test Vendor","phone":"01711111111","whatsappNumber":"8801711111111","category":"grocery"}')
VENDOR_ID=$(echo "$VENDOR" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['vendor']['id'])" 2>/dev/null)
echo "   ✓ Vendor id: $VENDOR_ID"

# Get grocery category id
PSQL=/home/z/.local/pg-extract/client/usr/lib/postgresql/17/bin/psql
GROCERY_ID=$(PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db -tAc "SELECT id FROM categories WHERE slug='grocery';")
echo "   ✓ Grocery category id: $GROCERY_ID"

# ─── 1. GET /products without auth → expect 401 ───────────────
echo ""
echo "── 1. GET /products without token → expect 401 ──────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" http://localhost:3000/products
cat /tmp/r.json | pp

# ─── 2. GET /products with admin token → expect 200 (empty) ───
echo ""
echo "── 2. GET /products with admin token → expect 200 ──────"
curl -sS --max-time 5 http://localhost:3000/products \
  -H "Authorization: Bearer $ADMIN_TOKEN" | pp

# ─── 3. POST /products as operator → expect 403 ────────────────
echo ""
echo "── 3. POST /products as operator → expect 403 ─────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST http://localhost:3000/products \
  -H "Authorization: Bearer $OP_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Should Fail\",\"price\":10.0,\"categoryId\":$GROCERY_ID,\"vendorId\":$VENDOR_ID}"
cat /tmp/r.json | pp

# ─── 4. POST /products as admin → expect 201 ──────────────────
echo ""
echo "── 4. POST /products as admin (Paracetamol) ────────────"
P1=$(curl -sS --max-time 5 -X POST http://localhost:3000/products \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Paracetamol 500mg\",\"sku\":\"MED-PARA-500\",\"price\":10.50,\"categoryId\":$GROCERY_ID,\"vendorId\":$VENDOR_ID,\"unit\":\"box\"}")
echo "$P1" | pp
P1_ID=$(echo "$P1" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['product']['id'])" 2>/dev/null)
echo "   ✓ Product 1 id: $P1_ID"

# ─── 5. POST /products with duplicate SKU → expect 409 ────────
echo ""
echo "── 5. POST /products duplicate SKU → expect 409 ────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST http://localhost:3000/products \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Another Para\",\"sku\":\"MED-PARA-500\",\"price\":11.0,\"categoryId\":$GROCERY_ID,\"vendorId\":$VENDOR_ID}"
cat /tmp/r.json | pp

# ─── 6. POST /products with invalid categoryId → expect 400 ───
echo ""
echo "── 6. POST /products invalid categoryId → expect 400 ──"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST http://localhost:3000/products \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Bad Cat\",\"price\":5.0,\"categoryId\":99999,\"vendorId\":$VENDOR_ID}"
cat /tmp/r.json | pp

# ─── 7. POST /products with negative price → expect 400 ──────
echo ""
echo "── 7. POST /products negative price → expect 400 ──────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST http://localhost:3000/products \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Neg Price\",\"price\":-5.0,\"categoryId\":$GROCERY_ID,\"vendorId\":$VENDOR_ID}"
cat /tmp/r.json | pp

# ─── 8. POST /products with deactivated vendor → expect 400 ──
# Create + deactivate a vendor for this test
echo ""
echo "── 8. POST /products with deactivated vendor → 400 ────"
V2=$(curl -sS --max-time 5 -X POST http://localhost:3000/vendors \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Deactivated Vendor","phone":"01555555555","category":"grocery"}')
V2_ID=$(echo "$V2" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['vendor']['id'])" 2>/dev/null)
curl -sS --max-time 5 -X DELETE "http://localhost:3000/vendors/$V2_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST http://localhost:3000/products \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Bad Vendor\",\"price\":5.0,\"categoryId\":$GROCERY_ID,\"vendorId\":$V2_ID}"
cat /tmp/r.json | pp

# ─── 9. Create more products for listing/filtering tests ──────
echo ""
echo "── 9. Create 2 more products for list tests ───────────"
curl -sS --max-time 5 -X POST http://localhost:3000/products \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Rice Basmati 5kg\",\"sku\":\"GRO-RICE-5KG\",\"price\":850.0,\"categoryId\":$GROCERY_ID,\"vendorId\":$VENDOR_ID,\"unit\":\"bag\"}" > /dev/null
echo "   ✓ Rice Basmati 5kg created"
curl -sS --max-time 5 -X POST http://localhost:3000/products \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Sugar 1kg\",\"sku\":\"GRO-SUGAR-1KG\",\"price\":95.0,\"categoryId\":$GROCERY_ID,\"vendorId\":$VENDOR_ID,\"unit\":\"kg\"}" > /dev/null
echo "   ✓ Sugar 1kg created"

# ─── 10. GET /products → expect 3 products ────────────────────
echo ""
echo "── 10. GET /products → expect 3 products ───────────────"
curl -sS --max-time 5 http://localhost:3000/products \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print('Total:', d['data']['pagination']['total']); [print(f\"  - {p['name']} (৳{p['price']})\") for p in d['data']['data']]"

# ─── 11. GET /products?search=Rice → expect 1 product ────────
echo ""
echo "── 11. GET /products?search=Rice → expect 1 ───────────"
curl -sS --max-time 5 "http://localhost:3000/products?search=Rice" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print('Total:', d['data']['pagination']['total']); [print(f\"  - {p['name']}\") for p in d['data']['data']]"

# ─── 12. GET /products/:id → expect 200 ───────────────────────
echo ""
echo "── 12. GET /products/$P1_ID → expect 200 ───────────────"
curl -sS --max-time 5 "http://localhost:3000/products/$P1_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | pp

# ─── 13. PATCH /products/:id (update price) ──────────────────
echo ""
echo "── 13. PATCH /products/$P1_ID (price 12.00) ───────────"
curl -sS --max-time 5 -X PATCH "http://localhost:3000/products/$P1_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"price":12.00}' | pp

# ─── 14. PATCH /products/:id (update name — trigger refresh) ─
echo ""
echo "── 14. PATCH /products/$P1_ID (name → trigger refresh) ─"
curl -sS --max-time 5 -X PATCH "http://localhost:3000/products/$P1_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Paracetamol Extra 500mg"}' | pp
echo "   ✓ Verifying search_vector refreshed..."
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db -tAc "SELECT search_vector::text FROM products WHERE id = $P1_ID;"

# ─── 15. PATCH /products/:id SKU conflict → expect 409 ───────
echo ""
echo "── 15. PATCH /products/$P1_ID (SKU conflict) → 409 ────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X PATCH "http://localhost:3000/products/$P1_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"sku":"GRO-RICE-5KG"}'
cat /tmp/r.json | pp

# ─── 16. PATCH /products/:id empty body → expect 400 ─────────
echo ""
echo "── 16. PATCH /products/$P1_ID (empty body) → 400 ──────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X PATCH "http://localhost:3000/products/$P1_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{}'
cat /tmp/r.json | pp

# ─── 17. DELETE /products/:id as operator → expect 403 ───────
echo ""
echo "── 17. DELETE /products/$P1_ID as operator → 403 ─────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X DELETE "http://localhost:3000/products/$P1_ID" \
  -H "Authorization: Bearer $OP_TOKEN"
cat /tmp/r.json | pp

# ─── 18. DELETE /products/:id as admin → expect 200 ───────────
echo ""
echo "── 18. DELETE /products/$P1_ID as admin → 200 ─────────"
curl -sS --max-time 5 -X DELETE "http://localhost:3000/products/$P1_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | pp

# ─── 19. DELETE /products/:id again → expect 409 ─────────────
echo ""
echo "── 19. DELETE /products/$P1_ID again → 409 ───────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X DELETE "http://localhost:3000/products/$P1_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
cat /tmp/r.json | pp

# ─── 20. GET /products?isActive=false → expect 1 product ─────
echo ""
echo "── 20. GET /products?isActive=false → expect 1 ────────"
curl -sS --max-time 5 "http://localhost:3000/products?isActive=false" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print('Total:', d['data']['pagination']['total']); [print(f\"  - {p['name']} (isActive={p['isActive']})\") for p in d['data']['data']]"

# ─── 21. GET /products/9999 → expect 404 ──────────────────────
echo ""
echo "── 21. GET /products/9999 → expect 404 ────────────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" "http://localhost:3000/products/9999" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
cat /tmp/r.json | pp

echo ""
echo "═════════════════════════════════════════════════════════"
echo "  Done."
echo "═════════════════════════════════════════════════════════"

# Cleanup
echo ""
echo "Cleaning up test data..."
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db \
  -c "DELETE FROM products WHERE vendor_id IN ($VENDOR_ID, $V2_ID);" > /dev/null 2>&1
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db \
  -c "DELETE FROM vendors WHERE id IN ($VENDOR_ID, $V2_ID);" > /dev/null 2>&1
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db \
  -c "DELETE FROM users WHERE email = 'op-products@rizqun.com';" > /dev/null 2>&1
echo "   ✓ Cleaned up"

kill $SRV_PID 2>/dev/null
wait 2>/dev/null
echo "Done."
