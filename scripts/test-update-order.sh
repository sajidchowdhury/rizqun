#!/usr/bin/env bash
# One-shot update-order smoke test.
# Run with: bash scripts/test-update-order.sh

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
echo "  Rizqun — Update Order smoke test"
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
  -d '{"name":"Op","email":"op-update@rizqun.com","phone":"01711111111","password":"Password123","role":"user","categoryAccess":["all"]}' > /dev/null
OP_LOGIN=$(curl -sS --max-time 5 -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"op-update@rizqun.com","password":"Password123"}')
OP_TOKEN=$(echo "$OP_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)
echo "   ✓ Operator token acquired"

# Create vendor + product
echo ""
echo "── Setup: create vendor + product ───────────────────────"
VENDOR=$(curl -sS --max-time 5 -X POST http://localhost:3000/vendors \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Update Test Vendor","phone":"01733333333","category":"grocery"}')
VENDOR_ID=$(echo "$VENDOR" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['vendor']['id'])" 2>/dev/null)
GROCERY_ID=1
P1=$(curl -sS --max-time 5 -X POST http://localhost:3000/products \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Test Prod\",\"price\":100.0,\"categoryId\":$GROCERY_ID,\"vendorId\":$VENDOR_ID}")
P1_ID=$(echo "$P1" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['product']['id'])" 2>/dev/null)
echo "   ✓ Vendor=$VENDOR_ID Product=$P1_ID"

# Helper: create a pending order with deliveryFee=30
create_order() {
  curl -sS --max-time 5 -X POST http://localhost:3000/orders \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H 'Content-Type: application/json' \
    -d "{\"customerName\":\"Original Customer\",\"customerPhone\":\"01712345678\",\"customerAddress\":\"Original Address\",\"deliveryFee\":30,\"items\":[{\"productId\":$P1_ID,\"qty\":2}]}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['order']['id'])"
}

# ─── 1. PATCH /orders/:id without token → expect 401 ─────────
echo ""
echo "── 1. PATCH without token → expect 401 ───────────────"
O1_ID=$(create_order)
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X PATCH "http://localhost:3000/orders/$O1_ID" \
  -H 'Content-Type: application/json' \
  -d '{"customerName":"New Name"}'
cat /tmp/r.json | pp

# ─── 2. PATCH customerName on editable order → expect 200 ────
echo ""
echo "── 2. PATCH customerName → expect 200 ─────────────────"
curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$O1_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"customerName":"Updated Name"}' | python3 -c "
import sys, json
d = json.load(sys.stdin)
o = d['data']['order']
print(f'  customerName: {o[\"customerName\"]} (expected Updated Name)')
assert o['customerName'] == 'Updated Name', 'FAIL'
print('  ✓ customerName updated')
"

# ─── 3. PATCH customerPhone with valid BD number ──────────────
echo ""
echo "── 3. PATCH customerPhone (valid) → expect 200 ────────"
curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$O1_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"customerPhone":"01987654321"}' | python3 -c "
import sys, json
d = json.load(sys.stdin)
o = d['data']['order']
print(f'  customerPhone: {o[\"customerPhone\"]} (expected 01987654321)')
assert o['customerPhone'] == '01987654321', 'FAIL'
print('  ✓ customerPhone updated')
"

# ─── 4. PATCH customerPhone with invalid → expect 400 ────────
echo ""
echo "── 4. PATCH customerPhone invalid → expect 400 ────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X PATCH "http://localhost:3000/orders/$O1_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"customerPhone":"123"}'
cat /tmp/r.json | pp

# ─── 5. PATCH customerAddress (nullable field) ───────────────
echo ""
echo "── 5. PATCH customerAddress → expect 200 ───────────────"
curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$O1_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"customerAddress":"New Address, Block C"}' | python3 -c "
import sys, json
d = json.load(sys.stdin)
o = d['data']['order']
print(f'  customerAddress: {o[\"customerAddress\"]}')
assert o['customerAddress'] == 'New Address, Block C', 'FAIL'
print('  ✓ customerAddress updated')
"

