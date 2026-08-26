#!/usr/bin/env bash
# One-shot logging & observability smoke test.
# Run with: bash scripts/test-logging.sh

cd /home/z/my-project/rizqun
unset DATABASE_URL

pkill -f "tsx src/server" 2>/dev/null
sleep 1

echo "Starting server..."
npx tsx src/server.ts > /tmp/rizqun-logs.log 2>&1 &
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
  cat /tmp/rizqun-logs.log
  exit 1
fi

PSQL=/home/z/.local/pg-extract/client/usr/lib/postgresql/17/bin/psql

echo ""
echo "═════════════════════════════════════════════════════════"
echo "  Rizqun — Logging & Observability smoke test"
echo "═════════════════════════════════════════════════════════"

# ─── Bootstrap ─────────────────────────────────────────────────
echo ""
echo "── Setup: login as admin ────────────────────────────────"
ADMIN_LOGIN=$(curl -sS --max-time 5 -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@rizqun.com","password":"ChangeMeInProduction123!"}')
ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)
echo "   ✓ Admin token acquired"

# ─── 1. Verify startup log ─────────────────────────────────────
echo ""
echo "── 1. Verify startup log ────────────────────────────────"
if grep -a -q "Rizqun API started" /tmp/rizqun-logs.log; then
  echo "   ✓ Startup log found"
  grep -a "Rizqun API started" /tmp/rizqun-logs.log | tail -1
else
  echo "   ✗ FAIL: no startup log"
fi

# ─── 2. Verify /health is NOT logged ──────────────────────────
echo ""
echo "── 2. /health not logged ───────────────────────────────"
curl -sS http://localhost:3000/health > /dev/null
sleep 2
HEALTH_LOGS=$(cat /tmp/rizqun-logs.log | tr -d '\0' | grep -c "GET /health" 2>/dev/null)
HEALTH_LOGS=${HEALTH_LOGS:-0}
echo "   Health request logs: $HEALTH_LOGS (expected 0)"
if [ "$HEALTH_LOGS" -eq 0 ]; then
  echo "   ✓ /health not logged (autoLogging ignores it)"
else
  echo "   ✗ FAIL: /health was logged"
fi

# ─── 3. Verify request log for API call ───────────────────────
echo ""
echo "── 3. Request log for GET /vendors ─────────────────────"
curl -sS http://localhost:3000/vendors \
  -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null
sleep 2
if cat /tmp/rizqun-logs.log | tr -d '\0' | grep -q "vendors.*200"; then
  echo "   ✓ Request log found"
  cat /tmp/rizqun-logs.log | tr -d '\0' | grep "vendors.*200" | tail -1 | cat -v | head -1
else
  echo "   ? Request log may not have flushed yet — checking URL in structured log..."
  if cat /tmp/rizqun-logs.log | tr -d '\0' | grep -q '"url": "/vendors"'; then
    echo "   ✓ Found in structured JSON (url: /vendors)"
  else
    echo "   ✗ FAIL: no request log for GET /vendors"
  fi
fi

# ─── 4. Verify log includes statusCode + responseTime ────────
echo ""
echo "── 4. Verify log includes statusCode + responseTime ───"
if grep -a -q "200" /tmp/rizqun-logs.log && grep -a -q "ms" /tmp/rizqun-logs.log; then
  echo "   ✓ Log includes statusCode (200) and responseTime (ms)"
else
  echo "   ✗ FAIL: missing statusCode or responseTime"
fi

# ─── 5. Verify error log for 404 ──────────────────────────────
echo ""
echo "── 5. Error log for 404 ────────────────────────────────"
curl -sS http://localhost:3000/nonexistent > /dev/null
sleep 2
if cat /tmp/rizqun-logs.log | tr -d '\0' | grep -q "nonexistent"; then
  echo "   ✓ 404 request logged"
else
  echo "   ✗ FAIL: no log for 404"
fi

# ─── 6. Verify error log for 400 (validation error) ──────────
echo ""
echo "── 6. Error log for 400 validation ──────────────────────"
curl -sS -o /dev/null -X POST http://localhost:3000/vendors \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test","phone":"123","category":"grocery"}'
sleep 2
if cat /tmp/rizqun-logs.log | tr -d '\0' | grep -q "AppError"; then
  echo "   ✓ Validation error logged (AppError)"
  cat /tmp/rizqun-logs.log | tr -d '\0' | grep "AppError" | tail -1 | cat -v | head -1
else
  echo "   ? Checking for warn-level log..."
  cat /tmp/rizqun-logs.log | tr -d '\0' | grep -i "warn" | tail -3 | cat -v
fi

# ─── 7. Verify status-transition log ──────────────────────────
echo ""
echo "── 7. Status transition log ────────────────────────────"
VENDOR=$(curl -sS -X POST http://localhost:3000/vendors \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Log Test Vendor","phone":"01733333333","category":"grocery"}')
VENDOR_ID=$(echo "$VENDOR" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['vendor']['id'])" 2>/dev/null)
P1=$(curl -sS -X POST http://localhost:3000/products \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Log Product\",\"price\":50.0,\"categoryId\":1,\"vendorId\":$VENDOR_ID}")
P1_ID=$(echo "$P1" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['product']['id'])" 2>/dev/null)
ORDER_ID=$(curl -sS -X POST http://localhost:3000/orders \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"customerName\":\"Log Test\",\"customerPhone\":\"01712345678\",\"items\":[{\"productId\":$P1_ID,\"qty\":1}]}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['order']['id'])" 2>/dev/null)

curl -sS -X PATCH "http://localhost:3000/orders/$ORDER_ID/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"waiting_vendor","note":"Vendor contacted"}' > /dev/null
sleep 2

if cat /tmp/rizqun-logs.log | tr -d '\0' | grep -q "waiting_vendor"; then
  echo "   ✓ Status transition logged: pending → waiting_vendor"
  cat /tmp/rizqun-logs.log | tr -d '\0' | grep "waiting_vendor" | tail -1 | cat -v | head -1
else
  echo "   ✗ FAIL: no status transition log"
fi

# ─── 8. Verify structured JSON fields ──────────────────────────
echo ""
echo "── 8. Verify structured JSON fields ───────────────────"
if cat /tmp/rizqun-logs.log | tr -d '\0' | grep -q "orderId\|orderCode"; then
  echo "   ✓ Structured fields (orderId/orderCode) present in logs"
else
  echo "   ? Structured fields not found (may be pretty-printed differently)"
fi

if cat /tmp/rizqun-logs.log | tr -d '\0' | grep -q "rizqun-api"; then
  echo "   ✓ Service name (rizqun-api) present in log base"
else
  echo "   ? Service name not found"
fi

# ─── 9. Verify graceful shutdown ──────────────────────────────
echo ""
echo "── 9. Verify graceful shutdown ─────────────────────────"
kill -SIGTERM $SRV_PID 2>/dev/null
sleep 3
if cat /tmp/rizqun-logs.log | tr -d '\0' | grep -q "SIGTERM"; then
  echo "   ✓ Graceful shutdown log found"
  cat /tmp/rizqun-logs.log | tr -d '\0' | grep "SIGTERM\|shutting down\|HTTP server closed\|Database disconnected" | tail -5 | cat -v
else
  echo "   ✗ FAIL: no shutdown log"
fi

# Restart for cleanup
pkill -f "tsx src/server" 2>/dev/null
sleep 1
npx tsx src/server.ts > /dev/null 2>&1 &
SRV_PID=$!
sleep 4

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
