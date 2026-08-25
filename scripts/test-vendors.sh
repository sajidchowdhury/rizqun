#!/usr/bin/env bash
# One-shot vendor CRUD smoke test — starts server, runs tests, kills server.
# Run with: bash scripts/test-vendors.sh

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
echo "  Rizqun — Vendor CRUD smoke test"
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

# Create a regular operator (for testing 403 cases)
echo ""
echo "── Setup: create operator user ───────────────────────────"
curl -sS --max-time 5 -X POST http://localhost:3000/auth/register \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "name":"Test Op",
    "email":"op-vendors@rizqun.com",
    "phone":"01712345678",
    "password":"Password123",
    "role":"user",
    "categoryAccess":["grocery"]
  }' > /dev/null
OP_LOGIN=$(curl -sS --max-time 5 -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"op-vendors@rizqun.com","password":"Password123"}')
OP_TOKEN=$(echo "$OP_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)
echo "   ✓ Operator token acquired"

# ─── 1. GET /vendors without auth → expect 401 ────────────────
echo ""
echo "── 1. GET /vendors without token → expect 401 ───────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" http://localhost:3000/vendors
cat /tmp/r.json | pp

# ─── 2. GET /vendors with admin token → expect 200 (empty list initially)
echo ""
echo "── 2. GET /vendors with admin token → expect 200 ────────"
curl -sS --max-time 5 http://localhost:3000/vendors \
  -H "Authorization: Bearer $ADMIN_TOKEN" | pp

# ─── 3. POST /vendors as operator → expect 403 ────────────────
echo ""
echo "── 3. POST /vendors as operator → expect 403 ────────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST http://localhost:3000/vendors \
  -H "Authorization: Bearer $OP_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Should Fail","phone":"01712345678","category":"grocery"}'
cat /tmp/r.json | pp

# ─── 4. POST /vendors as admin (create vendor 1) ──────────────
echo ""
echo "── 4. POST /vendors as admin (Hashem Grocery) ──────────"
V1=$(curl -sS --max-time 5 -X POST http://localhost:3000/vendors \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "name":"Hashem Grocery",
    "phone":"01711111111",
    "whatsappNumber":"8801711111111",
    "category":"grocery"
  }')
echo "$V1" | pp
V1_ID=$(echo "$V1" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['vendor']['id'])" 2>/dev/null)
echo "   ✓ Vendor 1 id: $V1_ID"

# ─── 5. POST /vendors with duplicate phone → expect 409 ────────
echo ""
echo "── 5. POST /vendors (duplicate phone) → expect 409 ──────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST http://localhost:3000/vendors \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Another Shop","phone":"01711111111","category":"grocery"}'
cat /tmp/r.json | pp

# ─── 6. POST /vendors with invalid phone → expect 400 ──────────
echo ""
echo "── 6. POST /vendors (invalid phone) → expect 400 ────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST http://localhost:3000/vendors \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Bad Phone","phone":"123","category":"grocery"}'
cat /tmp/r.json | pp

# ─── 7. POST /vendors with invalid whatsappNumber → expect 400
echo ""
echo "── 7. POST /vendors (invalid whatsapp number) → 400 ────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST http://localhost:3000/vendors \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Bad WA","phone":"01722222222","whatsappNumber":"+8801711111111","category":"grocery"}'
cat /tmp/r.json | pp

# ─── 8. POST /vendors as admin (create vendor 2 - medicine) ───
echo ""
echo "── 8. POST /vendors as admin (City Pharma) ──────────────"
V2=$(curl -sS --max-time 5 -X POST http://localhost:3000/vendors \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "name":"City Pharma",
    "phone":"01922222222",
    "whatsappNumber":"8801922222222",
    "category":"medicine"
  }')
echo "$V2" | pp
V2_ID=$(echo "$V2" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['vendor']['id'])" 2>/dev/null)
echo "   ✓ Vendor 2 id: $V2_ID"

# ─── 9. GET /vendors?category=grocery → expect 1 vendor ────────
echo ""
echo "── 9. GET /vendors?category=grocery → expect 1 vendor ──"
curl -sS --max-time 5 "http://localhost:3000/vendors?category=grocery" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | pp

# ─── 10. GET /vendors?search=Pharma → expect 1 vendor ──────────
echo ""
echo "── 10. GET /vendors?search=Pharma → expect 1 vendor ────"
curl -sS --max-time 5 "http://localhost:3000/vendors?search=Pharma" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | pp

# ─── 11. GET /vendors/:id → expect 200 ─────────────────────────
echo ""
echo "── 11. GET /vendors/$V1_ID → expect 200 ────────────────"
curl -sS --max-time 5 "http://localhost:3000/vendors/$V1_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | pp