# ─── 6. PATCH customerAddress to null ─────────────────────────
echo ""
echo "── 6. PATCH customerAddress null → expect 200 ─────────"
curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$O1_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"customerAddress":null}' | python3 -c "
import sys, json
d = json.load(sys.stdin)
o = d['data']['order']
print(f'  customerAddress: {o[\"customerAddress\"]} (expected None)')
assert o['customerAddress'] is None, 'FAIL'
print('  ✓ customerAddress cleared to null')
"

# ─── 7. PATCH deliveryFee → verify total recomputed ──────────
echo ""
echo "── 7. PATCH deliveryFee → total recompute ─────────────"
# Original: subtotal=200 (2*100) + deliveryFee=30 = total=230
# Change deliveryFee to 50 → total should be 250
curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$O1_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"deliveryFee":50}' | python3 -c "
import sys, json
d = json.load(sys.stdin)
o = d['data']['order']
print(f'  deliveryFee: {o[\"deliveryFee\"]} (expected 50)')
print(f'  total:       {o[\"total\"]} (expected 250 — subtotal 200 + deliveryFee 50)')
print(f'  subtotal:    {o[\"subtotal\"]} (expected 200 — unchanged)')
assert o['deliveryFee'] == '50', f'deliveryFee mismatch: {o[\"deliveryFee\"]}'
assert o['total'] == '250', f'total mismatch: {o[\"total\"]}'
assert o['subtotal'] == '200', f'subtotal mismatch: {o[\"subtotal\"]}'
print('  ✓ deliveryFee updated + total recomputed correctly')
"

# ─── 8. PATCH multiple fields at once ────────────────────────
echo ""
echo "── 8. PATCH multiple fields ────────────────────────────"
curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$O1_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"customerName":"Multi Update","customerPhone":"01811112222","deliveryFee":75}' | python3 -c "
import sys, json
d = json.load(sys.stdin)
o = d['data']['order']
print(f'  customerName: {o[\"customerName\"]} (expected Multi Update)')
print(f'  customerPhone: {o[\"customerPhone\"]} (expected 01811112222)')
print(f'  deliveryFee: {o[\"deliveryFee\"]} (expected 75)')
print(f'  total: {o[\"total\"]} (expected 275 — 200 + 75)')
assert o['customerName'] == 'Multi Update'
assert o['customerPhone'] == '01811112222'
assert o['deliveryFee'] == '75'
assert o['total'] == '275'
print('  ✓ Multiple fields updated atomically')
"

# ─── 9. PATCH with empty body → expect 400 ───────────────────
echo ""
echo "── 9. PATCH empty body → expect 400 ──────────────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X PATCH "http://localhost:3000/orders/$O1_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{}'
cat /tmp/r.json | pp

# ─── 10. PATCH on locked order (picked_up) → expect 409 ──────
echo ""
echo "── 10. PATCH on picked_up order → expect 409 ─────────"
O2_ID=$(create_order)
# Transition to picked_up
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
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X PATCH "http://localhost:3000/orders/$O2_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"customerName":"Should Fail"}'
cat /tmp/r.json | pp

# ─── 11. PATCH on delivered order → expect 409 ────────────────
echo ""
echo "── 11. PATCH on delivered order → expect 409 ────────"
# Move O2 from picked_up to delivered
curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$O2_ID/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"delivered"}' > /dev/null
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X PATCH "http://localhost:3000/orders/$O2_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"customerName":"Should Fail"}'
cat /tmp/r.json | pp

# ─── 12. PATCH on cancelled order → expect 409 ───────────────
echo ""
echo "── 12. PATCH on cancelled order → expect 409 ────────"
O3_ID=$(create_order)
curl -sS --max-time 5 -X DELETE "http://localhost:3000/orders/$O3_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X PATCH "http://localhost:3000/orders/$O3_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"customerName":"Should Fail"}'
cat /tmp/r.json | pp

