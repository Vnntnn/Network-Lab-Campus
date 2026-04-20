# Production VM Deployment Guide

This guide deploys the app on Linux VMs with:
- Frontend static files on Nginx
- Backend FastAPI on Uvicorn managed by systemd
- Reverse proxy for HTTP + websocket API routes

## 1) Recommended Topology

- VM1 (web): Nginx + frontend dist
- VM2 (api): backend Python service on port 8000
- DNS: app.example.com -> VM1 public IP

VM2 should be reachable from VM1 on port 8000 (private network preferred).

## 2) Deploy Backend (VM2)

1. Install runtime dependencies:

```bash
sudo apt update
sudo apt install -y python3.12 python3.12-venv python3-pip git
```

2. Copy repo to VM2:

```bash
sudo mkdir -p /opt/network-platform
sudo chown -R $USER:$USER /opt/network-platform
git clone <your-repo-url> /opt/network-platform
cd /opt/network-platform/backend
```

3. Build virtualenv and install packages:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

4. Create backend env file:

```bash
sudo mkdir -p /etc/network-platform
sudo cp /opt/network-platform/backend/.env.example /etc/network-platform/backend.env
sudo nano /etc/network-platform/backend.env
```

Set values in /etc/network-platform/backend.env:

```env
DATABASE_URL=sqlite+aiosqlite:///./nexus_edu.db
CORS_ORIGINS=https://app.example.com
```

5. Register systemd service:

```bash
sudo cp /opt/network-platform/deploy/systemd/network-platform-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now network-platform-backend
sudo systemctl status network-platform-backend
```

6. Firewall VM2 to only allow VM1 to access port 8000.

## 3) Deploy Frontend + Reverse Proxy (VM1)

1. Install dependencies:

```bash
sudo apt update
sudo apt install -y nginx nodejs npm
```

2. Copy repo to VM1 and build frontend:

```bash
sudo mkdir -p /opt/network-platform
sudo chown -R $USER:$USER /opt/network-platform
git clone <your-repo-url> /opt/network-platform
cd /opt/network-platform/frontend
cp .env.production.example .env.production
npm ci
npm run build
```

3. Publish static files:

```bash
sudo mkdir -p /var/www/network-platform
sudo rm -rf /var/www/network-platform/*
sudo cp -r dist/* /var/www/network-platform/
```

4. Configure Nginx:

```bash
sudo cp /opt/network-platform/deploy/nginx/network-platform.conf /etc/nginx/sites-available/network-platform
sudo nano /etc/nginx/sites-available/network-platform
```

Replace BACKEND_PRIVATE_IP with VM2 private IP.

Enable site:

```bash
sudo ln -sf /etc/nginx/sites-available/network-platform /etc/nginx/sites-enabled/network-platform
sudo nginx -t
sudo systemctl restart nginx
```

## 4) Enable TLS (Let’s Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d app.example.com
```

## 5) Verify

- Open https://app.example.com
- Check API health via proxy:

```bash
curl -i https://app.example.com/health
```

- Check backend logs:

```bash
sudo journalctl -u network-platform-backend -f
```

## 6) Zero-Downtime Update Sequence

1. Pull latest code on VM2 and VM1.
2. VM2: update backend dependencies if needed, then:

```bash
sudo systemctl restart network-platform-backend
```

3. VM1: rebuild frontend and recopy dist, then:

```bash
sudo systemctl reload nginx
```

## 7) Notes

- The backend currently supports SQLite; for high write volume, migrate to PostgreSQL and set DATABASE_URL accordingly.
- Frontend websocket and API URLs are now production-safe and can be overridden with:
  - VITE_API_BASE_URL
  - VITE_WS_BASE_URL
