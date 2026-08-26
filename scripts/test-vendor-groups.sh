#!/usr/bin/env bash
# One-shot vendor-groups smoke test.
# Run with: bash scripts/test-vendor-groups.sh

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
echo "  Rizqun — Vendor Groups smoke test"
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
  -d '{"name":"Op","email":"op-vg@rizqun.com","phone":"01711111111","password":"Password123","role":"user","categoryAccess":["all"]}' > /dev/null
OP_LOGIN=$(curl -sS --max-time 5 -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"op-vg@rizqun.com","password":"Password123"}')
OP_TOKEN=$(echo "$OP_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)
echo "   ✓ Operator token acquired"

# Create 2 vendors (1 with WhatsApp, 1 without)
echo ""
echo "── Setup: create 2 vendors ───────────────────────────────"
V1=$(curl -sS --max-time 5 -X POST http://localhost:3000/vendors \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Hashem Grocery","phone":"01711111111","whatsappNumber":"8801711111111","category":"grocery"}')
V1_ID=$(echo "$V1" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['vendor']['id'])" 2>/dev/null)
V2=$(curl -sS --max-time 5 -X POST http://localhost:3000/vendors \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"City Pharma","phone":"01922222222","category":"medicine"}')
V2_ID=$(echo "$V2" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['vendor']['id'])" 2>/dev/null)
echo "   ✓ V1=$V1_ID (with WhatsApp), V2=$V2_ID (no WhatsApp)"

# Create 3 products across 2 vendors
echo ""
echo "── Setup: create products across vendors ──────────────────"
GROCERY_ID=1
MEDICINE_ID=2
P1=$(curl -sS --max-time 5 -X POST http://localhost:3000/products \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Rice Basmati 5kg\",\"price\":850.0,\"categoryId\":$GROCERY_ID,\"vendorId\":$V1_ID,\"unit\":\"bag\"}")
P1_ID=$(echo "$P1" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['product']['id'])" 2>/dev/null)
P2=$(curl -sS --max-time 5 -X POST http://localhost:3000/products \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Sugar 1kg\",\"price\":95.0,\"categoryId\":$GROCERY_ID,\"vendorId\":$V1_ID,\"unit\":\"kg\"}")
P2_ID=$(echo "$P2" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['product']['id'])" 2>/dev/null)
P3=$(curl -sS --max-time 5 -X POST http://localhost:3000/products \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Paracetamol 500mg\",\"price\":10.0,\"categoryId\":$MEDICINE_ID,\"vendorId\":$V2_ID,\"unit\":\"box\"}")
P3_ID=$(echo "$P3" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['product']['id'])" 2>/dev/null)
echo "   ✓ P1,P2 (vendor 1), P3 (vendor 2)"

# Create a multi-vendor order: 2 items from V1, 1 item from V2
echo ""
echo "── Setup: create multi-vendor order ───────────────────────"
O1=$(curl -sS --max-time 5 -X POST http://localhost:3000/orders \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{
    \"customerName\":\"Rahim Uddin\",
    \"customerPhone\":\"01712345678\",
    \"customerAddress\":\"House 12, Road 5, Dhanmondi\",
    \"deliveryFee\":30,
    \"items\":[
      {\"productId\":$P1_ID,\"qty\":2},
      {\"productId\":$P2_ID,\"qty\":3},
      {\"productId\":$P3_ID,\"qty\":5}
    ]
  }")
O1_ID=$(echo "$O1" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['order']['id'])" 2>/dev/null)
O1_CODE=$(echo "$O1" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['order']['orderCode'])" 2>/dev/null)
echo "   ✓ Order $O1_ID ($O1_CODE) with 3 items across 2 vendors"

# Add a 4th item to V1 via direct SQL to test *NEW* badge
echo "   Adding a 4th item via psql to test *NEW* badge..."
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db \
  -c "INSERT INTO order_items (order_id, product_id, vendor_id, product_name_snapshot, price_snapshot, qty, line_total, added_after_finalize, added_at) VALUES ($O1_ID, $P2_ID, $V1_ID, 'Lentils (Masoor)', 120.00, 1, 120.00, true, NOW());" 2>&1
echo "   ✓ Added Lentils item with added_after_finalize=true"

# ─── 1. GET /orders/:id/vendor-groups without token → 401 ────
echo ""
echo "── 1. GET without token → expect 401 ───────────────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" "http://localhost:3000/orders/$O1_ID/vendor-groups"
cat /tmp/r.json | pp

# ─── 2. GET /orders/:id/vendor-groups → expect 2 groups ──────
echo ""
echo "── 2. GET /orders/$O1_ID/vendor-groups → expect 2 groups ─"
RESULT=$(curl -sS --max-time 5 "http://localhost:3000/orders/$O1_ID/vendor-groups" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
echo "$RESULT" | pp

# Save result to a file so Python can read it (avoids quoting issues)
echo "$RESULT" > /tmp/vg-result.json

# ─── 3. Verify group count + vendor IDs ───────────────────────
echo ""
echo "── 3. Verify groups ────────────────────────────────────"
python3 -c "
import json
d = json.load(open('/tmp/vg-result.json'))
groups = d['data']['groups']
print(f'Total groups: {len(groups)} (expected 2)')
for g in groups:
    print(f'  - vendorId={g[\"vendorId\"]} name={g[\"vendorName\"]} items={len(g[\"items\"])} subtotal={g[\"subtotal\"]}')
    print(f'    whatsappUrl present: {g[\"whatsappUrl\"] is not None}')
"

# ─── 4. Verify copyText contains *NEW* badge ──────────────────
echo ""
echo "── 4. Verify *NEW* badge in copyText ───────────────────"
python3 -c "
import json
d = json.load(open('/tmp/vg-result.json'))
# Find the vendor group that has the most items (vendor 1 has 3 items, vendor 2 has 1)
for g in d['data']['groups']:
    has_new = any(i['addedAfterFinalize'] for i in g['items'])
    if has_new:
        if '*NEW*' in g['copyText']:
            print('✓ *NEW* marker found in copyText')
            for line in g['copyText'].split('\n'):
                if '*NEW*' in line:
                    print(f'  → {line.strip()}')
        else:
            print('✗ FAIL: *NEW* marker missing')
            exit(1)
"

# ─── 5. Verify whatsappUrl format ─────────────────────────────
echo ""
echo "── 5. Verify whatsappUrl format ────────────────────────"
python3 -c "
import json
from urllib.parse import urlparse, parse_qs, unquote
d = json.load(open('/tmp/vg-result.json'))
for g in d['data']['groups']:
    if g['whatsappUrl'] is not None:
        url = g['whatsappUrl']
        print(f'whatsappUrl (first 80 chars): {url[:80]}...')
        parsed = urlparse(url)
        assert parsed.scheme == 'https', f'expected https, got {parsed.scheme}'
        assert parsed.netloc == 'wa.me', f'expected wa.me, got {parsed.netloc}'
        assert parsed.path.startswith('/8801'), f'unexpected path: {parsed.path}'
        assert 'text' in parse_qs(parsed.query), 'missing text param'
        text = unquote(parse_qs(parsed.query)['text'][0])
        assert 'Items:' in text, 'items section missing'
        print(f'✓ whatsappUrl format correct for {g[\"vendorName\"]}')
    else:
        print(f'✓ {g[\"vendorName\"]} has null whatsappUrl (no WhatsApp number)')
"

# ─── 6. Verify copyText structure ─────────────────────────────
echo ""
echo "── 6. Display copyText for vendor with most items ──────"
python3 -c "
import json
d = json.load(open('/tmp/vg-result.json'))
# Pick the group with most items
g = max(d['data']['groups'], key=lambda x: len(x['items']))
print('────────── copyText ──────────')
print(g['copyText'])
print('──────────────────────────────')
"

# ─── 7. Verify subtotal computation ───────────────────────────
echo ""
echo "── 7. Verify subtotal computation ──────────────────────"
python3 -c "
import json
from decimal import Decimal
d = json.load(open('/tmp/vg-result.json'))
for g in d['data']['groups']:
    computed = sum(Decimal(i['lineTotal']) for i in g['items'])
    expected = Decimal(g['subtotal'])
    if computed == expected:
        print(f'✓ Vendor {g[\"vendorName\"]}: subtotal={expected} (matches sum of items)')
    else:
        print(f'✗ FAIL: vendor {g[\"vendorName\"]} computed={computed} vs reported={expected}')
        exit(1)
"

# ─── 8. GET /orders/:id/vendor-groups as op (own order) ───────
echo ""
echo "── 8. Op's own order → expect 200 ─────────────────────"
O2=$(curl -sS --max-time 5 -X POST http://localhost:3000/orders \
  -H "Authorization: Bearer $OP_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"customerName\":\"Op Customer\",\"customerPhone\":\"01799999999\",\"items\":[{\"productId\":$P1_ID,\"qty\":1}]}")
O2_ID=$(echo "$O2" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['order']['id'])" 2>/dev/null)
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" "http://localhost:3000/orders/$O2_ID/vendor-groups" \
  -H "Authorization: Bearer $OP_TOKEN"
echo "   (op fetching own order should be 200)"

# ─── 9. Op tries other user's order → expect 404 ─────────────
echo ""
echo "── 9. Op fetches admin's order → expect 404 ───────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" "http://localhost:3000/orders/$O1_ID/vendor-groups" \
  -H "Authorization: Bearer $OP_TOKEN"
cat /tmp/r.json | pp

# ─── 10. GET /orders/9999/vendor-groups → 404 ─────────────────
echo ""
echo "── 10. GET /orders/9999/vendor-groups → expect 404 ────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" "http://localhost:3000/orders/9999/vendor-groups" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
cat /tmp/r.json | pp

# ─── 11. Verify 'vendor-groups' not captured as :id ───────────
echo ""
echo "── 11. Verify 'vendor-groups' sub-path routing ────────"
echo "   (the /:id/vendor-groups route should not be captured by /:id alone)"

# ─── 12. Single-vendor order (only 1 group) ───────────────────
echo ""
echo "── 12. Single-vendor order → expect 1 group ───────────"
O3=$(curl -sS --max-time 5 -X POST http://localhost:3000/orders \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"customerName\":\"Single Vendor\",\"customerPhone\":\"01788888888\",\"items\":[{\"productId\":$P3_ID,\"qty\":2}]}")
O3_ID=$(echo "$O3" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['order']['id'])" 2>/dev/null)
curl -sS --max-time 5 "http://localhost:3000/orders/$O3_ID/vendor-groups" \
  -H "Authorization: Bearer $ADMIN_TOKEN" > /tmp/single-vg.json
python3 -c "
import json
d = json.load(open('/tmp/single-vg.json'))
groups = d['data']['groups']
print(f'Groups: {len(groups)} (expected 1)')
for g in groups:
    print(f'  - vendor={g[\"vendorName\"]} items={len(g[\"items\"])}')
"

echo ""
echo "═════════════════════════════════════════════════════════"
echo "  Done."
echo "═════════════════════════════════════════════════════════"

# Cleanup
echo ""
echo "Cleaning up test data..."
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db \
  -c "DELETE FROM status_log; DELETE FROM order_items; DELETE FROM orders; DELETE FROM products; DELETE FROM vendors; DELETE FROM users WHERE email='op-vg@rizqun.com';" > /dev/null 2>&1
echo "   ✓ Cleaned up"

kill $SRV_PID 2>/dev/null
wait 2>/dev/null
echo "Done."
