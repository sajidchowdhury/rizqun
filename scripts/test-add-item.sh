#!/usr/bin/env bash
# One-shot add-item smoke test.
# Run with: bash scripts/test-add-item.sh

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
echo "  Rizqun — Add Item smoke test"
echo "═════════════════════════════════════════════════════════"

# ─── Bootstrap ─────────────────────────────────────────────────
echo ""
echo "── Setup: login as admin ────────────────────────────────"
ADMIN_LOGIN=$(curl -sS --max-time 5 -c $CJ -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@rizqun.com","password":"ChangeMeInProduction123!"}')
ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)
echo "   ✓ Admin token acquired"

# Create grocery-only operator (for category-scope test)
echo ""
echo "── Setup: create grocery-only operator ──────────────────"
curl -sS --max-time 5 -X POST http://localhost:3000/auth/register \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Op Grocery","email":"op-additem@rizqun.com","phone":"01711111111","password":"Password123","role":"user","categoryAccess":["grocery"]}' > /dev/null
OP_LOGIN=$(curl -sS --max-time 5 -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"op-additem@rizqun.com","password":"Password123"}')
OP_TOKEN=$(echo "$OP_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)
echo "   ✓ Grocery operator token acquired"

# Create vendor + grocery product + medicine product
echo ""
echo "── Setup: create vendor + products ───────────────────────"
VENDOR=$(curl -sS --max-time 5 -X POST http://localhost:3000/vendors \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Add Item Vendor","phone":"01733333333","category":"grocery"}')
VENDOR_ID=$(echo "$VENDOR" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['vendor']['id'])" 2>/dev/null)
GROCERY_ID=1
MEDICINE_ID=2
P_GROCERY=$(curl -sS --max-time 5 -X POST http://localhost:3000/products \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Rice 5kg\",\"price\":500.0,\"categoryId\":$GROCERY_ID,\"vendorId\":$VENDOR_ID}")
P_GROCERY_ID=$(echo "$P_GROCERY" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['product']['id'])" 2>/dev/null)
P_MEDICINE=$(curl -sS --max-time 5 -X POST http://localhost:3000/products \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Paracetamol\",\"price\":10.0,\"categoryId\":$MEDICINE_ID,\"vendorId\":$VENDOR_ID}")
P_MEDICINE_ID=$(echo "$P_MEDICINE" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['product']['id'])" 2>/dev/null)
echo "   ✓ Vendor=$VENDOR_ID, Grocery P=$P_GROCERY_ID, Medicine P=$P_MEDICINE_ID"

# Helper: create a pending order with 1 grocery item (qty=1 → subtotal=500)
create_order() {
  curl -sS --max-time 5 -X POST http://localhost:3000/orders \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H 'Content-Type: application/json' \
    -d "{\"customerName\":\"Test\",\"customerPhone\":\"01712345678\",\"deliveryFee\":30,\"items\":[{\"productId\":$P_GROCERY_ID,\"qty\":1}]}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['order']['id'])"
}

# ─── 1. POST /orders/:id/items without token → expect 401 ─────
echo ""
echo "── 1. POST without token → expect 401 ─────────────────"
O1_ID=$(create_order)
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST "http://localhost:3000/orders/$O1_ID/items" \
  -H 'Content-Type: application/json' \
  -d "{\"productId\":$P_GROCERY_ID,\"qty\":2}"
cat /tmp/r.json | pp

# ─── 2. Add item to pending order → expect 201 ────────────────
echo ""
echo "── 2. Add item (qty=2, price=500) → expect 201 ────────"
curl -sS --max-time 5 -X POST "http://localhost:3000/orders/$O1_ID/items" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"productId\":$P_GROCERY_ID,\"qty\":2}" > /tmp/r.json
cat /tmp/r.json | python3 -c "
import sys, json
d = json.load(sys.stdin)
o = d['data']['order']
print(f'  status: {d[\"message\"]}')
print(f'  items count: {len(o[\"items\"])} (expected 2)')
print(f'  subtotal: {o[\"subtotal\"]} (expected 1500 — 500 + 1000)')
print(f'  total: {o[\"total\"]} (expected 1530 — 1500 + 30 delivery)')
print(f'  deliveryFee: {o[\"deliveryFee\"]} (expected 30 — unchanged)')
# Verify the new item is marked addedAfterFinalize=true
new_item = o['items'][-1]
print(f'  new item addedAfterFinalize: {new_item[\"addedAfterFinalize\"]} (expected True)')
print(f'  new item name: {new_item[\"productNameSnapshot\"]}')
assert len(o['items']) == 2, f'expected 2 items, got {len(o[\"items\"])}'
assert o['subtotal'] == '1500', f'subtotal mismatch: {o[\"subtotal\"]}'
assert o['total'] == '1530', f'total mismatch: {o[\"total\"]}'
assert new_item['addedAfterFinalize'] == True, 'new item should have addedAfterFinalize=true'
print('  ✓ Item added, totals recomputed, addedAfterFinalize=true')
"

# ─── 3. Verify status_log audit row was inserted ─────────────
echo ""
echo "── 3. Verify status_log audit row ──────────────────────"
LOG_COUNT=$(PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db -tAc "SELECT count(*) FROM status_log WHERE order_id=$O1_ID;")
echo "   status_log rows: $LOG_COUNT (expected 2 — initial pending + added_item audit)"
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db -c "SELECT from_status, to_status, note FROM status_log WHERE order_id=$O1_ID ORDER BY id;" 2>&1 | head -8

# ─── 4. Add item to locked order (picked_up) → expect 409 ────
echo ""
echo "── 4. Add to picked_up order → expect 409 ──────────────"
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
echo "   ✓ Order $O2_ID moved to picked_up"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST "http://localhost:3000/orders/$O2_ID/items" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"productId\":$P_GROCERY_ID,\"qty\":1}"
cat /tmp/r.json | pp

# ─── 5. Add to delivered order → expect 409 ──────────────────
echo ""
echo "── 5. Add to delivered order → expect 409 ────────────"
curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$O2_ID/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"delivered"}' > /dev/null
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST "http://localhost:3000/orders/$O2_ID/items" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"productId\":$P_GROCERY_ID,\"qty\":1}"
cat /tmp/r.json | pp

# ─── 6. Add to cancelled order → expect 409 ──────────────────
echo ""
echo "── 6. Add to cancelled order → expect 409 ────────────"
O3_ID=$(create_order)
curl -sS --max-time 5 -X DELETE "http://localhost:3000/orders/$O3_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST "http://localhost:3000/orders/$O3_ID/items" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"productId\":$P_GROCERY_ID,\"qty\":1}"
cat /tmp/r.json | pp

# ─── 7. Add to waiting_vendor (editable) → expect 201 ────────
echo ""
echo "── 7. Add to waiting_vendor → expect 201 ─────────────"
O4_ID=$(create_order)
curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$O4_ID/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"waiting_vendor"}' > /dev/null
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST "http://localhost:3000/orders/$O4_ID/items" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"productId\":$P_GROCERY_ID,\"qty\":1}"
echo "   (should be 201 — waiting_vendor is editable)"

# ─── 8. Add to preparing (editable) → expect 201 ──────────────
echo ""
echo "── 8. Add to preparing → expect 201 ──────────────────"
curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$O4_ID/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"preparing"}' > /dev/null
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST "http://localhost:3000/orders/$O4_ID/items" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"productId\":$P_GROCERY_ID,\"qty\":1}"
echo "   (should be 201 — preparing is editable)"

# ─── 9. Add non-existent product → expect 400 ─────────────────
echo ""
echo "── 9. Add non-existent product → expect 400 ───────────"
O5_ID=$(create_order)
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST "http://localhost:3000/orders/$O5_ID/items" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"productId":99999,"qty":1}'
cat /tmp/r.json | pp

