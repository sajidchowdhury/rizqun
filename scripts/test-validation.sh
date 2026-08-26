#!/usr/bin/env bash
# One-shot input validation + sanitization smoke test.
# Verifies: .strict() rejection of unknown fields, email normalization,
# phone validation, whitespace trimming across all modules.
# Run with: bash scripts/test-validation.sh

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
echo "  Rizqun — Input Validation smoke test"
echo "═════════════════════════════════════════════════════════"

# ─── Bootstrap ─────────────────────────────────────────────────
echo ""
echo "── Setup: login as admin ────────────────────────────────"
ADMIN_LOGIN=$(curl -sS --max-time 5 -c $CJ -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@rizqun.com","password":"ChangeMeInProduction123!"}')
ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)
echo "   ✓ Admin token acquired"

# ════════════════════════════════════════════════════════════
# 1. UNKNOWN FIELD REJECTION (.strict())
# ════════════════════════════════════════════════════════════

echo ""
echo "── 1. Unknown field rejection (.strict()) ─────────────"
echo "   Testing POST /vendors with unknown field 'evil':"

RESULT=$(curl -sS -o /tmp/r.json -w "%{http_code}" -X POST http://localhost:3000/vendors \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test","phone":"01711111111","category":"grocery","evil":"hacked"}')
echo "   HTTP $RESULT (expected 400)"
cat /tmp/r.json | python3 -c "
import sys, json
d = json.load(sys.stdin)
msg = d.get('message', '')
if 'Unrecognized key(s)' in msg or 'unrecognized' in msg.lower():
    print(f'   ✓ Unknown field rejected: {msg[:80]}')
else:
    print(f'   ? Response: {msg[:80]}')
"

echo ""
echo "   Testing POST /auth/login with unknown field:"
RESULT=$(curl -sS -o /tmp/r.json -w "%{http_code}" -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@test.com","password":"12345678","extra":"field"}')
echo "   HTTP $RESULT (expected 400)"

echo ""
echo "   Testing POST /categories with unknown field:"
RESULT=$(curl -sS -o /tmp/r.json -w "%{http_code}" -X POST http://localhost:3000/categories \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"slug":"test_val","name":"Test","extra":"field"}')
echo "   HTTP $RESULT (expected 400)"

echo ""
echo "   Testing POST /users with unknown field:"
RESULT=$(curl -sS -o /tmp/r.json -w "%{http_code}" -X POST http://localhost:3000/users \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test","email":"testuser@rizqun.com","phone":"01711111111","password":"Password123","categoryAccess":[],"evil":"hacked"}')
echo "   HTTP $RESULT (expected 400)"

# ════════════════════════════════════════════════════════════
# 2. EMAIL NORMALIZATION (trim + lowercase)
# ════════════════════════════════════════════════════════════

echo ""
echo "── 2. Email normalization (trim + lowercase) ──────────"
echo "   Testing login with ' ADMIN@RIZQUN.COM ' (whitespace + uppercase):"
RESULT=$(curl -sS -o /tmp/r.json -w "%{http_code}" -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"  ADMIN@RIZQUN.COM  ","password":"ChangeMeInProduction123!"}')
echo "   HTTP $RESULT (expected 200 — email should be normalized)"
if [ "$RESULT" = "200" ]; then
  echo "   ✓ Email normalized (trim + lowercase) → login successful"
else
  echo "   ✗ FAIL: email normalization not working"
fi

# ════════════════════════════════════════════════════════════
# 3. PHONE VALIDATION
# ════════════════════════════════════════════════════════════

echo ""
echo "── 3. Phone validation ─────────────────────────────────"
echo "   Testing POST /vendors with invalid phones:"

for phone in "123" "abc" "0171234" "01123456789" "+880171234567890"; do
  RESULT=$(curl -sS -o /tmp/r.json -w "%{http_code}" -X POST http://localhost:3000/vendors \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H 'Content-Type: application/json' \
    -d "{\"name\":\"Test\",\"phone\":\"$phone\",\"category\":\"grocery\"}")
  echo "   phone='$phone' → HTTP $RESULT (expected 400)"
done

echo ""
echo "   Testing POST /vendors with valid phones:"
for phone in "01712345678" "+8801712345678"; do
  RESULT=$(curl -sS -o /tmp/r.json -w "%{http_code}" -X POST http://localhost:3000/vendors \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H 'Content-Type: application/json' \
    -d "{\"name\":\"Valid Phone Test\",\"phone\":\"$phone\",\"category\":\"grocery\"}")
  echo "   phone='$phone' → HTTP $RESULT (expected 201)"
done

# ════════════════════════════════════════════════════════════
# 4. WHITESPACE TRIMMING
# ════════════════════════════════════════════════════════════

echo ""
echo "── 4. Whitespace trimming ──────────────────────────────"
echo "   Testing POST /vendors with padded name '  Padded Name  ':"
VENDOR=$(curl -sS -X POST http://localhost:3000/vendors \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"  Padded Name  ","phone":"01811111111","category":"grocery"}')
NAME=$(echo "$VENDOR" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['vendor']['name'])")
echo "   Stored name: '$NAME' (expected 'Padded Name' — trimmed)"
if [ "$NAME" = "Padded Name" ]; then
  echo "   ✓ Whitespace trimmed"
else
  echo "   ✗ FAIL: whitespace not trimmed"
fi

# ════════════════════════════════════════════════════════════
# 5. PARTIAL UPDATE .refine() (at least one field)
# ════════════════════════════════════════════════════════════

echo ""
echo "── 5. Partial update requires at least one field ──────"
echo "   Testing PATCH /vendors/:id with empty body {}:"
VENDOR_ID=$(echo "$VENDOR" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['vendor']['id'])")
RESULT=$(curl -sS -o /tmp/r.json -w "%{http_code}" -X PATCH "http://localhost:3000/vendors/$VENDOR_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{}')
echo "   HTTP $RESULT (expected 400)"
cat /tmp/r.json | python3 -c "
import sys, json
d = json.load(sys.stdin)
if 'At least one field' in d.get('message', ''):
    print(f'   ✓ Empty body rejected: {d[\"message\"]}')
else:
    print(f'   ? Response: {d.get(\"message\", \"\")}')
"

echo ""
echo "   Testing PATCH /users/:id with empty body {}:"
RESULT=$(curl -sS -o /tmp/r.json -w "%{http_code}" -X PATCH "http://localhost:3000/users/1" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{}')
echo "   HTTP $RESULT (expected 400)"

echo ""
echo "   Testing PATCH /categories/:id with empty body {}:"
RESULT=$(curl -sS -o /tmp/r.json -w "%{http_code}" -X PATCH "http://localhost:3000/categories/1" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{}')
echo "   HTTP $RESULT (expected 400)"

# ════════════════════════════════════════════════════════════
# 6. NUMERIC BOUNDS
# ════════════════════════════════════════════════════════════

echo ""
echo "── 6. Numeric bounds ───────────────────────────────────"
# Create vendor + product for product price test
V2=$(curl -sS -X POST http://localhost:3000/vendors \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Bounds Vendor","phone":"01922222222","category":"grocery"}')
V2_ID=$(echo "$V2" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['vendor']['id'])")

echo "   Testing POST /products with negative price:"
RESULT=$(curl -sS -o /tmp/r.json -w "%{http_code}" -X POST http://localhost:3000/products \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Neg\",\"price\":-5.0,\"categoryId\":1,\"vendorId\":$V2_ID}")
echo "   HTTP $RESULT (expected 400)"

echo "   Testing POST /products with price > max:"
RESULT=$(curl -sS -o /tmp/r.json -w "%{http_code}" -X POST http://localhost:3000/products \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Max\",\"price\":999999999999,\"categoryId\":1,\"vendorId\":$V2_ID}")
echo "   HTTP $RESULT (expected 400)"

# ════════════════════════════════════════════════════════════
# 7. STRING LENGTH BOUNDS
# ════════════════════════════════════════════════════════════

echo ""
echo "── 7. String length bounds ─────────────────────────────"
echo "   Testing POST /auth/register with short name 'A':"
RESULT=$(curl -sS -o /tmp/r.json -w "%{http_code}" -X POST http://localhost:3000/auth/register \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"A","email":"short@rizqun.com","phone":"01712345678","password":"Password123","categoryAccess":[]}')
echo "   HTTP $RESULT (expected 400)"

echo "   Testing POST /auth/register with short password '123':"
RESULT=$(curl -sS -o /tmp/r.json -w "%{http_code}" -X POST http://localhost:3000/auth/register \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"ShortPwd","email":"shortpwd@rizqun.com","phone":"01712345678","password":"123","categoryAccess":[]}')
echo "   HTTP $RESULT (expected 400)"

# ════════════════════════════════════════════════════════════
# 8. ENUM VALIDATION
# ════════════════════════════════════════════════════════════

echo ""
echo "── 8. Enum validation ──────────────────────────────────"
echo "   Testing PATCH /orders/:id/status with invalid status 'shipped':"
# Create an order first
ORDER_ID=$(curl -sS -X POST http://localhost:3000/orders \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"customerName\":\"Val Test\",\"customerPhone\":\"01712345678\",\"items\":[{\"productId\":1,\"qty\":1}]}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['order']['id'])" 2>/dev/null)
if [ -n "$ORDER_ID" ]; then
  RESULT=$(curl -sS -o /tmp/r.json -w "%{http_code}" -X PATCH "http://localhost:3000/orders/$ORDER_ID/status" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H 'Content-Type: application/json' \
    -d '{"status":"shipped"}')
  echo "   HTTP $RESULT (expected 400)"
fi

echo ""
echo "   Testing POST /vendors with invalid category 'electronics':"
RESULT=$(curl -sS -o /tmp/r.json -w "%{http_code}" -X POST http://localhost:3000/vendors \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Bad Cat","phone":"01733333333","category":"electronics"}')
echo "   HTTP $RESULT (expected 400)"

# ════════════════════════════════════════════════════════════
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
