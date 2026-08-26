#!/usr/bin/env bash
# One-shot rating-link smoke test.
# Run with: bash scripts/test-rating-link.sh

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
echo "  Rizqun — Rating Link smoke test"
echo "═════════════════════════════════════════════════════════"

# ─── Bootstrap ─────────────────────────────────────────────────
echo ""
echo "── Setup: login as admin ────────────────────────────────"
ADMIN_LOGIN=$(curl -sS --max-time 5 -c $CJ -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@rizqun.com","password":"ChangeMeInProduction123!"}')
ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)
echo "   ✓ Admin token acquired"

# Create operator (for scope test)
echo ""
echo "── Setup: create operator ───────────────────────────────"
curl -sS --max-time 5 -X POST http://localhost:3000/auth/register \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Op","email":"op-rating@rizqun.com","phone":"01711111111","password":"Password123","role":"user","categoryAccess":["all"]}' > /dev/null
OP_LOGIN=$(curl -sS --max-time 5 -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"op-rating@rizqun.com","password":"Password123"}')
OP_TOKEN=$(echo "$OP_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)
echo "   ✓ Operator token acquired"

# Create vendor + product
echo ""
echo "── Setup: create vendor + product ───────────────────────"
VENDOR=$(curl -sS --max-time 5 -X POST http://localhost:3000/vendors \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Rating Vendor","phone":"01733333333","category":"grocery"}')
VENDOR_ID=$(echo "$VENDOR" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['vendor']['id'])" 2>/dev/null)
GROCERY_ID=1
P1=$(curl -sS --max-time 5 -X POST http://localhost:3000/products \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Rating Product\",\"price\":100.0,\"categoryId\":$GROCERY_ID,\"vendorId\":$VENDOR_ID}")
P1_ID=$(echo "$P1" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['product']['id'])" 2>/dev/null)
echo "   ✓ Vendor=$VENDOR_ID Product=$P1_ID"

# Helper: create + deliver an order
create_delivered_order() {
  local token=$1
  local oid=$(curl -sS --max-time 5 -X POST http://localhost:3000/orders \
    -H "Authorization: Bearer $token" \
    -H 'Content-Type: application/json' \
    -d "{\"customerName\":\"Rating Test\",\"customerPhone\":\"01712345678\",\"items\":[{\"productId\":$P1_ID,\"qty\":1}]}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['order']['id'])")
  for s in waiting_vendor preparing picked_up delivered; do
    curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$oid/status" \
      -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
      -d "{\"status\":\"$s\"}" > /dev/null
  done
  echo $oid
}

# Helper: create a pending order (NOT delivered)
create_pending_order() {
  curl -sS --max-time 5 -X POST http://localhost:3000/orders \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H 'Content-Type: application/json' \
    -d "{\"customerName\":\"Pending\",\"customerPhone\":\"01712345678\",\"items\":[{\"productId\":$P1_ID,\"qty\":1}]}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['order']['id'])"
}

# ─── 1. POST /orders/:id/rating-link without token → 401 ─────
echo ""
echo "── 1. POST rating-link without token → expect 401 ─────"
D1_ID=$(create_delivered_order "$ADMIN_TOKEN")
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST "http://localhost:3000/orders/$D1_ID/rating-link"
cat /tmp/r.json | pp

# ─── 2. Generate rating link for delivered order → 200 ───────
echo ""
echo "── 2. Generate rating link → expect 200 ───────────────"
RESULT=$(curl -sS --max-time 5 -X POST "http://localhost:3000/orders/$D1_ID/rating-link" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
echo "$RESULT" | pp
echo "$RESULT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
r = d['data']
token = r['ratingToken']
url = r['url']
print(f'  orderCode: {r[\"orderCode\"]}')
print(f'  ratingToken: {token} (length={len(token)})')
print(f'  url: {url}')
assert len(token) == 32, f'token length should be 32, got {len(token)}'
assert all(c in '0123456789abcdef' for c in token), 'token should be hex'
assert url.startswith('http://localhost:3000/rate/'), f'url format wrong: {url}'
assert url.endswith(token), 'url should end with token'
print('  ✓ Token is 32-char hex, URL format correct')
"

# ─── 3. Idempotent: second call returns same token ──────────
echo ""
echo "── 3. Idempotent: second call → same token ───────────"
RESULT2=$(curl -sS --max-time 5 -X POST "http://localhost:3000/orders/$D1_ID/rating-link" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
TOKEN1=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['ratingToken'])")
TOKEN2=$(echo "$RESULT2" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['ratingToken'])")
if [ "$TOKEN1" = "$TOKEN2" ]; then
  echo "   ✓ Same token returned (idempotent)"
else
  echo "   ✗ FAIL: different tokens: $TOKEN1 vs $TOKEN2"
fi

# ─── 4. Generate for pending order → expect 400 ─────────────
echo ""
echo "── 4. Generate for pending order → expect 400 ────────"
P_ID=$(create_pending_order)
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST "http://localhost:3000/orders/$P_ID/rating-link" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
cat /tmp/r.json | pp

# ─── 5. Generate for cancelled order → expect 400 ────────────
echo ""
echo "── 5. Generate for cancelled order → expect 400 ──────"
C_ID=$(create_pending_order)
curl -sS --max-time 5 -X DELETE "http://localhost:3000/orders/$C_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST "http://localhost:3000/orders/$C_ID/rating-link" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
cat /tmp/r.json | pp

# ─── 6. Generate for non-existent order → 404 ────────────────
echo ""
echo "── 6. POST /orders/9999/rating-link → expect 404 ──────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST "http://localhost:3000/orders/9999/rating-link" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
cat /tmp/r.json | pp

# ─── 7. Operator generates for own delivered order → 200 ───
echo ""
echo "── 7. Op generates for own delivered order → 200 ──────"
D2_ID=$(create_delivered_order "$OP_TOKEN")
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST "http://localhost:3000/orders/$D2_ID/rating-link" \
  -H "Authorization: Bearer $OP_TOKEN"
echo "   (op generating for own delivered order should be 200)"

# ─── 8. Operator tries admin's order → 404 ──────────────────
echo ""
echo "── 8. Op tries admin's order → expect 404 ─────────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST "http://localhost:3000/orders/$D1_ID/rating-link" \
  -H "Authorization: Bearer $OP_TOKEN"
cat /tmp/r.json | pp

# ─── 9. Verify token saved in DB ──────────────────────────────
echo ""
echo "── 9. Verify token saved in DB ────────────────────────"
DB_TOKEN=$(PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db -tAc "SELECT rating_token FROM orders WHERE id=$D1_ID;")
echo "   DB rating_token: $DB_TOKEN"
if [ "$DB_TOKEN" = "$TOKEN1" ]; then
  echo "   ✓ Token matches DB"
else
  echo "   ✗ FAIL: DB token doesn't match"
fi

# ─── 10. Simulate rating submission (clear token) → 409 on next link ─
echo ""
echo "── 10. After rating submitted → expect 409 ────────────"
# Insert a rating via psql + clear the token
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db \
  -c "INSERT INTO ratings (order_id, overall, speed, behavior, comment, submitted_at) VALUES ($D1_ID, 5, 4, 5, 'Great!', NOW());" > /dev/null 2>&1
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db \
  -c "UPDATE orders SET rating_token = NULL WHERE id=$D1_ID;" > /dev/null 2>&1
echo "   ✓ Simulated rating submission + token cleared"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST "http://localhost:3000/orders/$D1_ID/rating-link" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
cat /tmp/r.json | pp

# ─── 11. Invalid order id → 400 ──────────────────────────────
echo ""
echo "── 11. Invalid order id → expect 400 ──────────────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST "http://localhost:3000/orders/abc/rating-link" \
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
  -c "DELETE FROM ratings; DELETE FROM status_log; DELETE FROM order_items; DELETE FROM orders; DELETE FROM products; DELETE FROM vendors; DELETE FROM users WHERE email='op-rating@rizqun.com';" > /dev/null 2>&1
echo "   ✓ Cleaned up"

kill $SRV_PID 2>/dev/null
wait 2>/dev/null
echo "Done."
