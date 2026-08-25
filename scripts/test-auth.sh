#!/usr/bin/env bash
# scripts/test-auth.sh
# End-to-end smoke test for the auth endpoints.
# Run server in another shell: npm run dev

# Don't use `set -e` — we expect some of these curl calls to fail (we're testing failures)

BASE=http://localhost:3000
CJ=/tmp/rizqun-cookies.txt
rm -f $CJ

echo "═════════════════════════════════════════════════════════"
echo "  Rizqun — Auth endpoints smoke test"
echo "═════════════════════════════════════════════════════════"

echo ""
echo "── 1. POST /auth/login (admin) ──────────────────────────"
LOGIN=$(curl -sS -c $CJ -X POST "$BASE/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@rizqun.com","password":"ChangeMeInProduction123!"}')
echo "$LOGIN" | python3 -m json.tool

ACCESS=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")
echo "Access token (first 30 chars): ${ACCESS:0:30}..."

echo ""
echo "── 2. GET /auth/me (with token) ─────────────────────────"
curl -sS "$BASE/auth/me" \
  -H "Authorization: Bearer $ACCESS" | python3 -m json.tool

echo ""
echo "── 3. GET /auth/me (without token → 401) ────────────────"
curl -sS -o /tmp/r.json -w "HTTP %{http_code}\n" "$BASE/auth/me"
cat /tmp/r.json | python3 -m json.tool

echo ""
echo "── 4. POST /auth/register (new user) ────────────────────"
REG=$(curl -sS -X POST "$BASE/auth/register" \
  -H 'Content-Type: application/json' \
  -d '{
    "name":"Test Operator",
    "email":"operator@rizqun.com",
    "phone":"01712345678",
    "password":"Password123",
    "role":"user",
    "categoryAccess":["grocery"]
  }')
echo "$REG" | python3 -m json.tool

echo ""
echo "── 5. POST /auth/register (duplicate email → 409) ────────"
curl -sS -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST "$BASE/auth/register" \
  -H 'Content-Type: application/json' \
  -d '{
    "name":"Test Operator 2",
    "email":"operator@rizqun.com",
    "phone":"01712345679",
    "password":"Password123",
    "categoryAccess":["grocery"]
  }'
cat /tmp/r.json | python3 -m json.tool

echo ""
echo "── 6. POST /auth/register (invalid phone → 400) ──────────"
curl -sS -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST "$BASE/auth/register" \
  -H 'Content-Type: application/json' \
  -d '{
    "name":"Test",
    "email":"test2@rizqun.com",
    "phone":"123",
    "password":"Password123",
    "categoryAccess":[]
  }'
cat /tmp/r.json | python3 -m json.tool

echo ""
echo "── 7. POST /auth/login (wrong password → 401) ───────────"
curl -sS -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST "$BASE/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@rizqun.com","password":"wrongpassword"}'
cat /tmp/r.json | python3 -m json.tool

echo ""
echo "── 8. POST /auth/refresh (use cookie from login) ───────"
curl -sS -b $CJ -c $CJ -X POST "$BASE/auth/refresh" | python3 -m json.tool

echo ""
echo "── 9. POST /auth/refresh (no cookie → 401) ───────────────"
curl -sS -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST "$BASE/auth/refresh"
cat /tmp/r.json | python3 -m json.tool

echo ""
echo "── 10. POST /auth/logout ─────────────────────────────────"
curl -sS -b $CJ -c $CJ -X POST "$BASE/auth/logout" | python3 -m json.tool

echo ""
echo "── 11. POST /auth/refresh (after logout → 401) ──────────"
curl -sS -b $CJ -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST "$BASE/auth/refresh"
cat /tmp/r.json | python3 -m json.tool

echo ""
echo "═════════════════════════════════════════════════════════"
echo "  Done. Review the outputs above."
echo "═════════════════════════════════════════════════════════"
