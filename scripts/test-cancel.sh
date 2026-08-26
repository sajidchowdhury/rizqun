#!/usr/bin/env bash
# One-shot cancel-order smoke test.
# Run with: bash scripts/test-cancel.sh

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
echo "  Rizqun — Cancel Order smoke test"
echo "═════════════════════════════════════════════════════════"

# ─── Bootstrap ─────────────────────────────────────────────────
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
  -d '{"name":"Cancel Test Vendor","phone":"01733333333","category":"grocery"}')
VENDOR_ID=$(echo "$VENDOR" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['vendor']['id'])" 2>/dev/null)
GROCERY_ID=1
P1=$(curl -sS --max-time 5 -X POST http://localhost:3000/products \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Test Prod\",\"price\":50.0,\"categoryId\":$GROCERY_ID,\"vendorId\":$VENDOR_ID}")
P1_ID=$(echo "$P1" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['product']['id'])" 2>/dev/null)
echo "   ✓ Vendor=$VENDOR_ID Product=$P1_ID"

# Create operator (for scope tests)
echo ""
echo "── Setup: create operator ───────────────────────────────"
curl -sS --max-time 5 -X POST http://localhost:3000/auth/register \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Op","email":"op-cancel@rizqun.com","phone":"01711111111","password":"Password123","role":"user","categoryAccess":["all"]}' > /dev/null
OP_LOGIN=$(curl -sS --max-time 5 -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"op-cancel@rizqun.com","password":"Password123"}')
OP_TOKEN=$(echo "$OP_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)
echo "   ✓ Operator token acquired"

# Helper: create a pending order
create_order() {
  curl -sS --max-time 5 -X POST http://localhost:3000/orders \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H 'Content-Type: application/json' \
    -d "{\"customerName\":\"$1\",\"customerPhone\":\"01712345678\",\"items\":[{\"productId\":$P1_ID,\"qty\":1}]}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['order']['id'])"
}

# Helper: transition an order through statuses to a target state
move_to() {
  local id=$1
  local target=$2
  case $target in
    waiting_vendor)
      curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$id/status" \
        -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
        -d '{"status":"waiting_vendor"}' > /dev/null ;;
    preparing)
      curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$id/status" \
        -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
        -d '{"status":"waiting_vendor"}' > /dev/null
      curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$id/status" \
        -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
        -d '{"status":"preparing"}' > /dev/null ;;
    picked_up)
      curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$id/status" \
        -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
        -d '{"status":"waiting_vendor"}' > /dev/null
      curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$id/status" \
        -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
        -d '{"status":"preparing"}' > /dev/null
      curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$id/status" \
        -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
        -d '{"status":"picked_up"}' > /dev/null ;;
    delivered)
      curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$id/status" \
        -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
        -d '{"status":"waiting_vendor"}' > /dev/null
      curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$id/status" \
        -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
        -d '{"status":"preparing"}' > /dev/null
      curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$id/status" \
        -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
        -d '{"status":"picked_up"}' > /dev/null
      curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$id/status" \
        -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
        -d '{"status":"delivered"}' > /dev/null ;;
  esac
}

# ─── 1. DELETE /orders/:id without token → expect 401 ───────
echo ""
echo "── 1. DELETE without token → expect 401 ───────────────"
O1_ID=$(create_order "Test 1")
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X DELETE "http://localhost:3000/orders/$O1_ID"
cat /tmp/r.json | pp

# ─── 2. Cancel from pending → expect 200 ─────────────────────
echo ""
echo "── 2. Cancel from pending → expect 200 ───────────────"
O2_ID=$(create_order "Pending Cancel Test")
curl -sS --max-time 5 -X DELETE "http://localhost:3000/orders/$O2_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"note":"Customer changed mind"}' | pp

# Verify status_log row was inserted
echo "   status_log entries for this order:"
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db -c "SELECT from_status, to_status, note FROM status_log WHERE order_id=$O2_ID ORDER BY id;" 2>&1 | head -8

# ─── 3. Cancel from waiting_vendor → expect 200 ──────────────
echo ""
echo "── 3. Cancel from waiting_vendor → expect 200 ─────────"
O3_ID=$(create_order "Waiting Cancel Test")
move_to "$O3_ID" waiting_vendor
curl -sS --max-time 5 -X DELETE "http://localhost:3000/orders/$O3_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | pp

# ─── 4. Cancel from preparing → expect 200 ─────────────────────
echo ""
echo "── 4. Cancel from preparing → expect 200 ─────────────"
O4_ID=$(create_order "Preparing Cancel Test")
move_to "$O4_ID" preparing
curl -sS --max-time 5 -X DELETE "http://localhost:3000/orders/$O4_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | pp

