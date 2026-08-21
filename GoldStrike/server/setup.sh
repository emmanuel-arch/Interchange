#!/bin/bash
# ══════════════════════════════════════════
# GoldStrike v2.0 — Server Setup Script
# Run on Linux server: bash setup.sh
# ══════════════════════════════════════════

set -e

SERVER_DIR="/home/emmanuel/goldstrike-server"
ENV_FILE="${SERVER_DIR}/.env"

echo "═══════════════════════════════════════"
echo "  GOLDSTRIKE SERVER SETUP"
echo "═══════════════════════════════════════"

# 1. Create directory structure
echo "[1/8] Creating directories..."
mkdir -p "${SERVER_DIR}"

# Copy server files if not already in place
if [ "$(dirname "$(readlink -f "$0")")" != "${SERVER_DIR}" ]; then
    echo "  Copying server files to ${SERVER_DIR}..."
    cp -r "$(dirname "$0")"/* "${SERVER_DIR}/"
    cp -r "$(dirname "$0")"/.env.example "${SERVER_DIR}/" 2>/dev/null || true
fi
cd "${SERVER_DIR}"

# 2. Install system dependencies
echo "[2/8] Installing system packages..."
sudo apt update -qq
sudo apt install -y -qq python3 python3-pip python3-venv postgresql postgresql-client

# 3. Setup .env file
echo "[3/8] Setting up environment..."
if [ ! -f "${ENV_FILE}" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "  Created .env from template — EDIT IT with your secrets:"
        echo "    nano ${ENV_FILE}"
        echo ""
        echo "  Required settings:"
        echo "    DATABASE_URL, SERVER_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, DB_PASSWORD"
        echo ""
        read -p "  Press Enter after editing .env (or Ctrl+C to edit later)..."
    else
        echo "  ERROR: No .env.example found. Create ${ENV_FILE} manually."
        exit 1
    fi
fi

# Source .env for this script
set -a
source "${ENV_FILE}"
set +a

# Validate required env vars
if [ -z "$DB_PASSWORD" ] || [ -z "$SERVER_API_KEY" ]; then
    echo "  ERROR: DB_PASSWORD and SERVER_API_KEY must be set in .env"
    exit 1
fi

# 4. Setup PostgreSQL
echo "[4/8] Setting up PostgreSQL..."
sudo -u postgres psql -c "CREATE USER emmanuel WITH PASSWORD '${DB_PASSWORD}';" 2>/dev/null || echo "  User already exists"
sudo -u postgres psql -c "CREATE DATABASE quantempire OWNER emmanuel;" 2>/dev/null || echo "  Database already exists"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE quantempire TO emmanuel;"

# 5. Python environment
echo "[5/8] Setting up Python environment..."
python3 -m venv venv
source venv/bin/activate
pip install -q -r requirements.txt

# 6. Initialize database schema
echo "[6/8] Initializing database schema..."
PGPASSWORD="${DB_PASSWORD}" psql -U emmanuel -d quantempire -f database/schema.sql

# 7. Firewall
echo "[7/8] Configuring firewall..."
sudo ufw allow 22/tcp >/dev/null 2>&1 || true
sudo ufw allow 5000/tcp >/dev/null 2>&1 || true
sudo ufw --force enable 2>/dev/null || echo "  UFW not available — configure firewall manually"

# 8. Create systemd service
echo "[8/8] Creating systemd service..."
sudo tee /etc/systemd/system/goldstrike-server.service > /dev/null << EOF
[Unit]
Description=GoldStrike Control Server
After=network.target postgresql.service

[Service]
Type=simple
User=emmanuel
WorkingDirectory=${SERVER_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=${SERVER_DIR}/venv/bin/gunicorn -w 2 -b 0.0.0.0:5000 api.app:app --preload
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable goldstrike-server
sudo systemctl start goldstrike-server

# Setup daily backtest cron (runs at 21:00 EAT = 18:00 UTC)
echo "Setting up daily backtest cron..."
CRON_CMD="${SERVER_DIR}/venv/bin/python ${SERVER_DIR}/backtest_runner.py >> ${SERVER_DIR}/logs/backtest.log 2>&1"
(crontab -l 2>/dev/null | grep -v backtest_runner; echo "0 18 * * 1-5 ${CRON_CMD}") | crontab -
mkdir -p "${SERVER_DIR}/logs"

echo ""
echo "═══════════════════════════════════════"
echo "  SERVER SETUP COMPLETE"
echo "  API running on port 5000"
echo "  Test: curl http://localhost:5000/health"
echo "  Backtest: daily at 21:00 EAT (Mon-Fri)"
echo "═══════════════════════════════════════"