# ─── 10. Add with qty=0 → expect 400 ─────────────────────────
echo ""
echo "── 10. Add with qty=0 → expect 400 ───────────────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST "http://localhost:3000/orders/$O5_ID/items" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"productId\":$P_GROCERY_ID,\"qty\":0}"
cat /tmp/r.json | pp

# ─── 11. Grocery operator tries to add medicine → expect 403 ─
echo ""
echo "── 11. Grocery op tries medicine → expect 403 ────────"
O6_ID=$(curl -sS --max-time 5 -X POST http://localhost:3000/orders \
  -H "Authorization: Bearer $OP_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"customerName\":\"Op Order\",\"customerPhone\":\"01722222222\",\"items\":[{\"productId\":$P_GROCERY_ID,\"qty\":1}]}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['order']['id'])")
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST "http://localhost:3000/orders/$O6_ID/items" \
  -H "Authorization: Bearer $OP_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"productId\":$P_MEDICINE_ID,\"qty\":1}"
cat /tmp/r.json | pp

# ─── 12. Operator adds to own order (within category) → 201 ──
echo ""
echo "── 12. Grocery op adds grocery item to own → 201 ─────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST "http://localhost:3000/orders/$O6_ID/items" \
  -H "Authorization: Bearer $OP_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"productId\":$P_GROCERY_ID,\"qty\":3}"