# ─── 12. PATCH /vendors/:id (update name) ─────────────────────
echo ""
echo "── 12. PATCH /vendors/$V1_ID (update name) ──────────────"
curl -sS --max-time 5 -X PATCH "http://localhost:3000/vendors/$V1_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Hashem Grocery Store"}' | pp

# ─── 13. PATCH /vendors/:id with phone conflict → expect 409 ──
echo ""
echo "── 13. PATCH /vendors/$V1_ID (phone conflict) → 409 ───"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X PATCH "http://localhost:3000/vendors/$V1_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"01922222222"}'
cat /tmp/r.json | pp

# ─── 14. PATCH /vendors/:id with empty body → expect 400 ──────
echo ""
echo "── 14. PATCH /vendors/$V1_ID (empty body) → 400 ────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X PATCH "http://localhost:3000/vendors/$V1_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{}'
cat /tmp/r.json | pp

# ─── 15. DELETE /vendors/:id as operator → expect 403 ─────────
echo ""
echo "── 15. DELETE /vendors/$V2_ID as operator → expect 403 ─"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X DELETE "http://localhost:3000/vendors/$V2_ID" \
  -H "Authorization: Bearer $OP_TOKEN"
cat /tmp/r.json | pp

# ─── 16. DELETE /vendors/:id (no active products) → expect 200
echo ""
echo "── 16. DELETE /vendors/$V2_ID (no active products) ─────"
curl -sS --max-time 5 -X DELETE "http://localhost:3000/vendors/$V2_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | pp

# ─── 17. DELETE /vendors/:id again → expect 409 ──────────────
echo ""
echo "── 17. DELETE /vendors/$V2_ID again → expect 409 ──────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X DELETE "http://localhost:3000/vendors/$V2_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
cat /tmp/r.json | pp

# ─── 18. GET /vendors?isActive=false → expect City Pharma ─────
echo ""
echo "── 18. GET /vendors?isActive=false → expect 1 vendor ───"
curl -sS --max-time 5 "http://localhost:3000/vendors?isActive=false" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | pp

# ─── 19. GET /vendors/9999 (nonexistent) → expect 404 ─────────
echo ""
echo "── 19. GET /vendors/9999 → expect 404 ──────────────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" "http://localhost:3000/vendors/9999" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
cat /tmp/r.json | pp

# ─── 20. DELETE /vendors/:id with active product → expect 409 ─
# We need to create a vendor + product for this test.
echo ""
echo "── 20. DELETE vendor with active product → expect 409 ──"
V3=$(curl -sS --max-time 5 -X POST http://localhost:3000/vendors \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Has Product","phone":"01555555555","category":"grocery"}')
V3_ID=$(echo "$V3" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['vendor']['id'])" 2>/dev/null)
# Insert a product directly via psql (no product API yet)
# Note: updated_at is NOT NULL but Prisma manages it at app layer, so we set it explicitly
PGPASSWORD=rizqun_password /home/z/.local/pg-extract/client/usr/lib/postgresql/17/bin/psql \
  -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db \
  -c "INSERT INTO products (name, sku, price, category_id, vendor_id, unit, is_active, updated_at) VALUES ('Test Product', 'TEST-DELETE-ME', 10.00, 1, $V3_ID, 'pcs', true, CURRENT_TIMESTAMP);" > /dev/null 2>&1
echo "   ✓ Created vendor $V3_ID with 1 active product"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X DELETE "http://localhost:3000/vendors/$V3_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
cat /tmp/r.json | pp

echo ""
echo "═════════════════════════════════════════════════════════"
echo "  Done."
echo "═════════════════════════════════════════════════════════"

# Cleanup
echo ""
echo "Cleaning up test data..."
PGPASSWORD=rizqun_password /home/z/.local/pg-extract/client/usr/lib/postgresql/17/bin/psql \
  -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db \
  -c "DELETE FROM products WHERE sku = 'TEST-DELETE-ME';" > /dev/null 2>&1
PGPASSWORD=rizqun_password /home/z/.local/pg-extract/client/usr/lib/postgresql/17/bin/psql \
  -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db \
  -c "DELETE FROM vendors WHERE id IN ($V1_ID, $V2_ID, $V3_ID);" > /dev/null 2>&1
PGPASSWORD=rizqun_password /home/z/.local/pg-extract/client/usr/lib/postgresql/17/bin/psql \
  -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db \
  -c "DELETE FROM users WHERE email = 'op-vendors@rizqun.com';" > /dev/null 2>&1
echo "   ✓ Cleaned up"

kill $SRV_PID 2>/dev/null
wait 2>/dev/null
echo "Done."
