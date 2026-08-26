#!/usr/bin/env bash
# One-shot audit-log smoke test — comprehensive end-to-end verification
# of the status_log audit trail covering status transitions, item additions,
# item removals, and cancellations.
# Run with: bash scripts/test-audit-log.sh

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
echo "  Rizqun — Audit Log smoke test"
echo "═════════════════════════════════════════════════════════"

# ─── Bootstrap ─────────────────────────────────────────────────
echo ""
echo "── Setup: login as admin ────────────────────────────────"
ADMIN_LOGIN=$(curl -sS --max-time 5 -c $CJ -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@rizqun.com","password":"ChangeMeInProduction123!"}')
ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)
ADMIN_NAME=$(echo "$ADMIN_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['user']['name'])" 2>/dev/null)
echo "   ✓ Admin token acquired (name: $ADMIN_NAME)"

# Create operator (for scope test)
echo ""
echo "── Setup: create operator ───────────────────────────────"
curl -sS --max-time 5 -X POST http://localhost:3000/auth/register \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Op One","email":"op-audit@rizqun.com","phone":"01711111111","password":"Password123","role":"user","categoryAccess":["all"]}' > /dev/null
OP_LOGIN=$(curl -sS --max-time 5 -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"op-audit@rizqun.com","password":"Password123"}')
OP_TOKEN=$(echo "$OP_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)
OP_NAME=$(echo "$OP_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['user']['name'])" 2>/dev/null)
echo "   ✓ Operator token acquired (name: $OP_NAME)"

# Create vendor + product
echo ""
echo "── Setup: create vendor + product ───────────────────────"
VENDOR=$(curl -sS --max-time 5 -X POST http://localhost:3000/vendors \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Audit Vendor","phone":"01733333333","category":"grocery"}')
VENDOR_ID=$(echo "$VENDOR" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['vendor']['id'])" 2>/dev/null)
GROCERY_ID=1
P1=$(curl -sS --max-time 5 -X POST http://localhost:3000/products \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Audit Product\",\"price\":100.0,\"categoryId\":$GROCERY_ID,\"vendorId\":$VENDOR_ID}")
P1_ID=$(echo "$P1" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['product']['id'])" 2>/dev/null)
echo "   ✓ Vendor=$VENDOR_ID Product=$P1_ID"

# ─── 1. GET /orders/:id/audit-log without token → 401 ────────
echo ""
echo "── 1. GET audit-log without token → expect 401 ────────"
# Create a fresh order first
O1_ID=$(curl -sS --max-time 5 -X POST http://localhost:3000/orders \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"customerName\":\"Audit Test\",\"customerPhone\":\"01712345678\",\"items\":[{\"productId\":$P1_ID,\"qty\":1}]}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['order']['id'])")
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" "http://localhost:3000/orders/$O1_ID/audit-log"
cat /tmp/r.json | pp

# ─── 2. Fresh order → audit log has 1 entry (Order created) ──
echo ""
echo "── 2. Fresh order → audit log has 1 entry ─────────────"
curl -sS --max-time 5 "http://localhost:3000/orders/$O1_ID/audit-log" \
  -H "Authorization: Bearer $ADMIN_TOKEN" > /tmp/audit.json
python3 -c "
import json
d = json.load(open('/tmp/audit.json'))
print(f'  orderCode: {d[\"data\"][\"orderCode\"]}')
print(f'  entries count: {len(d[\"data\"][\"entries\"])} (expected 1)')
e = d['data']['entries'][0]
print(f'  entry[0]: from={e[\"fromStatus\"]} to={e[\"toStatus\"]} note={e[\"note\"]} by={e[\"changedByName\"]}')
assert len(d['data']['entries']) == 1, f'expected 1 entry, got {len(d[\"data\"][\"entries\"])}'
assert e['fromStatus'] is None, 'first entry should have null fromStatus'
assert e['toStatus'] == 'pending', f'first entry toStatus should be pending, got {e[\"toStatus\"]}'
assert e['note'] == 'Order created', f'note should be Order created, got {e[\"note\"]}'
assert e['changedByName'] == '$ADMIN_NAME', f'changedByName mismatch: {e[\"changedByName\"]}'
print('  ✓ Initial audit entry correct')
"

# ─── 3. After status transitions → 4 entries ─────────────────
echo ""
echo "── 3. After 3 transitions → 4 entries total ──────────"
for s in waiting_vendor preparing picked_up; do
  curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$O1_ID/status" \
    -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
    -d "{\"status\":\"$s\",\"note\":\"Transition to $s\"}" > /dev/null
done
curl -sS --max-time 5 "http://localhost:3000/orders/$O1_ID/audit-log" \
  -H "Authorization: Bearer $ADMIN_TOKEN" > /tmp/audit.json
python3 -c "
import json
d = json.load(open('/tmp/audit.json'))
entries = d['data']['entries']
print(f'  entries count: {len(entries)} (expected 4)')
for i, e in enumerate(entries):
    print(f'  [{i}] {e[\"fromStatus\"] or \"NULL\"} → {e[\"toStatus\"]}  note=\"{e[\"note\"]}\"  by={e[\"changedByName\"]}')
assert len(entries) == 4, f'expected 4 entries, got {len(entries)}'
# Verify chronological order (oldest first)
assert entries[0]['toStatus'] == 'pending'
assert entries[1]['toStatus'] == 'waiting_vendor'
assert entries[2]['toStatus'] == 'preparing'
assert entries[3]['toStatus'] == 'picked_up'
# Verify fromStatus chain
assert entries[1]['fromStatus'] == 'pending'
assert entries[2]['fromStatus'] == 'waiting_vendor'
assert entries[3]['fromStatus'] == 'preparing'
# Verify notes
assert entries[0]['note'] == 'Order created'
assert 'Transition to waiting_vendor' in entries[1]['note']
print('  ✓ All 4 transition entries correct, chronological order verified')
"

# ─── 4. Add item → audit log gets 'added_item' entry ────────
echo ""
echo "── 4. Add item → audit log gets 'added_item' entry ────"
# Create a new order for the add/remove test (O1 is locked at picked_up)
O2_ID=$(curl -sS --max-time 5 -X POST http://localhost:3000/orders \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"customerName\":\"Add/Remove Test\",\"customerPhone\":\"01722222222\",\"items\":[{\"productId\":$P1_ID,\"qty\":1}]}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['order']['id'])")
# Add 2 items
curl -sS --max-time 5 -X POST "http://localhost:3000/orders/$O2_ID/items" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d "{\"productId\":$P1_ID,\"qty\":2}" > /dev/null
curl -sS --max-time 5 -X POST "http://localhost:3000/orders/$O2_ID/items" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d "{\"productId\":$P1_ID,\"qty\":3}" > /dev/null
curl -sS --max-time 5 "http://localhost:3000/orders/$O2_ID/audit-log" \
  -H "Authorization: Bearer $ADMIN_TOKEN" > /tmp/audit.json
python3 -c "
import json
d = json.load(open('/tmp/audit.json'))
entries = d['data']['entries']
print(f'  entries count: {len(entries)} (expected 3 — created + 2 adds)')
for i, e in enumerate(entries):
    print(f'  [{i}] {e[\"fromStatus\"]} → {e[\"toStatus\"]}  note=\"{e[\"note\"]}\"')
assert len(entries) == 3, f'expected 3 entries, got {len(entries)}'
# Verify the add entries
assert entries[1]['note'].startswith('added_item:'), f'expected added_item note, got {entries[1][\"note\"]}'
assert entries[2]['note'].startswith('added_item:'), f'expected added_item note, got {entries[2][\"note\"]}'
assert 'qty=2' in entries[1]['note'], f'expected qty=2 in note, got {entries[1][\"note\"]}'
assert 'qty=3' in entries[2]['note'], f'expected qty=3 in note, got {entries[2][\"note\"]}'
# Verify fromStatus == toStatus for add operations (status unchanged)
assert entries[1]['fromStatus'] == entries[1]['toStatus'] == 'pending', 'add entry should keep status unchanged'
print('  ✓ added_item audit entries correct')
"

# ─── 5. Remove item → audit log gets 'removed_item' entry ───
echo ""
echo "── 5. Remove item → audit log gets 'removed_item' entry"
# Get the first item id (the original one from finalize)
ITEM_TO_REMOVE=$(curl -sS --max-time 5 "http://localhost:3000/orders/$O2_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['order']['items'][0]['id'])")
curl -sS --max-time 5 -X DELETE "http://localhost:3000/orders/$O2_ID/items/$ITEM_TO_REMOVE" \
  -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null
curl -sS --max-time 5 "http://localhost:3000/orders/$O2_ID/audit-log" \
  -H "Authorization: Bearer $ADMIN_TOKEN" > /tmp/audit.json
python3 -c "
import json
d = json.load(open('/tmp/audit.json'))
entries = d['data']['entries']
print(f'  entries count: {len(entries)} (expected 4 — created + 2 adds + 1 remove)')
last = entries[-1]
print(f'  last entry: {last[\"fromStatus\"]} → {last[\"toStatus\"]}  note=\"{last[\"note\"]}\"')
assert len(entries) == 4, f'expected 4 entries, got {len(entries)}'
assert last['note'].startswith('removed_item:'), f'expected removed_item note, got {last[\"note\"]}'
assert 'was:' in last['note'], f'expected was: in note, got {last[\"note\"]}'
print('  ✓ removed_item audit entry correct')
"

# ─── 6. Cancel order → audit log gets 'cancelled' entry ─────
echo ""
echo "── 6. Cancel order → audit log gets cancelled entry ───"
O3_ID=$(curl -sS --max-time 5 -X POST http://localhost:3000/orders \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"customerName\":\"Cancel Test\",\"customerPhone\":\"01733333333\",\"items\":[{\"productId\":$P1_ID,\"qty\":1}]}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['order']['id'])")
curl -sS --max-time 5 -X DELETE "http://localhost:3000/orders/$O3_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"note":"Customer changed mind"}' > /dev/null
curl -sS --max-time 5 "http://localhost:3000/orders/$O3_ID/audit-log" \
  -H "Authorization: Bearer $ADMIN_TOKEN" > /tmp/audit.json
python3 -c "
import json
d = json.load(open('/tmp/audit.json'))
entries = d['data']['entries']
print(f'  entries count: {len(entries)} (expected 2 — created + cancel)')
last = entries[-1]
print(f'  last entry: {last[\"fromStatus\"]} → {last[\"toStatus\"]}  note=\"{last[\"note\"]}\"')
assert len(entries) == 2, f'expected 2 entries, got {len(entries)}'
assert last['fromStatus'] == 'pending', f'expected fromStatus=pending, got {last[\"fromStatus\"]}'
assert last['toStatus'] == 'cancelled', f'expected toStatus=cancelled, got {last[\"toStatus\"]}'
assert last['note'] == 'Customer changed mind', f'note mismatch: {last[\"note\"]}'
print('  ✓ cancelled audit entry correct with custom note')
"

# ─── 7. Verify changedByName is denormalized correctly ───────
echo ""
echo "── 7. Verify changedByName denormalized ────────────────"
# Create an order as the operator, then have admin transition it
O4_ID=$(curl -sS --max-time 5 -X POST http://localhost:3000/orders \
  -H "Authorization: Bearer $OP_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"customerName\":\"Op Created\",\"customerPhone\":\"01744444444\",\"items\":[{\"productId\":$P1_ID,\"qty\":1}]}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['order']['id'])")
# Admin transitions to waiting_vendor
curl -sS --max-time 5 -X PATCH "http://localhost:3000/orders/$O4_ID/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"waiting_vendor","note":"Admin took over"}' > /dev/null
curl -sS --max-time 5 "http://localhost:3000/orders/$O4_ID/audit-log" \
  -H "Authorization: Bearer $ADMIN_TOKEN" > /tmp/audit.json
python3 -c "
import json
d = json.load(open('/tmp/audit.json'))
entries = d['data']['entries']
print(f'  entries count: {len(entries)} (expected 2 — created by Op + transition by Admin)')
print(f'  [0] by={entries[0][\"changedByName\"]} (expected $OP_NAME)')
print(f'  [1] by={entries[1][\"changedByName\"]} (expected $ADMIN_NAME)')
assert entries[0]['changedByName'] == '$OP_NAME', f'entry[0] changedByName mismatch'
assert entries[1]['changedByName'] == '$ADMIN_NAME', f'entry[1] changedByName mismatch'
print('  ✓ changedByName correctly denormalized per entry')
"

# ─── 8. Operator fetches own order's audit log → 200 ────────
echo ""
echo "── 8. Op fetches own audit log → expect 200 ───────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" "http://localhost:3000/orders/$O4_ID/audit-log" \
  -H "Authorization: Bearer $OP_TOKEN"
echo "   (op fetching own order's audit log should be 200)"

# ─── 9. Operator fetches other user's audit log → 404 ───────
echo ""
echo "── 9. Op fetches admin's audit log → expect 404 ────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" "http://localhost:3000/orders/$O1_ID/audit-log" \
  -H "Authorization: Bearer $OP_TOKEN"
cat /tmp/r.json | pp

# ─── 10. GET /orders/9999/audit-log → 404 ────────────────────
echo ""
echo "── 10. GET /orders/9999/audit-log → expect 404 ────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" "http://localhost:3000/orders/9999/audit-log" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
cat /tmp/r.json | pp

# ─── 11. Invalid order id → 400 ──────────────────────────────
echo ""
echo "── 11. Invalid order id → expect 400 ──────────────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" "http://localhost:3000/orders/abc/audit-log" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
cat /tmp/r.json | pp

# ─── 12. Verify response shape ────────────────────────────────
echo ""
echo "── 12. Verify response shape ───────────────────────────"
curl -sS --max-time 5 "http://localhost:3000/orders/$O2_ID/audit-log?limit=1" \
  -H "Authorization: Bearer $ADMIN_TOKEN" > /tmp/audit.json
python3 -c "
import json
d = json.load(open('/tmp/audit.json'))
e = d['data']['entries'][0]
required = ['id', 'orderId', 'fromStatus', 'toStatus', 'changedById', 'changedByName', 'note', 'changedAt']
missing = [k for k in required if k not in e]
if missing:
    print(f'FAIL: missing fields {missing}')
    exit(1)
print('All required fields present in audit log entry:')
for k in required:
    print(f'  ✓ {k}: {e[k]}')
"

# ─── 13. Query audit log via SQL for 'added_item' events ────
echo ""
echo "── 13. SQL query: all added_item events ────────────────"
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db -c \
  "SELECT order_id, note, changed_at FROM status_log WHERE note LIKE 'added_item:%' ORDER BY id;" 2>&1 | head -10

# ─── 14. Query audit log via SQL for 'removed_item' events ──
echo ""
echo "── 14. SQL query: all removed_item events ──────────────"
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db -c \
  "SELECT order_id, note, changed_at FROM status_log WHERE note LIKE 'removed_item:%' ORDER BY id;" 2>&1 | head -10

echo ""
echo "═════════════════════════════════════════════════════════"
echo "  Done."
echo "═════════════════════════════════════════════════════════"

# Cleanup
echo ""
echo "Cleaning up test data..."
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db \
  -c "DELETE FROM status_log; DELETE FROM order_items; DELETE FROM orders; DELETE FROM products; DELETE FROM vendors; DELETE FROM users WHERE email='op-audit@rizqun.com';" > /dev/null 2>&1
echo "   ✓ Cleaned up"

kill $SRV_PID 2>/dev/null
wait 2>/dev/null
echo "Done."
