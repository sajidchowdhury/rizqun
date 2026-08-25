#!/usr/bin/env bash
# One-shot auth+middleware test — starts server, runs tests, kills server.
# Run with: bash scripts/test-auth-full.sh

cd /home/z/my-project/rizqun
unset DATABASE_URL

# Kill any orphaned server from a previous run
pkill -f "tsx src/server" 2>/dev/null
sleep 1

# Start server
echo "Starting server..."
npx tsx src/server.ts > /tmp/rizqun.log 2>&1 &
SRV_PID=$!
trap "kill $SRV_PID 2>/dev/null; wait 2>/dev/null" EXIT

# Wait for server to boot
for i in 1 2 3 4 5 6 7 8 9 10; do
  sleep 1
  if curl -s -o /dev/null --max-time 2 http://localhost:3000/health; then
    echo "Server up (PID $SRV_PID)"
    break
  fi
done

if ! curl -s -o /dev/null --max-time 2 http://localhost:3000/health; then
  echo "FAILED to start server"
  echo "--- log ---"
  cat /tmp/rizqun.log
  exit 1
fi

CJ=/tmp/rizqun-cookies.txt
rm -f $CJ /tmp/r.json

# Helper: pretty-print JSON or raw text
pp() { python3 -m json.tool 2>/dev/null || cat; }

echo ""
echo "═════════════════════════════════════════════════════════"
echo "  Rizqun — Auth + Middleware smoke test"
echo "═════════════════════════════════════════════════════════"

echo ""
echo "── 1. POST /auth/login (admin) ──────────────────────────"
LOGIN=$(curl -sS --max-time 5 -c $CJ -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@rizqun.com","password":"ChangeMeInProduction123!"}')
echo "$LOGIN" | pp

ADMIN_ACCESS=$(echo "$LOGIN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['accessToken'])" 2>/dev/null || echo "")
echo "Admin access token (first 30 chars): ${ADMIN_ACCESS:0:30}..."

echo ""
echo "── 2. GET /auth/me (with valid admin token) ─────────────"
curl -sS --max-time 5 http://localhost:3000/auth/me \
  -H "Authorization: Bearer $ADMIN_ACCESS" | pp

echo ""
echo "── 3. GET /auth/me (no token → expect 401) ───────────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" http://localhost:3000/auth/me
cat /tmp/r.json | pp

echo ""
echo "── 4. GET /auth/me (malformed header → expect 401) ───────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" http://localhost:3000/auth/me \
  -H "Authorization: NotBearer foo"
cat /tmp/r.json | pp

echo ""
echo "── 5. GET /auth/me (?userId=2 fallback NO LONGER works) ─"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" "http://localhost:3000/auth/me?userId=2"
cat /tmp/r.json | pp

echo ""
echo "── 6. POST /auth/register (no token → expect 401) ────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST http://localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{
    "name":"Should Fail",
    "email":"fail1@rizqun.com",
    "phone":"01712345678",
    "password":"Password123",
    "categoryAccess":["grocery"]
  }'
cat /tmp/r.json | pp

echo ""
echo "── 7. Create a regular user via admin token ─────────────"
curl -sS --max-time 5 -X POST http://localhost:3000/auth/register \
  -H "Authorization: Bearer $ADMIN_ACCESS" \
  -H 'Content-Type: application/json' \
  -d '{
    "name":"Test Operator",
    "email":"operator@rizqun.com",
    "phone":"01712345678",
    "password":"Password123",
    "role":"user",
    "categoryAccess":["grocery"]
  }' | pp

echo ""
echo "── 8. Login as operator ──────────────────────────────────"
OP_LOGIN=$(curl -sS --max-time 5 -c /tmp/op-cookies.txt -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"operator@rizqun.com","password":"Password123"}')
echo "$OP_LOGIN" | pp
OP_ACCESS=$(echo "$OP_LOGIN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['accessToken'])" 2>/dev/null || echo "")
echo "Operator access token (first 30 chars): ${OP_ACCESS:0:30}..."

echo ""
echo "── 9. POST /auth/register as operator (expect 403) ──────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST http://localhost:3000/auth/register \
  -H "Authorization: Bearer $OP_ACCESS" \
  -H 'Content-Type: application/json' \
  -d '{
    "name":"Should Fail",
    "email":"fail2@rizqun.com",
    "phone":"01712345679",
    "password":"Password123",
    "categoryAccess":["grocery"]
  }'
cat /tmp/r.json | pp

echo ""
echo "── 10. GET /auth/me as operator (verify categoryFilter) ──"
curl -sS --max-time 5 http://localhost:3000/auth/me \
  -H "Authorization: Bearer $OP_ACCESS" | pp

echo ""
echo "── 11. POST /auth/login (wrong password → expect 401) ───"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@rizqun.com","password":"wrongpassword"}'
cat /tmp/r.json | pp

echo ""
echo "── 12. POST /auth/refresh (use cookie from admin login) ─"
curl -sS --max-time 5 -b $CJ -c $CJ -X POST http://localhost:3000/auth/refresh | pp

echo ""
echo "── 13. POST /auth/refresh (no cookie → expect 401) ───────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST http://localhost:3000/auth/refresh
cat /tmp/r.json | pp

echo ""
echo "── 14. POST /auth/logout ─────────────────────────────────"
curl -sS --max-time 5 -b $CJ -c $CJ -X POST http://localhost:3000/auth/logout | pp

echo ""
echo "── 15. POST /auth/refresh (after logout → expect 401) ───"
curl -sS --max-time 5 -b $CJ -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST http://localhost:3000/auth/refresh
cat /tmp/r.json | pp

echo ""
echo "═════════════════════════════════════════════════════════"
echo "  Done."
echo "═════════════════════════════════════════════════════════"

# Cleanup: remove the test operator we created
echo ""
echo "Cleaning up test data..."
PGPASSWORD=rizqun_password /home/z/.local/pg-extract/client/usr/lib/postgresql/17/bin/psql \
  -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db \
  -c "DELETE FROM users WHERE email IN ('operator@rizqun.com', 'fail1@rizqun.com', 'fail2@rizqun.com');" 2>&1 | tail -3

echo "Stopping server..."
kill $SRV_PID 2>/dev/null
wait 2>/dev/null
echo "Done."
