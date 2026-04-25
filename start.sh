#!/bin/bash
# start.sh — SupplyShock Predictor v5 Startup Script
# Starts Python ML service + Node.js server

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "============================================================"
echo "  SUPPLYSHOCK PREDICTOR v5  [Python ML + Real-time]"
echo "============================================================"

# ── Check Python ──────────────────────────────────────────────
if ! command -v python3 &>/dev/null; then
  echo "ERROR: python3 not found. Please install Python 3.9+."
  exit 1
fi

# ── Install Python dependencies ───────────────────────────────
echo ""
echo "  [1/3]  Installing Python ML dependencies..."
pip3 install -r python_ml/requirements.txt -q --break-system-packages 2>/dev/null || \
pip3 install -r python_ml/requirements.txt -q
echo "         Done."

# ── Install Node dependencies ─────────────────────────────────
echo "  [2/3]  Installing Node.js dependencies..."
npm install --silent
echo "         Done."

# ── Start ─────────────────────────────────────────────────────
echo "  [3/3]  Starting server (Node + Python ML)..."
echo ""
echo "  Access the app at: http://localhost:${PORT:-3000}"
echo "  ML API at:         http://localhost:${ML_PORT:-5001}/health"
echo "============================================================"
echo ""

node backend/server.js