echo "   (grocery op adding grocery item to own order should be 201)"

# ─── 13. Operator adds to other user's order → expect 404 ────
echo ""
echo "── 13. Op adds to admin's order → expect 404 ─────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST "http://localhost:3000/orders/$O1_ID/items" \
  -H "Authorization: Bearer $OP_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"productId\":$P_GROCERY_ID,\"qty\":1}"
cat /tmp/r.json | pp

# ─── 14. POST /orders/9999/items → expect 404 ─────────────────
echo ""
echo "── 14. POST /orders/9999/items → expect 404 ─────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST "http://localhost:3000/orders/9999/items" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"productId\":$P_GROCERY_ID,\"qty\":1}"
cat /tmp/r.json | pp

# ─── 15. Verify multi-add (3 items added in sequence) ────────
echo ""
echo "── 15. Multi-add sequence (verify totals stay consistent) ─"
O7_ID=$(create_order)
echo "   Initial: 1 item, subtotal=500, total=530"
for i in 1 2 3; do
  curl -sS --max-time 5 -X POST "http://localhost:3000/orders/$O7_ID/items" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H 'Content-Type: application/json' \
    -d "{\"productId\":$P_GROCERY_ID,\"qty\":1}" > /dev/null
done
curl -sS --max-time 5 "http://localhost:3000/orders/$O7_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
o = d['data']['order']
print(f'  After 3 adds: items={len(o[\"items\"])}, subtotal={o[\"subtotal\"]}, total={o[\"total\"]}')
print(f'  Expected: items=4, subtotal=2000, total=2030 (4 items × 500 + 30 delivery)')
assert len(o['items']) == 4, f'items mismatch: {len(o[\"items\"])}'
assert o['subtotal'] == '2000', f'subtotal mismatch: {o[\"subtotal\"]}'
assert o['total'] == '2030', f'total mismatch: {o[\"total\"]}'
new_count = sum(1 for i in o['items'] if i['addedAfterFinalize'])
print(f'  Items with addedAfterFinalize=true: {new_count} (expected 3)')
assert new_count == 3, f'new_count mismatch: {new_count}'
print('  ✓ Multi-add sequence consistent')
"

# ─── 16. Verify *NEW* badge appears in vendor-groups after add ─
echo ""
echo "── 16. Verify *NEW* badge in vendor-groups after add ──"
curl -sS --max-time 5 "http://localhost:3000/orders/$O7_ID/vendor-groups" \
  -H "Authorization: Bearer $ADMIN_TOKEN" > /tmp/vg.json
python3 -c "
import json
d = json.load(open('/tmp/vg.json'))
for g in d['data']['groups']:
    if '*NEW*' in g['copyText']:
        new_lines = [l for l in g['copyText'].split('\n') if '*NEW*' in l]
        print(f'✓ *NEW* badge found in vendor-groups copyText ({len(new_lines)} items)')
        for l in new_lines:
            print(f'  → {l.strip()}')
        break
    else:
        print('✗ FAIL: *NEW* badge missing from vendor-groups')
        exit(1)
"

echo ""
echo "═════════════════════════════════════════════════════════"
echo "  Done."
echo "═════════════════════════════════════════════════════════"

# Cleanup
echo ""
echo "Cleaning up test data..."
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db \
  -c "DELETE FROM status_log; DELETE FROM order_items; DELETE FROM orders; DELETE FROM products; DELETE FROM vendors; DELETE FROM users WHERE email='op-additem@rizqun.com';" > /dev/null 2>&1
echo "   ✓ Cleaned up"

kill $SRV_PID 2>/dev/null
wait 2>/dev/null
echo "Done."
