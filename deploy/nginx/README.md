# Deployment Guide — Nginx + TLS (Let's Encrypt)

This guide covers setting up Nginx as a reverse proxy with HTTPS for the Rizqun API.

## Prerequisites

- A VPS (2 vCPU / 4 GB RAM minimum)
- A domain name pointing to your VPS IP (A record + www CNAME)
- Node.js 20+ + npm installed
- PostgreSQL 15+ installed and running
- The Rizqun API deployed and running on `localhost:3000` (via PM2)

## Step 1: Install Nginx + Certbot

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

## Step 2: Deploy the Nginx config

```bash
# Copy the config file
sudo cp deploy/nginx/rizqun.conf /etc/nginx/sites-available/rizqun

# Edit it to replace YOUR_DOMAIN with your actual domain
sudo nano /etc/nginx/sites-available/rizqun
# Replace all instances of YOUR_DOMAIN with e.g. rizqun.yourdomain.com
# Replace /var/www/rizqun-ui with your frontend build path

# Enable the site
sudo ln -s /etc/nginx/sites-available/rizqun /etc/nginx/sites-enabled/

# Remove the default site (optional, prevents conflicts)
sudo rm -f /etc/nginx/sites-enabled/default

# Test the config
sudo nginx -t
```

## Step 3: Create the frontend directory

```bash
# If you have a React frontend build:
sudo mkdir -p /var/www/rizqun-ui
sudo cp -r /path/to/your/frontend/dist/* /var/www/rizqun-ui/
sudo chown -R www-data:www-data /var/www/rizqun-ui
```

If you don't have a frontend yet, create a placeholder:

```bash
sudo mkdir -p /var/www/rizqun-ui
echo '<h1>Rizqun API</h1><p>Backend running. Frontend coming soon.</p>' | sudo tee /var/www/rizqun-ui/index.html
```

## Step 4: Create the certbot challenge directory

```bash
sudo mkdir -p /var/www/certbot
sudo chown -R www-data:www-data /var/www/certbot
```

## Step 5: Reload Nginx

```bash
sudo nginx -t          # verify config syntax
sudo systemctl reload nginx
```

## Step 6: Get the SSL certificate

```bash
# Get cert for your domain (replace example.com)
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Certbot will:
#   1. Verify domain ownership via the /.well-known/acme-challenge/ path
#   2. Automatically modify the Nginx config to add:
#      - ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
#      - ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
#   3. Reload Nginx
```

## Step 7: Verify HTTPS works

```bash
# Test HTTP → HTTPS redirect
curl -I http://yourdomain.com/health
# Expected: 301 → https://yourdomain.com/health

# Test HTTPS endpoint
curl https://yourdomain.com/health
# Expected: { "status": "ok", "service": "rizqun-api", ... }

# Test SSL Labs grade (should be A or A+)
# Visit: https://www.ssllabs.com/ssltest/analyze.html?d=yourdomain.com
```

## Step 8: Enable auto-renewal

Certbot installs a systemd timer by default. Verify it:

```bash
# Check the timer
sudo systemctl status certbot.timer

# Dry-run renewal
sudo certbot renew --dry-run
```

Certificates renew every 60 days automatically. Nginx is reloaded by certbot's `--deploy-hook` after renewal.

## Step 9: Update CORS origins

Update your `.env` to include the HTTPS domain:

```bash
# In .env:
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
APP_BASE_URL=https://yourdomain.com
```

Then restart the API:

```bash
pm2 restart rizqun-api
```

## Troubleshooting

### Nginx config test fails

```bash
sudo nginx -t
# Read the error message — usually a typo or path issue
```

### Certbot can't verify domain

- Ensure your DNS A record points to the VPS IP
- Ensure port 80 is open in your firewall
- Ensure the certbot challenge directory exists: `/var/www/certbot`

### 502 Bad Gateway

- Check if the Node.js app is running: `pm2 status`
- Check PM2 logs: `pm2 logs rizqun-api`
- Ensure `localhost:3000` responds: `curl http://localhost:3000/health`

### HSTS warning

Don't enable HSTS (`Strict-Transport-Security`) until you're sure HTTPS works.
Once enabled, browsers will refuse HTTP for 1 year. Test thoroughly first.

To disable temporarily: comment out the `add_header Strict-Transport-Security` line
in the Nginx config and reload.