# ─── 5. Cancel from picked_up → expect 409 (locked) ──────────
echo ""
echo "── 5. Cancel from picked_up → expect 409 (locked) ────"
O5_ID=$(create_order "Picked Up Cancel Test")
move_to "$O5_ID" picked_up
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X DELETE "http://localhost:3000/orders/$O5_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
cat /tmp/r.json | pp

# ─── 6. Cancel from delivered → expect 409 (terminal) ────────
echo ""
echo "── 6. Cancel from delivered → expect 409 ─────────────"
O6_ID=$(create_order "Delivered Cancel Test")
move_to "$O6_ID" delivered
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X DELETE "http://localhost:3000/orders/$O6_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
cat /tmp/r.json | pp

# ─── 7. Cancel already-cancelled order → expect 409 ──────────
echo ""
echo "── 7. Cancel already-cancelled → expect 409 ──────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X DELETE "http://localhost:3000/orders/$O2_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
cat /tmp/r.json | pp

# ─── 8. Cancel non-existent order → expect 404 ────────────────
echo ""
echo "── 8. DELETE /orders/9999 → expect 404 ────────────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X DELETE "http://localhost:3000/orders/9999" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
cat /tmp/r.json | pp

# ─── 9. Operator cancels own order → expect 200 ──────────────
echo ""
echo "── 9. Operator cancels own order → expect 200 ────────"
O7_ID=$(curl -sS --max-time 5 -X POST http://localhost:3000/orders \
  -H "Authorization: Bearer $OP_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"customerName\":\"Op Own\",\"customerPhone\":\"01722222222\",\"items\":[{\"productId\":$P1_ID,\"qty\":1}]}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['order']['id'])")
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X DELETE "http://localhost:3000/orders/$O7_ID" \
  -H "Authorization: Bearer $OP_TOKEN"
cat /tmp/r.json | pp

# ─── 10. Operator tries to cancel other's order → 404 ────────
echo ""
echo "── 10. Op cancels other's order → expect 404 ─────────"
O8_ID=$(create_order "Admin's Order")
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X DELETE "http://localhost:3000/orders/$O8_ID" \
  -H "Authorization: Bearer $OP_TOKEN"
cat /tmp/r.json | pp

# ─── 11. Cancel with no body (note defaults to 'Order cancelled')
echo ""
echo "── 11. Cancel with no body → default note ─────────────"
O9_ID=$(create_order "No Body Test")
curl -sS --max-time 5 -X DELETE "http://localhost:3000/orders/$O9_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | pp
echo "   Verify default note saved:"
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db -tAc "SELECT note FROM status_log WHERE order_id=$O9_ID AND to_status='cancelled';"

# ─── 12. Verify order NOT physically deleted (row still exists)
echo ""
echo "── 12. Verify cancelled order still in DB (soft delete) ─"
ROW_COUNT=$(PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db -tAc "SELECT count(*) FROM orders WHERE id=$O2_ID;")
echo "   Row count for cancelled order $O2_ID: $ROW_COUNT (expected 1)"
ITEM_COUNT=$(PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db -tAc "SELECT count(*) FROM order_items WHERE order_id=$O2_ID;")
echo "   Order items count: $ITEM_COUNT (expected 1 — items preserved)"
LOG_COUNT=$(PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db -tAc "SELECT count(*) FROM status_log WHERE order_id=$O2_ID;")
echo "   Status log rows: $LOG_COUNT (expected 2 — initial + cancel)"

# ─── 13. Verify cancelled order no longer appears in pending list
echo ""
echo "── 13. Cancelled order NOT in pending list ────────────"
PENDING_COUNT=$(curl -sS --max-time 5 "http://localhost:3000/orders/pending" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); ids=[o['id'] for o in d['data']['data']]; print(1 if $O2_ID in ids else 0)")
echo "   Cancelled order $O2_ID in pending list: $PENDING_COUNT (expected 0)"

echo ""
echo "═════════════════════════════════════════════════════════"
echo "  Done."
echo "═════════════════════════════════════════════════════════"

# Cleanup
echo ""
echo "Cleaning up test data..."
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db \
  -c "DELETE FROM status_log; DELETE FROM order_items; DELETE FROM orders; DELETE FROM products; DELETE FROM vendors; DELETE FROM users WHERE email='op-cancel@rizqun.com';" > /dev/null 2>&1
echo "   ✓ Cleaned up"

kill $SRV_PID 2>/dev/null
wait 2>/dev/null
echo "Done."
