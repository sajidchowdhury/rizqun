#!/usr/bin/env bash
# One-shot remove-item smoke test.
# Run with: bash scripts/test-remove-item.sh

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
echo "  Rizqun — Remove Item smoke test"
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
  -d '{"name":"Op","email":"op-remove@rizqun.com","phone":"01711111111","password":"Password123","role":"user","categoryAccess":["all"]}' > /dev/null
OP_LOGIN=$(curl -sS --max-time 5 -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"op-remove@rizqun.com","password":"Password123"}')
OP_TOKEN=$(echo "$OP_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)
echo "   ✓ Operator token acquired"

# Create vendor + product
echo ""
echo "── Setup: create vendor + product ───────────────────────"
VENDOR=$(curl -sS --max-time 5 -X POST http://localhost:3000/vendors \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Remove Item Vendor","phone":"01733333333","category":"grocery"}')
VENDOR_ID=$(echo "$VENDOR" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['vendor']['id'])" 2>/dev/null)
GROCERY_ID=1
P1=$(curl -sS --max-time 5 -X POST http://localhost:3000/products \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Test Prod\",\"price\":100.0,\"categoryId\":$GROCERY_ID,\"vendorId\":$VENDOR_ID}")
P1_ID=$(echo "$P1" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['product']['id'])" 2>/dev/null)
echo "   ✓ Vendor=$VENDOR_ID Product=$P1_ID"

# Helper: create a pending order with 3 items (qty=1,2,3 → subtotal = 100+200+300 = 600)
create_order() {
  curl -sS --max-time 5 -X POST http://localhost:3000/orders \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H 'Content-Type: application/json' \
    -d "{\"customerName\":\"Test\",\"customerPhone\":\"01712345678\",\"deliveryFee\":50,\"items\":[{\"productId\":$P1_ID,\"qty\":1},{\"productId\":$P1_ID,\"qty\":2},{\"productId\":$P1_ID,\"qty\":3}]}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['order']['id'])"
}

# Helper: get the item id at index N (0-based) from an order
get_item_id() {
  local order_id=$1
  local index=$2
  curl -sS --max-time 5 "http://localhost:3000/orders/$order_id" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['order']['items'][$index]['id'])"
}

# ─── 1. DELETE /orders/:id/items/:itemId without token → 401 ──
echo ""
echo "── 1. DELETE without token → expect 401 ──────────────"
O1_ID=$(create_order)
ITEM_ID=$(get_item_id "$O1_ID" 1)
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X DELETE "http://localhost:3000/orders/$O1_ID/items/$ITEM_ID"
cat /tmp/r.json | pp

# ─── 2. Remove middle item → expect 200, totals recompute ────
echo ""
echo "── 2. Remove item (qty=2, price=100) → expect 200 ───"
echo "   Before: 3 items, subtotal=600, total=650 (delivery 50)"
curl -sS --max-time 5 -X DELETE "http://localhost:3000/orders/$O1_ID/items/$ITEM_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" > /tmp/r.json
cat /tmp/r.json | python3 -c "
import sys, json
d = json.load(sys.stdin)
o = d['data']['order']
print(f'  status: {d[\"message\"]}')
print(f'  items count: {len(o[\"items\"])} (expected 2 — removed the qty=2 item)')
print(f'  subtotal: {o[\"subtotal\"]} (expected 400 — 100 + 300)')
print(f'  total: {o[\"total\"]} (expected 450 — 400 + 50 delivery)')
print(f'  deliveryFee: {o[\"deliveryFee\"]} (expected 50 — unchanged)')
assert len(o['items']) == 2, f'items mismatch: {len(o[\"items\"])}'
assert o['subtotal'] == '400', f'subtotal mismatch: {o[\"subtotal\"]}'
assert o['total'] == '450', f'total mismatch: {o[\"total\"]}'
print('  ✓ Item removed, totals recomputed correctly')
"

# ─── 3. Verify status_log audit row ───────────────────────────
echo ""
echo "── 3. Verify status_log audit row ──────────────────────"
LOG_COUNT=$(PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db -tAc "SELECT count(*) FROM status_log WHERE order_id=$O1_ID;")
echo "   status_log rows: $LOG_COUNT (expected 2 — initial pending + removed_item audit)"
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db -c "SELECT from_status, to_status, note FROM status_log WHERE order_id=$O1_ID ORDER BY id;" 2>&1 | head -8

# ─── 4. Remove from locked order (picked_up) → expect 409 ────
echo ""
echo "── 4. Remove from picked_up → expect 409 ──────────────"
O2_ID=$(create_order)
curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$O2_ID/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"waiting_vendor"}' > /dev/null
curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$O2_ID/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"preparing"}' > /dev/null
curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$O2_ID/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"picked_up"}' > /dev/null
O2_ITEM_ID=$(get_item_id "$O2_ID" 0)
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X DELETE "http://localhost:3000/orders/$O2_ID/items/$O2_ITEM_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
cat /tmp/r.json | pp

