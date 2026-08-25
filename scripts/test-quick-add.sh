#!/usr/bin/env bash
# One-shot quick-add endpoint smoke test.
# Run with: bash scripts/test-quick-add.sh

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

echo ""
echo "═════════════════════════════════════════════════════════"
echo "  Rizqun — Quick-Add smoke test"
echo "═════════════════════════════════════════════════════════"

# ─── Bootstrap ─────────────────────────────────────────────────
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
    "email":"op-quickadd@rizqun.com",
    "phone":"01711111111",
    "password":"Password123",
    "role":"user",
    "categoryAccess":["grocery"]
  }' > /dev/null
OP_LOGIN=$(curl -sS --max-time 5 -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"op-quickadd@rizqun.com","password":"Password123"}')
OP_TOKEN=$(echo "$OP_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)
echo "   ✓ Grocery operator token acquired"

# Create a vendor for product creation
echo ""
echo "── Setup: create test vendor ───────────────────────────"
VENDOR=$(curl -sS --max-time 5 -X POST http://localhost:3000/vendors \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"QuickAdd Test Vendor","phone":"01733333333","whatsappNumber":"8801733333333","category":"grocery"}')
VENDOR_ID=$(echo "$VENDOR" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['vendor']['id'])" 2>/dev/null)
echo "   ✓ Vendor id: $VENDOR_ID"

# ─── 1. POST /products/quick-add without token → expect 401 ──
echo ""
echo "── 1. Quick-add without token → expect 401 ──────────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST http://localhost:3000/products/quick-add \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Should Fail\",\"price\":10.0,\"vendorId\":$VENDOR_ID,\"categorySlug\":\"grocery\"}"
cat /tmp/r.json | pp

# ─── 2. Quick-add as grocery operator (in their category) ────
echo ""
echo "── 2. Quick-add as grocery operator → expect 201 ───────"
P1=$(curl -sS --max-time 5 -X POST http://localhost:3000/products/quick-add \
  -H "Authorization: Bearer $OP_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Maggi Noodles\",\"price\":25.0,\"vendorId\":$VENDOR_ID,\"categorySlug\":\"grocery\",\"unit\":\"packet\"}")
echo "$P1" | pp
P1_SKU=$(echo "$P1" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['product']['sku'])" 2>/dev/null)
echo "   ✓ Auto-generated SKU: $P1_SKU"

# ─── 3. Quick-add with explicit SKU ───────────────────────────
echo ""
echo "── 3. Quick-add with explicit SKU → expect 201 ─────────"
curl -sS --max-time 5 -X POST http://localhost:3000/products/quick-add \
  -H "Authorization: Bearer $OP_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Special Tea\",\"price\":120.0,\"vendorId\":$VENDOR_ID,\"categorySlug\":\"grocery\",\"sku\":\"CUSTOM-TEA-001\"}" | pp

# ─── 4. Grocery operator tries to add medicine product → 403 ─
echo ""
echo "── 4. Grocery operator tries medicine → expect 403 ────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST http://localhost:3000/products/quick-add \
  -H "Authorization: Bearer $OP_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Paracetamol Pill\",\"price\":5.0,\"vendorId\":$VENDOR_ID,\"categorySlug\":\"medicine\"}"
cat /tmp/r.json | pp

# ─── 5. Quick-add with nonexistent categorySlug → expect 400 ─
echo ""
echo "── 5. Quick-add with bad categorySlug → expect 400 ────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST http://localhost:3000/products/quick-add \
  -H "Authorization: Bearer $OP_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Bad Cat\",\"price\":5.0,\"vendorId\":$VENDOR_ID,\"categorySlug\":\"nonexistent\"}"
cat /tmp/r.json | pp

# ─── 6. Quick-add with nonexistent vendorId → expect 400 ─────
echo ""
echo "── 6. Quick-add with bad vendorId → expect 400 ────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST http://localhost:3000/products/quick-add \
  -H "Authorization: Bearer $OP_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Bad Vendor\",\"price\":5.0,\"vendorId\":99999,\"categorySlug\":\"grocery\"}"
cat /tmp/r.json | pp

# ─── 7. Quick-add with negative price → expect 400 ───────────
echo ""
echo "── 7. Quick-add negative price → expect 400 ───────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST http://localhost:3000/products/quick-add \
  -H "Authorization: Bearer $OP_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Neg Price\",\"price\":-5.0,\"vendorId\":$VENDOR_ID,\"categorySlug\":\"grocery\"}"
cat /tmp/r.json | pp

# ─── 8. Quick-add with duplicate SKU → expect 409 ─────────────
echo ""
echo "── 8. Quick-add duplicate SKU → expect 409 ────────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST http://localhost:3000/products/quick-add \
  -H "Authorization: Bearer $OP_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Dup SKU\",\"price\":5.0,\"vendorId\":$VENDOR_ID,\"categorySlug\":\"grocery\",\"sku\":\"CUSTOM-TEA-001\"}"
cat /tmp/r.json | pp

# ─── 9. Quick-add as super_admin (should work in any category)
echo ""
echo "── 9. Quick-add as super_admin → expect 201 ────────────"
curl -sS --max-time 5 -X POST http://localhost:3000/products/quick-add \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Admin Added Medicine\",\"price\":50.0,\"vendorId\":$VENDOR_ID,\"categorySlug\":\"medicine\"}" | pp

# ─── 10. Verify search finds the quick-added product ────────
echo ""
echo "── 10. Search 'Maggi' → should find the quick-added ────"
curl -sS --max-time 5 "http://localhost:3000/products/search?q=Maggi" \
  -H "Authorization: Bearer $OP_TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
results = d['data']['data']
print(f'Total: {len(results)}')
for r in results:
    print(f\"  - {r['name']} (sku={r.get('id')}, category={r['categorySlug']})\")
"

# ─── 11. Quick-add with deactivated vendor → expect 400 ────
echo ""
echo "── 11. Quick-add with deactivated vendor → 400 ─────────"
V2=$(curl -sS --max-time 5 -X POST http://localhost:3000/vendors \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Deactivated Vendor","phone":"01555555555","category":"grocery"}')
V2_ID=$(echo "$V2" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['vendor']['id'])" 2>/dev/null)
curl -sS --max-time 5 -X DELETE "http://localhost:3000/vendors/$V2_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST http://localhost:3000/products/quick-add \
  -H "Authorization: Bearer $OP_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Bad Vendor\",\"price\":5.0,\"vendorId\":$V2_ID,\"categorySlug\":\"grocery\"}"
cat /tmp/r.json | pp

# ─── 12. Quick-add with empty name → expect 400 ───────────────
echo ""
echo "── 12. Quick-add empty name → expect 400 ───────────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST http://localhost:3000/products/quick-add \
  -H "Authorization: Bearer $OP_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"\",\"price\":5.0,\"vendorId\":$VENDOR_ID,\"categorySlug\":\"grocery\"}"
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
  -c "DELETE FROM users WHERE email = 'op-quickadd@rizqun.com';" > /dev/null 2>&1
echo "   ✓ Cleaned up"

kill $SRV_PID 2>/dev/null
wait 2>/dev/null
echo "Done."
