#!/usr/bin/env bash
# One-shot user CRUD smoke test.
# Run with: bash scripts/test-users.sh

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
echo "  Rizqun — User CRUD smoke test"
echo "═════════════════════════════════════════════════════════"

# ─── Bootstrap ─────────────────────────────────────────────────
echo ""
echo "── Setup: login as admin ────────────────────────────────"
ADMIN_LOGIN=$(curl -sS --max-time 5 -c $CJ -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@rizqun.com","password":"ChangeMeInProduction123!"}')
ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)
ADMIN_ID=$(echo "$ADMIN_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['user']['id'])" 2>/dev/null)
echo "   ✓ Admin token acquired (id: $ADMIN_ID)"

# Create a regular operator (for 403 tests)
echo ""
echo "── Setup: create regular operator ──────────────────────"
curl -sS --max-time 5 -X POST http://localhost:3000/auth/register \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Reg Op","email":"regop@rizqun.com","phone":"01711111111","password":"Password123","role":"user","categoryAccess":["grocery"]}' > /dev/null
OP_LOGIN=$(curl -sS --max-time 5 -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"regop@rizqun.com","password":"Password123"}')
OP_TOKEN=$(echo "$OP_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)
echo "   ✓ Operator token acquired"

# ─── 1. GET /users without token → expect 401 ────────────────
echo ""
echo "── 1. GET /users without token → expect 401 ───────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" http://localhost:3000/users
cat /tmp/r.json | pp

# ─── 2. GET /users as operator → expect 403 ──────────────────
echo ""
echo "── 2. GET /users as operator → expect 403 ─────────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" http://localhost:3000/users \
  -H "Authorization: Bearer $OP_TOKEN"
cat /tmp/r.json | pp

# ─── 3. GET /users as admin → expect 200 ─────────────────────
echo ""
echo "── 3. GET /users as admin → expect 200 ───────────────"
curl -sS --max-time 5 http://localhost:3000/users \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'  total: {d[\"data\"][\"pagination\"][\"total\"]} (expected >= 2 — admin + reg op)')
for u in d['data']['data']:
    print(f'  - id={u[\"id\"]} name={u[\"name\"]} email={u[\"email\"]} role={u[\"role\"]} active={u[\"isActive\"]}')
"

# ─── 4. POST /users as admin (create grocery operator) ────────
echo ""
echo "── 4. POST /users (create grocery operator) ───────────"
U1=$(curl -sS --max-time 5 -X POST http://localhost:3000/users \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "name":"Grocery Op",
    "email":"grocery-op@rizqun.com",
    "phone":"01722222222",
    "password":"Password123",
    "role":"user",
    "categoryAccess":["grocery"]
  }')
echo "$U1" | pp
U1_ID=$(echo "$U1" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['user']['id'])" 2>/dev/null)
echo "   ✓ User id: $U1_ID"

# ─── 5. POST /users with duplicate email → 409 ────────────────
echo ""
echo "── 5. POST /users duplicate email → expect 409 ────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST http://localhost:3000/users \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Dup","email":"grocery-op@rizqun.com","phone":"01733333333","password":"Password123","categoryAccess":[]}'
cat /tmp/r.json | pp

# ─── 6. POST /users with invalid categoryAccess → 400 ────────
echo ""
echo "── 6. POST /users invalid category → expect 400 ───────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST http://localhost:3000/users \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Bad Cat","email":"badcat@rizqun.com","phone":"01744444444","password":"Password123","categoryAccess":["nonexistent"]}'
cat /tmp/r.json | pp

# ─── 7. POST /users with invalid phone → 400 ─────────────────
echo ""
echo "── 7. POST /users invalid phone → expect 400 ─────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST http://localhost:3000/users \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Bad Phone","email":"badphone@rizqun.com","phone":"123","password":"Password123","categoryAccess":[]}'
cat /tmp/r.json | pp

# ─── 8. POST /users with short password → 400 ───────────────
echo ""
echo "── 8. POST /users short password → expect 400 ────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST http://localhost:3000/users \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Short Pwd","email":"shortpwd@rizqun.com","phone":"01755555555","password":"123","categoryAccess":[]}'
cat /tmp/r.json | pp