# ─── 13. PATCH on waiting_vendor (editable) → expect 200 ─────
echo ""
echo "── 13. PATCH on waiting_vendor → expect 200 ──────────"
O4_ID=$(create_order)
curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$O4_ID/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"waiting_vendor"}' > /dev/null
curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$O4_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"customerName":"Waiting Vendor Update"}' | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'  status: {d[\"data\"][\"order\"][\"status\"]} (still waiting_vendor)')
print(f'  customerName: {d[\"data\"][\"order\"][\"customerName\"]}')
print('  ✓ Update allowed on waiting_vendor status')
"

# ─── 14. PATCH on preparing (editable) → expect 200 ──────────
echo ""
echo "── 14. PATCH on preparing → expect 200 ───────────────"
curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$O4_ID/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"preparing"}' > /dev/null
curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$O4_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"customerAddress":"Updated while preparing"}' | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'  status: {d[\"data\"][\"order\"][\"status\"]} (still preparing)')
print('  ✓ Update allowed on preparing status')
"

# ─── 15. PATCH /orders/9999 → expect 404 ──────────────────────
echo ""
echo "── 15. PATCH /orders/9999 → expect 404 ──────────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X PATCH "http://localhost:3000/orders/9999" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"customerName":"Whatever"}'
cat /tmp/r.json | pp

# ─── 16. Operator updates own order → expect 200 ─────────────
echo ""
echo "── 16. Op updates own order → expect 200 ────────────"
O5_ID=$(curl -sS --max-time 5 -X POST http://localhost:3000/orders \
  -H "Authorization: Bearer $OP_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"customerName\":\"Op Order\",\"customerPhone\":\"01722222222\",\"items\":[{\"productId\":$P1_ID,\"qty\":1}]}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['order']['id'])")
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X PATCH "http://localhost:3000/orders/$O5_ID" \
  -H "Authorization: Bearer $OP_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"customerName":"Op Updated"}'
echo "   (op updating own order should be 200)"

# ─── 17. Operator updates other's order → expect 404 ─────────
echo ""
echo "── 17. Op updates other's order → expect 404 ────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X PATCH "http://localhost:3000/orders/$O1_ID" \
  -H "Authorization: Bearer $OP_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"customerName":"Should Fail"}'
cat /tmp/r.json | pp

# ─── 18. PATCH negative deliveryFee → expect 400 ─────────────
echo ""
echo "── 18. PATCH negative deliveryFee → expect 400 ───────"
O6_ID=$(create_order)
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X PATCH "http://localhost:3000/orders/$O6_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"deliveryFee":-10}'
cat /tmp/r.json | pp

# ─── 19. Verify PATCH /:id/status still works (route ordering) ─
echo ""
echo "── 19. PATCH /:id/status still works (route ordering) ─"
curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$O6_ID/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"waiting_vendor"}' | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'  status: {d[\"data\"][\"order\"][\"status\"]} (expected waiting_vendor)')
assert d['data']['order']['status'] == 'waiting_vendor', 'FAIL'
print('  ✓ PATCH /:id/status still routes correctly (more specific path wins)')
"

echo ""
echo "═════════════════════════════════════════════════════════"
echo "  Done."
echo "═════════════════════════════════════════════════════════"

# Cleanup
echo ""
echo "Cleaning up test data..."
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db \
  -c "DELETE FROM status_log; DELETE FROM order_items; DELETE FROM orders; DELETE FROM products; DELETE FROM vendors; DELETE FROM users WHERE email='op-update@rizqun.com';" > /dev/null 2>&1
echo "   ✓ Cleaned up"

kill $SRV_PID 2>/dev/null
wait 2>/dev/null
echo "Done."
