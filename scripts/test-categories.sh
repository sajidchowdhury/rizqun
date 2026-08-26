#!/usr/bin/env bash
# One-shot category CRUD smoke test.
# Run with: bash scripts/test-categories.sh

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
echo "  Rizqun — Category CRUD smoke test"
echo "═════════════════════════════════════════════════════════"

# ─── Bootstrap ─────────────────────────────────────────────────
echo ""
echo "── Setup: login as admin ────────────────────────────────"
ADMIN_LOGIN=$(curl -sS --max-time 5 -c $CJ -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@rizqun.com","password":"ChangeMeInProduction123!"}')
ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)
echo "   ✓ Admin token acquired"

# Create a regular operator (for 403 tests)
echo ""
echo "── Setup: create regular operator ──────────────────────"
curl -sS --max-time 5 -X POST http://localhost:3000/auth/register \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Op","email":"op-cat@rizqun.com","phone":"01711111111","password":"Password123","role":"user","categoryAccess":["grocery"]}' > /dev/null
OP_LOGIN=$(curl -sS --max-time 5 -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"op-cat@rizqun.com","password":"Password123"}')
OP_TOKEN=$(echo "$OP_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)
echo "   ✓ Operator token acquired"

# ─── 1. GET /categories without token → expect 401 ───────────
echo ""
echo "── 1. GET /categories without token → expect 401 ──────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" http://localhost:3000/categories
cat /tmp/r.json | pp

# ─── 2. GET /categories as admin → expect 200 (seeded: grocery, medicine, other)
echo ""
echo "── 2. GET /categories as admin → expect 200 ────────────"
curl -sS --max-time 5 http://localhost:3000/categories \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
cats = d['data']['data']
print(f'  count: {len(cats)} (expected 3 — grocery, medicine, other)')
for c in cats:
    print(f'  - id={c[\"id\"]} slug={c[\"slug\"]} name={c[\"name\"]}')
assert len(cats) == 3, f'expected 3, got {len(cats)}'
"

# ─── 3. GET /categories as operator → expect 200 (read allowed) ─
echo ""
echo "── 3. GET /categories as operator → expect 200 ────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" http://localhost:3000/categories \
  -H "Authorization: Bearer $OP_TOKEN"
echo "   (operator should be able to list categories)"

# ─── 4. POST /categories as admin → expect 201 ───────────────
echo ""
echo "── 4. POST /categories (create 'baby_care') ───────────"
CAT1=$(curl -sS --max-time 5 -X POST http://localhost:3000/categories \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"slug":"baby_care","name":"Baby Care"}')
echo "$CAT1" | pp
CAT1_ID=$(echo "$CAT1" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['category']['id'])" 2>/dev/null)
echo "   ✓ Category id: $CAT1_ID"

# ─── 5. POST /categories as operator → expect 403 ────────────
echo ""
echo "── 5. POST /categories as operator → expect 403 ──────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST http://localhost:3000/categories \
  -H "Authorization: Bearer $OP_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"slug":"test","name":"Test"}'
cat /tmp/r.json | pp

# ─── 6. POST /categories with duplicate slug → 409 ──────────
echo ""
echo "── 6. POST /categories duplicate slug → expect 409 ────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST http://localhost:3000/categories \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"slug":"baby_care","name":"Another Baby Care"}'
cat /tmp/r.json | pp

# ─── 7. POST /categories with invalid slug (uppercase) → 400 ─
echo ""
echo "── 7. POST /categories invalid slug 'BabyCare' → 400 ──"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST http://localhost:3000/categories \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"slug":"BabyCare","name":"Baby Care"}'
cat /tmp/r.json | pp

# ─── 8. PATCH /categories/:id (update name) ──────────────────
echo ""
echo "── 8. PATCH /categories/$CAT1_ID (update name) ────────"
curl -sS --max-time 5 -X PATCH "http://localhost:3000/categories/$CAT1_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Baby & Toddler Care"}' | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'  name: {d[\"data\"][\"category\"][\"name\"]} (expected Baby & Toddler Care)')
assert d['data']['category']['name'] == 'Baby & Toddler Care', 'FAIL'
print('  ✓ Name updated')
"

# ─── 9. PATCH /categories/:id (update slug) ──────────────────
echo ""
echo "── 9. PATCH /categories/$CAT1_ID (update slug) ────────"
curl -sS --max-time 5 -X PATCH "http://localhost:3000/categories/$CAT1_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"slug":"baby_toddler"}' | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'  slug: {d[\"data\"][\"category\"][\"slug\"]} (expected baby_toddler)')
assert d['data']['category']['slug'] == 'baby_toddler', 'FAIL'
print('  ✓ Slug updated')
"

# ─── 10. PATCH with slug conflict → 409 ─────────────────────
echo ""
echo "── 10. PATCH slug conflict → expect 409 ────────────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X PATCH "http://localhost:3000/categories/$CAT1_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"slug":"grocery"}'
cat /tmp/r.json | pp

# ─── 11. PATCH empty body → 400 ─────────────────────────────
echo ""
echo "── 11. PATCH empty body → expect 400 ──────────────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X PATCH "http://localhost:3000/categories/$CAT1_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{}'
cat /tmp/r.json | pp

# ─── 12. DELETE /categories/:id as operator → 403 ────────────
echo ""
echo "── 12. DELETE as operator → expect 403 ────────────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X DELETE "http://localhost:3000/categories/$CAT1_ID" \
  -H "Authorization: Bearer $OP_TOKEN"
cat /tmp/r.json | pp

# ─── 13. DELETE empty category → expect 200 ──────────────────
echo ""
echo "── 13. DELETE empty category → expect 200 ──────────────"
curl -sS --max-time 5 -X DELETE "http://localhost:3000/categories/$CAT1_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | pp

# ─── 14. DELETE category with products → expect 409 ──────────
echo ""
echo "── 14. DELETE category with products → expect 409 ────"
# Create a fresh category + vendor + product for this test
CAT2=$(curl -sS --max-time 5 -X POST http://localhost:3000/categories \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"slug":"test_delete_me","name":"Test Delete Me"}')
CAT2_ID=$(echo "$CAT2" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['category']['id'])" 2>/dev/null)
V2=$(curl -sS --max-time 5 -X POST http://localhost:3000/vendors \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Cat Delete Vendor","phone":"01799999999","category":"other"}')
V2_ID=$(echo "$V2" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['vendor']['id'])" 2>/dev/null)
curl -sS --max-time 5 -X POST http://localhost:3000/products \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Cat Delete Product\",\"price\":10.0,\"categoryId\":$CAT2_ID,\"vendorId\":$V2_ID}" > /dev/null
echo "   ✓ Created category $CAT2_ID with 1 product"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X DELETE "http://localhost:3000/categories/$CAT2_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
cat /tmp/r.json | pp

# ─── 15. DELETE non-existent → 404 ──────────────────────────
echo ""
echo "── 15. DELETE /categories/9999 → expect 404 ────────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X DELETE "http://localhost:3000/categories/9999" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
cat /tmp/r.json | pp

# ─── 16. PATCH /categories/9999 → 404 ───────────────────────
echo ""
echo "── 16. PATCH /categories/9999 → expect 404 ────────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X PATCH "http://localhost:3000/categories/9999" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Nobody"}'
cat /tmp/r.json | pp

# ─── 17. Verify category was physically deleted ──────────────
echo ""
echo "── 17. Verify deleted category gone ───────────────────"
EXISTS=$(PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db -tAc "SELECT count(*) FROM categories WHERE id=$CAT1_ID;")
echo "   Row count for deleted category: $EXISTS (expected 0)"

# ─── 18. Verify response shape ───────────────────────────────
echo ""
echo "── 18. Verify response shape ───────────────────────────"
curl -sS --max-time 5 "http://localhost:3000/categories" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
c = d['data']['data'][0]
required = ['id', 'slug', 'name', 'createdAt', 'updatedAt']
missing = [k for k in required if k not in c]
if missing:
    print(f'FAIL: missing {missing}')
    exit(1)
print(f'  ✓ All fields present: {list(c.keys())}')
"

echo ""
echo "═════════════════════════════════════════════════════════"
echo "  Done."
echo "═════════════════════════════════════════════════════════"

# Cleanup
echo ""
echo "Cleaning up test data..."
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db \
  -c "DELETE FROM users WHERE email = 'op-cat@rizqun.com';" > /dev/null 2>&1
echo "   ✓ Cleaned up"

kill $SRV_PID 2>/dev/null
wait 2>/dev/null
echo "Done."
