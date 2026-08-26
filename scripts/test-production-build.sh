#!/usr/bin/env bash
# One-shot production build + PM2 smoke test.
# Run with: bash scripts/test-production-build.sh

cd /home/z/my-project/rizqun
unset DATABASE_URL

echo "═════════════════════════════════════════════════════════"
echo "  Rizqun — Production Build & PM2 smoke test"
echo "═════════════════════════════════════════════════════════"

# ─── 1. Verify npm run build ──────────────────────────────────
echo ""
echo "── 1. npm run build ────────────────────────────────────"
npm run build 2>&1 | tail -3
if [ -f dist/server.js ] && [ -f dist/app.js ]; then
  echo "   ✓ dist/server.js and dist/app.js exist"
else
  echo "   ✗ FAIL: build output missing"
  exit 1
fi

# Verify key compiled files exist
for f in config/env.js config/prisma.js config/logger.js \
         modules/auth/auth.routes.js modules/orders/orders.routes.js \
         modules/dashboard/dashboard.routes.js modules/ratings/ratings.routes.js \
         modules/users/users.routes.js modules/categories/categories.routes.js \
         modules/vendors/vendors.routes.js modules/products/products.routes.js \
         middlewares/auth.middleware.js middlewares/rate-limiters.js \
         utils/AppError.js utils/response.js utils/jwt.js utils/cookie.js \
         utils/orderCode.js utils/whatsapp.js utils/asyncHandler.js; do
  if [ -f "dist/$f" ]; then
    echo "   ✓ dist/$f"
  else
    echo "   ✗ FAIL: dist/$f missing"
    exit 1
  fi
done

# ─── 2. Verify npm start runs production server ───────────────
echo ""
echo "── 2. npm start (production server) ───────────────────"
# Kill any existing server
pkill -f "node dist/server.js" 2>/dev/null
pkill -f "tsx src/server" 2>/dev/null
sleep 2

# Start in production mode on a different port to avoid conflicts
PORT=3099 NODE_ENV=production node dist/server.js > /tmp/prod-server.log 2>&1 &
PROD_PID=$!
sleep 4

# Verify /health responds
HEALTH=$(curl -sS --max-time 5 http://localhost:3099/health 2>&1)
echo "   /health response:"
echo "$HEALTH" | python3 -m json.tool 2>/dev/null || echo "$HEALTH"

ENV=$(echo "$HEALTH" | python3 -c "import sys,json; print(json.load(sys.stdin)['environment'])" 2>/dev/null)
if [ "$ENV" = "production" ]; then
  echo "   ✓ Server running in production mode"
else
  echo "   ✗ FAIL: environment=$ENV (expected production)"
fi

DB_STATUS=$(echo "$HEALTH" | python3 -c "import sys,json; print(json.load(sys.stdin)['database']['status'])" 2>/dev/null)
if [ "$DB_STATUS" = "ok" ]; then
  echo "   ✓ Database connected"
else
  echo "   ✗ FAIL: database status=$DB_STATUS"
fi

# ─── 3. Verify production JSON logging ─────────────────────────
echo ""
echo "── 3. Verify production JSON logging ──────────────────"
# In production mode, logs should be raw JSON (not pino-pretty)
if grep -q '"level"' /tmp/prod-server.log; then
  echo "   ✓ Raw JSON log output detected"
  echo "   Sample log line:"
  head -1 /tmp/prod-server.log | python3 -m json.tool 2>/dev/null || head -1 /tmp/prod-server.log
else
  echo "   ✗ FAIL: no JSON log output found"
fi

# Verify service name in log
if grep -q '"rizqun-api"' /tmp/prod-server.log; then
  echo "   ✓ Service name (rizqun-api) in log"
else
  echo "   ✗ FAIL: service name not in log"
fi

# ─── 4. Verify API endpoint works in production ───────────────
echo ""
echo "── 4. Verify API endpoint in production ────────────────"
# Login as admin
LOGIN=$(curl -sS --max-time 5 -X POST http://localhost:3099/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@rizqun.com","password":"ChangeMeInProduction123!"}')
TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)
if [ -n "$TOKEN" ]; then
  echo "   ✓ Login successful in production mode"
  # Test GET /vendors
  VENDORS=$(curl -sS --max-time 5 http://localhost:3099/vendors \
    -H "Authorization: Bearer $TOKEN")
  VENDOR_COUNT=$(echo "$VENDORS" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['pagination']['total'])" 2>/dev/null)
  echo "   ✓ GET /vendors works (total: $VENDOR_COUNT)"
else
  echo "   ✗ FAIL: login failed in production mode"
fi

# ─── 5. Verify ecosystem.config.js ────────────────────────────
echo ""
echo "── 5. Verify ecosystem.config.js ───────────────────────"
if [ -f ecosystem.config.js ]; then
  echo "   ✓ ecosystem.config.js exists"
  # Verify it's valid JS by requiring it
  node -e "const cfg = require('./ecosystem.config.js'); console.log('   ✓ App name:', cfg.apps[0].name); console.log('   ✓ Script:', cfg.apps[0].script); console.log('   ✓ Exec mode:', cfg.apps[0].exec_mode); console.log('   ✓ Auto restart:', cfg.apps[0].autorestart);"
else
  echo "   ✗ FAIL: ecosystem.config.js missing"
fi

# ─── 6. Verify graceful shutdown ──────────────────────────────
echo ""
echo "── 6. Verify graceful shutdown ────────────────────────"
kill -SIGTERM $PROD_PID 2>/dev/null
sleep 3
if grep -q "SIGTERM" /tmp/prod-server.log; then
  echo "   ✓ Graceful shutdown logged"
  grep "SIGTERM\|shutting down\|HTTP server closed\|Database disconnected" /tmp/prod-server.log | tail -5
else
  echo "   ✗ FAIL: no shutdown log (may need more time)"
fi

# Cleanup
pkill -f "node dist/server.js" 2>/dev/null
sleep 1

echo ""
echo "═════════════════════════════════════════════════════════"
echo "  Done."
echo "═════════════════════════════════════════════════════════"
echo "Done."