# ─── 5. Remove from delivered → expect 409 ───────────────────
echo ""
echo "── 5. Remove from delivered → expect 409 ─────────────"
curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$O2_ID/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"delivered"}' > /dev/null
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X DELETE "http://localhost:3000/orders/$O2_ID/items/$O2_ITEM_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
cat /tmp/r.json | pp

# ─── 6. Remove from cancelled → expect 409 ───────────────────
echo ""
echo "── 6. Remove from cancelled → expect 409 ─────────────"
O3_ID=$(create_order)
curl -sS --max-time 5 -X DELETE "http://localhost:3000/orders/$O3_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null
O3_ITEM_ID=$(get_item_id "$O3_ID" 0)
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X DELETE "http://localhost:3000/orders/$O3_ID/items/$O3_ITEM_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
cat /tmp/r.json | pp

# ─── 7. Remove from waiting_vendor (editable) → 200 ──────────
echo ""
echo "── 7. Remove from waiting_vendor → expect 200 ────────"
O4_ID=$(create_order)
curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$O4_ID/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"waiting_vendor"}' > /dev/null
O4_ITEM_ID=$(get_item_id "$O4_ID" 0)
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X DELETE "http://localhost:3000/orders/$O4_ID/items/$O4_ITEM_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
echo "   (should be 200 — waiting_vendor is editable)"

# ─── 8. Remove from preparing (editable) → 200 ───────────────
echo ""
echo "── 8. Remove from preparing → expect 200 ──────────────"
curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$O4_ID/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"preparing"}' > /dev/null
O4_ITEM_ID=$(get_item_id "$O4_ID" 0)
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X DELETE "http://localhost:3000/orders/$O4_ID/items/$O4_ITEM_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
echo "   (should be 200 — preparing is editable)"

# ─── 9. Remove non-existent item → expect 404 ─────────────────
echo ""
echo "── 9. Remove non-existent item → expect 404 ───────────"
O5_ID=$(create_order)
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X DELETE "http://localhost:3000/orders/$O5_ID/items/99999" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
cat /tmp/r.json | pp

# ─── 10. Remove item that belongs to a different order → 404 ─
echo ""
echo "── 10. Remove item from different order → expect 404 ──"
# Get an item id from O1 (which has 2 items now) and try to delete it from O5
CROSS_ITEM_ID=$(get_item_id "$O1_ID" 0)
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X DELETE "http://localhost:3000/orders/$O5_ID/items/$CROSS_ITEM_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
cat /tmp/r.json | pp

# ─── 11. Remove last item → expect 409 ────────────────────────
echo ""
echo "── 11. Remove last item → expect 409 ────────────────"
O6_ID=$(create_order)
# Remove 2 of 3 items, leaving only 1
FIRST_ITEM=$(get_item_id "$O6_ID" 0)
SECOND_ITEM=$(get_item_id "$O6_ID" 1)
curl -sS --max-time 5 -X DELETE "http://localhost:3000/orders/$O6_ID/items/$FIRST_ITEM" \
  -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null
