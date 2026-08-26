#!/usr/bin/env bash
# One-shot rating form + submit smoke test.
# Run with: bash scripts/test-rating-submit.sh

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
echo "  Rizqun — Rating Form + Submit smoke test"
echo "═════════════════════════════════════════════════════════"

# ─── Bootstrap: login as admin + create delivered order with rating token ──
echo ""
echo "── Setup: login as admin ────────────────────────────────"
ADMIN_LOGIN=$(curl -sS --max-time 5 -c $CJ -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@rizqun.com","password":"ChangeMeInProduction123!"}')
ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)
echo "   ✓ Admin token acquired"

# Create vendor + product
echo ""
echo "── Setup: create vendor + product ───────────────────────"
VENDOR=$(curl -sS --max-time 5 -X POST http://localhost:3000/vendors \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Rating Submit Vendor","phone":"01733333333","category":"grocery"}')
VENDOR_ID=$(echo "$VENDOR" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['vendor']['id'])" 2>/dev/null)
GROCERY_ID=1
P1=$(curl -sS --max-time 5 -X POST http://localhost:3000/products \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Rating Product\",\"price\":100.0,\"categoryId\":$GROCERY_ID,\"vendorId\":$VENDOR_ID}")
P1_ID=$(echo "$P1" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['product']['id'])" 2>/dev/null)

# Create + deliver an order, then generate rating link
echo ""
echo "── Setup: create delivered order + rating link ────────"
ORDER_ID=$(curl -sS --max-time 5 -X POST http://localhost:3000/orders \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"customerName\":\"Rating Customer\",\"customerPhone\":\"01712345678\",\"items\":[{\"productId\":$P1_ID,\"qty\":1}]}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['order']['id'])")
for s in waiting_vendor preparing picked_up delivered; do
  curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$ORDER_ID/status" \
    -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
    -d "{\"status\":\"$s\"}" > /dev/null
done
RATING_RESULT=$(curl -sS --max-time 5 -X POST "http://localhost:3000/orders/$ORDER_ID/rating-link" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
RATING_TOKEN=$(echo "$RATING_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['ratingToken'])" 2>/dev/null)
echo "   ✓ Order $ORDER_ID delivered, rating token: $RATING_TOKEN"

# ─── 1. GET /orders/rating-form/:token (public, no auth) ─────
echo ""
echo "── 1. GET /orders/rating-form/:token → expect 200 ─────"
curl -sS --max-time 5 "http://localhost:3000/orders/rating-form/$RATING_TOKEN" | pp

# ─── 2. GET /orders/rating-form/:token without token → 404 ──
echo ""
echo "── 2. GET /orders/rating-form/nonexistent → expect 404"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" "http://localhost:3000/orders/rating-form/nonexistent1234567890"
cat /tmp/r.json | pp

# ─── 3. POST /ratings with valid token → expect 201 ────────
echo ""
echo "── 3. POST /ratings → expect 201 ───────────────────────"
curl -sS --max-time 5 -X POST http://localhost:3000/ratings \
  -H 'Content-Type: application/json' \
  -d "{
    \"token\": \"$RATING_TOKEN\",
    \"overall\": 5,
    \"speed\": 4,
    \"behavior\": 5,
    \"comment\": \"Great service!\"
  }" | pp

# ─── 4. Verify token was cleared (form returns 404 now) ─────
echo ""
echo "── 4. GET form again (token consumed) → expect 404 ────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" "http://localhost:3000/orders/rating-form/$RATING_TOKEN"
cat /tmp/r.json | pp

# ─── 5. POST /ratings again (token consumed) → 404 ──────────
echo ""
echo "── 5. POST /ratings again (token consumed) → 404 ──────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST http://localhost:3000/ratings \
  -H 'Content-Type: application/json' \
  -d "{\"token\": \"$RATING_TOKEN\", \"overall\": 1, \"speed\": 1, \"behavior\": 1}"
cat /tmp/r.json | pp

# ─── 6. POST /ratings with invalid ratings (0) → 400 ────────
echo ""
echo "── 6. POST /ratings overall=0 → expect 400 ────────────"
# Need a fresh order + token
ORDER2_ID=$(curl -sS --max-time 5 -X POST http://localhost:3000/orders \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"customerName\":\"Test 2\",\"customerPhone\":\"01722222222\",\"items\":[{\"productId\":$P1_ID,\"qty\":1}]}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['order']['id'])")
for s in waiting_vendor preparing picked_up delivered; do
  curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$ORDER2_ID/status" \
    -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
    -d "{\"status\":\"$s\"}" > /dev/null
done
TOKEN2=$(curl -sS --max-time 5 -X POST "http://localhost:3000/orders/$ORDER2_ID/rating-link" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['ratingToken'])" 2>/dev/null)
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST http://localhost:3000/ratings \
  -H 'Content-Type: application/json' \
  -d "{\"token\": \"$TOKEN2\", \"overall\": 0, \"speed\": 4, \"behavior\": 5}"
cat /tmp/r.json | pp

# ─── 7. POST /ratings with rating=6 → expect 400 ─────────────
echo ""
echo "── 7. POST /ratings overall=6 → expect 400 ────────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST http://localhost:3000/ratings \
  -H 'Content-Type: application/json' \
  -d "{\"token\": \"$TOKEN2\", \"overall\": 6, \"speed\": 4, \"behavior\": 5}"
cat /tmp/r.json | pp

# ─── 8. POST /ratings with missing token → 400 ──────────────
echo ""
echo "── 8. POST /ratings (no token) → expect 400 ───────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST http://localhost:3000/ratings \
  -H 'Content-Type: application/json' \
  -d '{"overall": 5, "speed": 5, "behavior": 5}'
cat /tmp/r.json | pp

# ─── 9. POST /ratings with no comment → 201 ─────────────────
echo ""
echo "── 9. POST /ratings (no comment) → expect 201 ──────────"
curl -sS --max-time 5 -X POST http://localhost:3000/ratings \
  -H 'Content-Type: application/json' \
  -d "{\"token\": \"$TOKEN2\", \"overall\": 3, \"speed\": 3, \"behavior\": 4}" | pp

# ─── 10. Verify rating saved in DB ───────────────────────────
echo ""
echo "── 10. Verify rating saved in DB ──────────────────────"
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db \
  -c "SELECT order_id, overall, speed, behavior, comment FROM ratings WHERE order_id IN ($ORDER_ID, $ORDER2_ID) ORDER BY order_id;" 2>&1
echo ""
echo "   Verify tokens cleared:"
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db \
  -c "SELECT id, order_code, rating_token FROM orders WHERE id IN ($ORDER_ID, $ORDER2_ID);" 2>&1

# ─── 11. GET form returns only orderCode + customerName ─────
echo ""
echo "── 11. Verify form response shape (minimal data) ──────"
# Create a 3rd order for shape test
ORDER3_ID=$(curl -sS --max-time 5 -X POST http://localhost:3000/orders \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"customerName\":\"Shape Test\",\"customerPhone\":\"01733333333\",\"items\":[{\"productId\":$P1_ID,\"qty\":1}]}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['order']['id'])")
for s in waiting_vendor preparing picked_up delivered; do
  curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$ORDER3_ID/status" \
    -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
    -d "{\"status\":\"$s\"}" > /dev/null
done
TOKEN3=$(curl -sS --max-time 5 -X POST "http://localhost:3000/orders/$ORDER3_ID/rating-link" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['ratingToken'])" 2>/dev/null)
curl -sS --max-time 5 "http://localhost:3000/orders/rating-form/$TOKEN3" | python3 -c "
import sys, json
d = json.load(sys.stdin)
data = d['data']
print(f'  Fields: {list(data.keys())}')
assert 'orderCode' in data, 'missing orderCode'
assert 'customerName' in data, 'missing customerName'
# Verify NO sensitive fields leaked
forbidden = ['customerPhone', 'customerAddress', 'total', 'subtotal', 'userId', 'ratingToken', 'items']
for f in forbidden:
    assert f not in data, f'forbidden field leaked: {f}'
print(f'  ✓ Only orderCode + customerName returned (no sensitive data)')
print(f'  orderCode: {data[\"orderCode\"]}')
print(f'  customerName: {data[\"customerName\"]}')
"

echo ""
echo "═════════════════════════════════════════════════════════"
echo "  Done."
echo "═════════════════════════════════════════════════════════"

# Cleanup
echo ""
echo "Cleaning up test data..."
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db \
  -c "DELETE FROM ratings; DELETE FROM status_log; DELETE FROM order_items; DELETE FROM orders; DELETE FROM products; DELETE FROM vendors;" > /dev/null 2>&1
echo "   ✓ Cleaned up"

kill $SRV_PID 2>/dev/null
wait 2>/dev/null
echo "Done."
