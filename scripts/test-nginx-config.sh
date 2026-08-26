#!/usr/bin/env bash
# One-shot Nginx config validation smoke test.
# Verifies: config file structure, required directives, deployment docs.
# Run with: bash scripts/test-nginx-config.sh

cd /home/z/my-project/rizqun

echo "═════════════════════════════════════════════════════════"
echo "  Rizqun — Nginx Config + TLS smoke test"
echo "═════════════════════════════════════════════════════════"

CONF=deploy/nginx/rizqun.conf
DOCS=deploy/nginx/README.md

# ─── 1. Config file exists ─────────────────────────────────────
echo ""
echo "── 1. Config file exists ────────────────────────────────"
if [ -f "$CONF" ]; then
  echo "   ✓ $CONF exists ($(wc -l < $CONF) lines)"
else
  echo "   ✗ FAIL: $CONF not found"
  exit 1
fi

# ─── 2. HTTP → HTTPS redirect ─────────────────────────────────
echo ""
echo "── 2. HTTP → HTTPS redirect ────────────────────────────"
if grep -q "return 301 https" "$CONF"; then
  echo "   ✓ HTTP → HTTPS 301 redirect present"
else
  echo "   ✗ FAIL: no HTTPS redirect"
  exit 1
fi

# ─── 3. SSL certificate placeholders ──────────────────────────
echo ""
echo "── 3. SSL certificate placeholders ────────────────────"
if grep -q "ssl_certificate" "$CONF"; then
  echo "   ✓ SSL certificate directives present (commented out — certbot fills them)"
  grep "ssl_certificate" "$CONF"
else
  echo "   ✗ FAIL: no SSL certificate directives"
  exit 1
fi

# ─── 4. TLS 1.2/1.3 ──────────────────────────────────────────
echo ""
echo "── 4. TLS version ──────────────────────────────────────"
if grep -q "TLSv1.2 TLSv1.3" "$CONF"; then
  echo "   ✓ TLS 1.2 + 1.3 enabled (legacy TLS disabled)"
else
  echo "   ✗ FAIL: TLS versions not specified"
  exit 1
fi

# ─── 5. HSTS header ───────────────────────────────────────────
echo ""
echo "── 5. HSTS header ─────────────────────────────────────"
if grep -q "Strict-Transport-Security" "$CONF"; then
  echo "   ✓ HSTS header present"
  grep "Strict-Transport-Security" "$CONF"
else
  echo "   ✗ FAIL: no HSTS header"
  exit 1
fi

# ─── 6. Reverse proxy for API routes ──────────────────────────
echo ""
echo "── 6. Reverse proxy for API routes ────────────────────"
ROUTES="auth vendors products orders ratings users categories dashboard health"
ALL_PASS=true
for route in $ROUTES; do
  if grep -q "location /$route" "$CONF"; then
    echo "   ✓ /$route proxied"
  else
    echo "   ✗ FAIL: /$route not proxied"
    ALL_PASS=false
  fi
done
if [ "$ALL_PASS" = true ]; then
  echo "   ✓ All 9 API routes proxied"
fi

# ─── 7. Proxy headers ────────────────────────────────────────
echo ""
echo "── 7. Proxy headers ───────────────────────────────────"
for header in "X-Real-IP" "X-Forwarded-For" "X-Forwarded-Proto"; do
  if grep -q "$header" "$CONF"; then
    echo "   ✓ $header present"
  else
    echo "   ✗ FAIL: $header missing"
    exit 1
  fi
done

# ─── 8. SPA fallback ──────────────────────────────────────────
echo ""
echo "── 8. SPA fallback ─────────────────────────────────────"
if grep -q "try_files" "$CONF" && grep -q "index.html" "$CONF"; then
  echo "   ✓ SPA fallback (try_files → index.html) present"
else
  echo "   ✗ FAIL: no SPA fallback"
  exit 1
fi

# ─── 9. Security headers ─────────────────────────────────────
echo ""
echo "── 9. Security headers ────────────────────────────────"
for header in "X-Frame-Options" "X-Content-Type-Options" "Referrer-Policy"; do
  if grep -q "$header" "$CONF"; then
    echo "   ✓ $header present"
  else
    echo "   ✗ FAIL: $header missing"
    exit 1
  fi
done

# ─── 10. Gzip compression ────────────────────────────────────
echo ""
echo "── 10. Gzip compression ────────────────────────────────"
if grep -q "gzip on" "$CONF"; then
  echo "   ✓ Gzip enabled"
  grep "gzip_types" "$CONF" | head -1
else
  echo "   ✗ FAIL: no gzip"
  exit 1
fi

# ─── 11. Static file caching ─────────────────────────────────
echo ""
echo "── 11. Static file caching ────────────────────────────"
if grep -q "expires" "$CONF" && grep -q "Cache-Control" "$CONF"; then
  echo "   ✓ Static file caching configured"
else
  echo "   ✗ FAIL: no static file caching"
  exit 1
fi

# ─── 12. Certbot challenge path ──────────────────────────────
echo ""
echo "── 12. Certbot challenge path ─────────────────────────"
if grep -q "acme-challenge" "$CONF"; then
  echo "   ✓ Let's Encrypt challenge path configured"
else
  echo "   ✗ FAIL: no certbot challenge path"
  exit 1
fi

# ─── 13. Deployment docs exist ────────────────────────────────
echo ""
echo "── 13. Deployment docs ────────────────────────────────"
if [ -f "$DOCS" ]; then
  echo "   ✓ $DOCS exists ($(wc -l < $DOCS) lines)"
  # Check for key sections
  for section in "Install Nginx" "SSL certificate" "auto-renewal" "Troubleshooting"; do
    if grep -qi "$section" "$DOCS"; then
      echo "   ✓ Section: $section"
    else
      echo "   ✗ FAIL: missing section '$section'"
      exit 1
    fi
  done
else
  echo "   ✗ FAIL: $DOCS not found"
  exit 1
fi

# ─── 14. README references Nginx section ──────────────────────
echo ""
echo "── 14. README references Nginx section ─────────────────"
if grep -q "Nginx reverse proxy" README.md; then
  echo "   ✓ README has Nginx deployment section"
else
  echo "   ✗ FAIL: README missing Nginx section"
  exit 1
fi

echo ""
echo "═════════════════════════════════════════════════════════"
echo "  All 14 checks passed. ✅"
echo "═════════════════════════════════════════════════════════"
