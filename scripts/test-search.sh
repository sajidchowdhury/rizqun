#!/usr/bin/env bash
# One-shot search endpoint smoke test — starts server, runs tests, kills server.
# Run with: bash scripts/test-search.sh

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
rm -f $CJ /tmp/r.json /tmp/op-grocery-cookies.txt /tmp/op-medicine-cookies.txt

pp() { python3 -m json.tool 2>/dev/null || cat; }

echo ""
echo "═════════════════════════════════════════════════════════"
echo "  Rizqun — Smart Search smoke test"
echo "═════════════════════════════════════════════════════════"

# ─── Bootstrap: login as admin + create operators ─────────────
echo ""
echo "── Setup: login as admin ────────────────────────────────"
ADMIN_LOGIN=$(curl -sS --max-time 5 -c $CJ -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@rizqun.com","password":"ChangeMeInProduction123!"}')
ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)
echo "   ✓ Admin token acquired"

PSQL=/home/z/.local/pg-extract/client/usr/lib/postgresql/17/bin/psql

# Create grocery-only operator
echo ""
echo "── Setup: create grocery-only operator ──────────────────"
curl -sS --max-time 5 -X POST http://localhost:3000/auth/register \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "name":"Op Grocery",
    "email":"op-grocery@rizqun.com",
    "phone":"01711111111",
    "password":"Password123",
    "role":"user",
    "categoryAccess":["grocery"]
  }' > /dev/null
OP_GROCERY_LOGIN=$(curl -sS --max-time 5 -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"op-grocery@rizqun.com","password":"Password123"}')
OP_GROCERY_TOKEN=$(echo "$OP_GROCERY_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)
echo "   ✓ Grocery operator token acquired"

# Create medicine-only operator
echo ""
echo "── Setup: create medicine-only operator ─────────────────"
curl -sS --max-time 5 -X POST http://localhost:3000/auth/register \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "name":"Op Medicine",
    "email":"op-medicine@rizqun.com",
    "phone":"01922222222",
    "password":"Password123",
    "role":"user",
    "categoryAccess":["medicine"]
  }' > /dev/null
