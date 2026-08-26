#!/usr/bin/env bash
# One-shot rate limiting + security hardening smoke test.
# Run with: bash scripts/test-rate-limits.sh

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

rm -f /tmp/r.json

pp() { python3 -m json.tool 2>/dev/null || cat; }

echo ""
echo "═════════════════════════════════════════════════════════"
echo "  Rizqun — Rate Limiting & Hardening smoke test"
echo "═════════════════════════════════════════════════════════"

# ─── 1. Verify helmet headers present ──────────────────────────
echo ""
echo "── 1. Verify helmet security headers ───────────────────"
HEADERS=$(curl -sS -I http://localhost:3000/health 2>&1)
echo "$HEADERS" | grep -i "x-content-type-options" > /dev/null && echo "   ✓ X-Content-Type-Options present" || echo "   ✗ X-Content-Type-Options missing"
echo "$HEADERS" | grep -i "cross-origin-opener-policy" > /dev/null && echo "   ✓ Cross-Origin-Opener-Policy present" || echo "   ✗ COOP missing"
echo "$HEADERS" | grep -i "cross-origin-resource-policy" > /dev/null && echo "   ✓ Cross-Origin-Resource-Policy present" || echo "   ✗ CORP missing"

# ─── 2. Verify CORS allowlist (good origin) ──────────────────
echo ""
echo "── 2. CORS: allowlisted origin ────────────────────────"
STATUS=$(curl -sS -o /dev/null -w "%{http_code}" -H "Origin: http://localhost:5173" http://localhost:3000/health)
CORS_HEADER=$(curl -sS -I -H "Origin: http://localhost:5173" http://localhost:3000/health 2>&1 | grep -i "access-control-allow-origin")
echo "   Status: $STATUS, CORS header: $CORS_HEADER"
if echo "$CORS_HEADER" | grep -q "localhost:5173"; then
  echo "   ✓ Allowlisted origin allowed"
else
  echo "   ✗ FAIL: allowlisted origin not echoed"
fi

# ─── 3. Verify CORS block (evil origin) ───────────────────────
echo ""
echo "── 3. CORS: blocked origin ────────────────────────────"
CORS_EVIL=$(curl -sS -I -H "Origin: https://evil.com" http://localhost:3000/health 2>&1 | grep -i "access-control-allow-origin")
echo "   evil.com CORS header: '${CORS_EVIL}' (should be empty or absent)"
if [ -z "$CORS_EVIL" ]; then
  echo "   ✓ Evil origin blocked (no CORS header returned)"
else
  echo "   ✗ FAIL: evil origin allowed"
fi

# ─── 4. Login rate limiter (5/15min) ──────────────────────────
echo ""
echo "── 4. Login rate limiter (5/15min) ────────────────────"
echo "   Sending 6 wrong login attempts..."
for i in 1 2 3 4 5 6; do
  CODE=$(curl -sS -o /tmp/r.json -w "%{http_code}" -X POST http://localhost:3000/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"email":"nobody@rizqun.com","password":"wrong"}')
  if [ "$i" -le 5 ]; then
    echo "   Attempt $i: HTTP $CODE (expected 401 — wrong creds)"
  else
    echo "   Attempt $i: HTTP $CODE (expected 429 — rate limited)"
    if [ "$CODE" = "429" ]; then
      echo "   ✓ Rate limiter kicked in on attempt 6"
    else
      echo "   ✗ FAIL: expected 429, got $CODE"
    fi
  fi
done

# ─── 5. General API rate limiter (100/min) ────────────────────
echo ""
echo "── 5. General API rate limiter (100/min) ──────────────"
echo "   Sending 105 requests to /auth/login (NOT skipped)..."
RATE_LIMITED=0
# Note: loginLimiter is separate (5/15min) and already triggered in test 4.
# The generalApiLimiter (100/min) is a DIFFERENT limiter — it should kick in
# independently. But since loginLimiter already blocks at 5, we can't send 100+
# login requests. Instead, use a different endpoint like /orders (401 without token,
# but counts toward the general limiter).
echo "   Sending 105 requests to /orders (returns 401 but counts for rate limit)..."
for i in $(seq 1 105); do
  CODE=$(curl -sS -o /dev/null -w "%{http_code}" http://localhost:3000/orders --max-time 2)
  if [ "$CODE" = "429" ]; then
    RATE_LIMITED=$((RATE_LIMITED + 1))
  fi
done
echo "   Rate-limited responses: $RATE_LIMITED (expected ~5 — 105-100=5 over limit)"
if [ "$RATE_LIMITED" -gt 0 ]; then
  echo "   ✓ General rate limiter kicked in after 100 requests"
else
  echo "   ✗ FAIL: no rate limiting observed"
fi

# ─── 6. /health still responds (skipped from rate limiter) ───
echo ""
echo "── 6. /health still responds after rate limit ────────"
CODE=$(curl -sS -o /dev/null -w "%{http_code}" http://localhost:3000/health --max-time 2)
echo "   /health: HTTP $CODE (should be 200 even though other routes are rate-limited)"
if [ "$CODE" = "200" ]; then
  echo "   ✓ /health skipped from general rate limiter"
else
  echo "   ✗ FAIL: /health should return 200"
fi

echo ""
echo "═════════════════════════════════════════════════════════"
echo "  Done."
echo "═════════════════════════════════════════════════════════"

kill $SRV_PID 2>/dev/null
wait 2>/dev/null
echo "Done."