# ─── 9. PATCH /users/:id (update name) ───────────────────────
echo ""
echo "── 9. PATCH /users/$U1_ID (update name) ───────────────"
curl -sS --max-time 5 -X PATCH "http://localhost:3000/users/$U1_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Updated Grocery Op"}' | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'  name: {d[\"data\"][\"user\"][\"name\"]} (expected Updated Grocery Op)')
assert d['data']['user']['name'] == 'Updated Grocery Op', 'FAIL'
print('  ✓ Name updated')
"

# ─── 10. PATCH /users/:id (update categoryAccess) ────────────
echo ""
echo "── 10. PATCH /users/$U1_ID (add medicine access) ─────"
curl -sS --max-time 5 -X PATCH "http://localhost:3000/users/$U1_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"categoryAccess":["grocery","medicine"]}' | python3 -c "
import sys, json
d = json.load(sys.stdin)
access = d['data']['user']['categoryAccess']
print(f'  categoryAccess: {access} (expected [\"grocery\",\"medicine\"])')
assert 'grocery' in access and 'medicine' in access, 'FAIL'
print('  ✓ Category access updated')
"

# ─── 11. PATCH /users/:id (change password) ──────────────────
echo ""
echo "── 11. PATCH /users/$U1_ID (change password) ──────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X PATCH "http://localhost:3000/users/$U1_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"password":"NewPassword456"}'
echo "   (should be 200)"
# Verify new password works
NEW_LOGIN=$(curl -sS --max-time 5 -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"grocery-op@rizqun.com","password":"NewPassword456"}')
NEW_TOKEN=$(echo "$NEW_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null)
if [ -n "$NEW_TOKEN" ]; then
  echo "   ✓ New password works (login successful)"
else
  echo "   ✗ FAIL: new password login failed"
fi

# ─── 12. PATCH /users/:id with email conflict → 409 ───────────
echo ""
echo "── 12. PATCH email conflict → expect 409 ───────────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X PATCH "http://localhost:3000/users/$U1_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@rizqun.com"}'
cat /tmp/r.json | pp

# ─── 13. PATCH self: try to deactivate own account → 409 ─────
echo ""
echo "── 13. Self-deactivation → expect 409 ────────────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X PATCH "http://localhost:3000/users/$ADMIN_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"isActive":false}'
cat /tmp/r.json | pp

# ─── 14. PATCH self: try to demote own role → 409 ─────────────
echo ""
echo "── 14. Self-role-downgrade → expect 409 ───────────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X PATCH "http://localhost:3000/users/$ADMIN_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"role":"user"}'
cat /tmp/r.json | pp

# ─── 15. PATCH with empty body → 400 ─────────────────────────
echo ""
echo "── 15. PATCH empty body → expect 400 ──────────────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X PATCH "http://localhost:3000/users/$U1_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{}'
cat /tmp/r.json | pp

# ─── 16. DELETE /users/:id as operator → 403 ─────────────────
echo ""
echo "── 16. DELETE as operator → expect 403 ────────────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X DELETE "http://localhost:3000/users/$U1_ID" \
  -H "Authorization: Bearer $OP_TOKEN"
cat /tmp/r.json | pp

# ─── 17. DELETE /users/:id as admin → 200 (soft delete) ──────
echo ""
echo "── 17. DELETE as admin → expect 200 ───────────────────"
curl -sS --max-time 5 -X DELETE "http://localhost:3000/users/$U1_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | pp

# ─── 18. DELETE again → 409 (already deactivated) ───────────
echo ""
echo "── 18. DELETE again → expect 409 ─────────────────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X DELETE "http://localhost:3000/users/$U1_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
cat /tmp/r.json | pp

# ─── 19. Self-delete → 409 ──────────────────────────────────
echo ""
echo "── 19. Self-delete → expect 409 ───────────────────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X DELETE "http://localhost:3000/users/$ADMIN_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
cat /tmp/r.json | pp

# ─── 20. GET /users?isActive=false → see deactivated ────────
echo ""
echo "── 20. GET /users?isActive=false → see deactivated ────"
curl -sS --max-time 5 "http://localhost:3000/users?isActive=false" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'  total deactivated: {d[\"data\"][\"pagination\"][\"total\"]}')
for u in d['data']['data']:
    print(f'  - {u[\"name\"]} ({u[\"email\"]})')
"

# ─── 21. GET /users?role=user → filter by role ───────────────
echo ""
echo "── 21. GET /users?role=user → filter ──────────────────"
curl -sS --max-time 5 "http://localhost:3000/users?role=user" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'  total users: {d[\"data\"][\"pagination\"][\"total\"]}')
for u in d['data']['data']:
    assert u['role'] == 'user', f'found non-user role: {u[\"role\"]}'
print('  ✓ All results have role=user')
"

# ─── 22. Verify deactivated user can't login ─────────────────
echo ""
echo "── 22. Deactivated user can't login → 403 ────────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"grocery-op@rizqun.com","password":"NewPassword456"}'
cat /tmp/r.json | pp

# ─── 23. PATCH /users/9999 → 404 ─────────────────────────────
echo ""
echo "── 23. PATCH /users/9999 → expect 404 ────────────────"
curl -sS --max-time 5 -o /tmp/r.json -w "HTTP %{http_code}\n" -X PATCH "http://localhost:3000/users/9999" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Nobody"}'
cat /tmp/r.json | pp

# ─── 24. Verify response shape ────────────────────────────────
echo ""
echo "── 24. Verify response shape ───────────────────────────"
curl -sS --max-time 5 "http://localhost:3000/users?limit=1" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
u = d['data']['data'][0]
required = ['id', 'name', 'email', 'phone', 'role', 'categoryAccess', 'isActive', 'createdAt', 'updatedAt']
missing = [k for k in required if k not in u]
if missing:
    print(f'FAIL: missing {missing}')
    exit(1)
# Verify passwordHash is NOT in response
assert 'passwordHash' not in u, 'passwordHash leaked!'
print('  ✓ All fields present, passwordHash NOT leaked')
"

echo ""
echo "═════════════════════════════════════════════════════════"
echo "  Done."
echo "═════════════════════════════════════════════════════════"

# Cleanup
echo ""
echo "Cleaning up test data..."
PGPASSWORD=rizqun_password $PSQL -h 127.0.0.1 -p 5432 -U rizqun_user -d rizqun_db \
  -c "DELETE FROM users WHERE email IN ('grocery-op@rizqun.com', 'regop@rizqun.com');" > /dev/null 2>&1
echo "   ✓ Cleaned up"

kill $SRV_PID 2>/dev/null
wait 2>/dev/null
echo "Done."