OP_MEDICINE_LOGIN=$(curl -sS --max-time 5 -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"op-medicine@rizqun.com","password":"Password123"}')
OP_MEDICINE_TOKEN=$(echo "$OP_MEDICINE_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)
echo "   ✓ Medicine operator token acquired"

# Create a vendor + 3 products (1 grocery, 2 medicine) for search tests
echo ""
echo "── Setup: create vendor + products ───────────────────────"
VENDOR=$(curl -sS --max-time 5 -X POST http://localhost:3000/vendors \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test Vendor","phone":"01733333333","whatsappNumber":"8801733333333","category":"grocery"}')
VENDOR_ID=$(echo "$VENDOR" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['vendor']['id'])" 2>/dev/null)

# Get category IDs
GROCERY_ID=$(PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db -tAc "SELECT id FROM categories WHERE slug='grocery';")
MEDICINE_ID=$(PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db -tAc "SELECT id FROM categories WHERE slug='medicine';")

# Create grocery products
curl -sS --max-time 5 -X POST http://localhost:3000/products \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Paracetamol Grocery Item\",\"sku\":\"TEST-SEARCH-1\",\"price\":10.0,\"categoryId\":$GROCERY_ID,\"vendorId\":$VENDOR_ID}" > /dev/null
curl -sS --max-time 5 -X POST http://localhost:3000/products \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Rice Basmati\",\"sku\":\"TEST-SEARCH-2\",\"price\":850.0,\"categoryId\":$GROCERY_ID,\"vendorId\":$VENDOR_ID}" > /dev/null

# Create medicine products
curl -sS --max-time 5 -X POST http://localhost:3000/products \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Paracetamol Medicine 500mg\",\"sku\":\"TEST-SEARCH-3\",\"price\":15.0,\"categoryId\":$MEDICINE_ID,\"vendorId\":$VENDOR_ID}" > /dev/null
curl -sS --max-time 5 -X POST http://localhost:3000/products \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Amoxicillin Capsule\",\"sku\":\"TEST-SEARCH-4\",\"price\":120.0,\"categoryId\":$MEDICINE_ID,\"vendorId\":$VENDOR_ID}" > /dev/null
echo "   ✓ Created 2 grocery + 2 medicine products"

# ─── 1. GET /products/search without token → expect 401 ───────
echo ""
echo "── 1. GET /products/search without token → 401 ────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" "http://localhost:3000/products/search?q=paracetamol"
cat /tmp/r.json | pp

# ─── 2. GET /products/search as admin → expect FTS results ───
echo ""
echo "── 2. GET /products/search?q=paracetamol as admin ─────"
curl -sS --max-time 5 "http://localhost:3000/products/search?q=paracetamol" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | pp

# ─── 3. Search with explicit ?category=grocery filter ───────
echo ""
echo "── 3. Search paracetamol + category=grocery → 1 result ─"
curl -sS --max-time 5 "http://localhost:3000/products/search?q=paracetamol&category=grocery" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | pp

# ─── 4. Search as grocery-only operator (should NOT see medicine)
echo ""
echo "── 4. Search 'paracetamol' as grocery-only op ─────────"
curl -sS --max-time 5 "http://localhost:3000/products/search?q=paracetamol" \
  -H "Authorization: Bearer $OP_GROCERY_TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
results = d['data']['data']
print(f'Total: {len(results)}')
for r in results:
    print(f\"  - {r['name']} (category={r['categorySlug']}, source={r['source']})\")
"

# ─── 5. Search as medicine-only operator (should NOT see grocery)
echo ""
echo "── 5. Search 'paracetamol' as medicine-only op ────────"
curl -sS --max-time 5 "http://localhost:3000/products/search?q=paracetamol" \
  -H "Authorization: Bearer $OP_MEDICINE_TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
results = d['data']['data']
print(f'Total: {len(results)}')
for r in results:
    print(f\"  - {r['name']} (category={r['categorySlug']}, source={r['source']})\")
"

# ─── 6. Search with a term that should fall through to ILIKE ─
echo ""
echo "── 6. Search 'basmati' (FTS misspelling → ILIKE) ───────"
curl -sS --max-time 5 "http://localhost:3000/products/search?q=basmati" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | pp

# ─── 7. Grocery operator tries to bypass with ?category=medicine
echo ""
echo "── 7. Grocery op requests ?category=medicine → 0 results"
curl -sS --max-time 5 "http://localhost:3000/products/search?q=paracetamol&category=medicine" \
  -H "Authorization: Bearer $OP_GROCERY_TOKEN" | pp

# ─── 8. Empty query → expect 400 ─────────────────────────────
echo ""
echo "── 8. Search with empty q → expect 400 ────────────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" "http://localhost:3000/products/search?q=" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
cat /tmp/r.json | pp

# ─── 9. Search 'amoxicillin' (medicine-specific) ─────────────
echo ""
echo "── 9. Search 'amoxicillin' as admin ────────────────────"
curl -sS --max-time 5 "http://localhost:3000/products/search?q=amoxicillin" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | pp

# ─── 10. Verify response shape has all required fields ──────
echo ""
echo "── 10. Verify response shape ───────────────────────────"
curl -sS --max-time 5 "http://localhost:3000/products/search?q=paracetamol&limit=1" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
r = d['data']['data'][0]
required = ['id', 'name', 'price', 'unit', 'vendorId', 'vendorName', 'vendorWhatsappNumber',
            'categoryId', 'categorySlug', 'categoryName', 'rank', 'source']
missing = [k for k in required if k not in r]
if missing:
    print(f'FAIL: missing fields {missing}')
    sys.exit(1)
print('All required fields present:')
for k in required:
    print(f'  ✓ {k}: {r[k]}')
"

echo ""
echo "═════════════════════════════════════════════════════════"
echo "  Done."
echo "═════════════════════════════════════════════════════════"

# Cleanup
echo ""
echo "Cleaning up test data..."
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db \
  -c "DELETE FROM products WHERE sku LIKE 'TEST-SEARCH-%';" > /dev/null 2>&1
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db \
  -c "DELETE FROM vendors WHERE id = $VENDOR_ID;" > /dev/null 2>&1
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db \
  -c "DELETE FROM users WHERE email IN ('op-grocery@rizqun.com', 'op-medicine@rizqun.com');" > /dev/null 2>&1
echo "   ✓ Cleaned up"

kill $SRV_PID 2>/dev/null
wait 2>/dev/null
echo "Done."