curl -sS --max-time 5 -X DELETE "http://localhost:3000/orders/$O6_ID/items/$SECOND_ITEM" \
  -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null
LAST_ITEM=$(get_item_id "$O6_ID" 0)
echo "   Only 1 item left — trying to remove it..."
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X DELETE "http://localhost:3000/orders/$O6_ID/items/$LAST_ITEM" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
cat /tmp/r.json | pp

# ─── 12. Remove from non-existent order → 404 ─────────────────
echo ""
echo "── 12. Remove from /orders/9999/items/1 → expect 404 ──"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X DELETE "http://localhost:3000/orders/9999/items/1" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
cat /tmp/r.json | pp

# ─── 13. Operator removes from own order → 200 ────────────────
echo ""
echo "── 13. Op removes from own order → expect 200 ────────"
O7_ID=$(curl -sS --max-time 5 -X POST http://localhost:3000/orders \
  -H "Authorization: Bearer $OP_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"customerName\":\"Op Order\",\"customerPhone\":\"01722222222\",\"items\":[{\"productId\":$P1_ID,\"qty\":1},{\"productId\":$P1_ID,\"qty\":1}]}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['order']['id'])")
O7_ITEM_ID=$(curl -sS --max-time 5 "http://localhost:3000/orders/$O7_ID" \
  -H "Authorization: Bearer $OP_TOKEN" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['order']['items'][0]['id'])")
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X DELETE "http://localhost:3000/orders/$O7_ID/items/$O7_ITEM_ID" \
  -H "Authorization: Bearer $OP_TOKEN"
echo "   (op removing from own order should be 200)"

# ─── 14. Op removes from other user's order → 404 ─────────────
echo ""
echo "── 14. Op removes from admin's order → expect 404 ────"
ADMIN_ITEM_ID=$(get_item_id "$O5_ID" 0)
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X DELETE "http://localhost:3000/orders/$O5_ID/items/$ADMIN_ITEM_ID" \
  -H "Authorization: Bearer $OP_TOKEN"
cat /tmp/r.json | pp

# ─── 15. Verify multi-remove sequence ─────────────────────────
echo ""
echo "── 15. Multi-remove sequence (3 items → 1 item) ──────"
O8_ID=$(create_order)
echo "   Initial: 3 items, subtotal=600, total=650"
# Remove 2 items
I1=$(get_item_id "$O8_ID" 0)
curl -sS --max-time 5 -X DELETE "http://localhost:3000/orders/$O8_ID/items/$I1" \
  -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null
I2=$(get_item_id "$O8_ID" 0)
curl -sS --max-time 5 -X DELETE "http://localhost:3000/orders/$O8_ID/items/$I2" \
  -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null
curl -sS --max-time 5 "http://localhost:3000/orders/$O8_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
o = d['data']['order']
print(f'  After 2 removes: items={len(o[\"items\"])}, subtotal={o[\"subtotal\"]}, total={o[\"total\"]}')
print(f'  Expected: items=1, subtotal=300, total=350 (qty=3 item kept)')
assert len(o['items']) == 1, f'items mismatch: {len(o[\"items\"])}'
assert o['subtotal'] == '300', f'subtotal mismatch: {o[\"subtotal\"]}'
assert o['total'] == '350', f'total mismatch: {o[\"total\"]}'
print('  ✓ Multi-remove sequence consistent')
"

# ─── 16. Invalid order id / item id format → 400 ──────────────
echo ""
echo "── 16. Invalid ids → expect 400 ──────────────────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X DELETE "http://localhost:3000/orders/abc/items/1" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
cat /tmp/r.json | pp
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X DELETE "http://localhost:3000/orders/1/items/xyz" \
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
  -c "DELETE FROM status_log; DELETE FROM order_items; DELETE FROM orders; DELETE FROM products; DELETE FROM vendors; DELETE FROM users WHERE email='op-remove@rizqun.com';" > /dev/null 2>&1
echo "   ✓ Cleaned up"

kill $SRV_PID 2>/dev/null
wait 2>/dev/null
echo "Done."
