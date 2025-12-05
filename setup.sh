#!/bin/bash
# Claude Frontend Sniper - Automatic Setup Script
# Configures Claude Code to use the Sniper MCP server via Docker MCP Gateway

set -e

echo "=========================================="
echo "  Claude Frontend Sniper - Setup"
echo "=========================================="

# Check if Docker is available
if ! command -v docker &> /dev/null && ! command -v docker.exe &> /dev/null; then
    echo "Error: Docker not found. Please install Docker Desktop."
    exit 1
fi

# Determine Docker command (WSL vs native)
if command -v docker.exe &> /dev/null; then
    DOCKER_CMD="docker.exe"
else
    DOCKER_CMD="docker"
fi

echo "[1/4] Pulling Chrome container..."
$DOCKER_CMD pull zenika/alpine-chrome:with-puppeteer 2>/dev/null || true

echo "[2/4] Starting Chrome container (persistent)..."
$DOCKER_CMD stop chrome-persistent 2>/dev/null || true
$DOCKER_CMD rm chrome-persistent 2>/dev/null || true
$DOCKER_CMD run -d \
  --name chrome-persistent \
  --restart unless-stopped \
  -p 9222:9222 \
  --shm-size=2g \
  --entrypoint chromium-browser \
  zenika/alpine-chrome:with-puppeteer \
  --no-sandbox \
  --remote-debugging-address=0.0.0.0 \
  --remote-debugging-port=9222 \
  --disable-gpu \
  --disable-dev-shm-usage \
  --window-size=1920,1080 \
  --headless

echo "[3/4] Pulling Sniper MCP server..."
$DOCKER_CMD pull nullrunner/claude-frontend-sniper:latest

echo "[4/4] Configuring Claude Code..."

# Get the directory where this script lives
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
CATALOG_PATH="$DIR/catalogs/sniper-catalog.yaml"

# Convert to Windows path if running in WSL
if grep -q Microsoft /proc/version 2>/dev/null; then
    WIN_PATH=$(wslpath -w "$CATALOG_PATH")
    WIN_PATH_ESCAPED=$(echo "$WIN_PATH" | sed 's/\\/\\\\/g')
else
    WIN_PATH_ESCAPED="$CATALOG_PATH"
fi

# Create temporary config file
CONFIG_FILE=$(mktemp)
cat > "$CONFIG_FILE" << EOF
{
  "mcpServers": {
    "docker-gateway": {
      "command": "$DOCKER_CMD",
      "args": [
        "mcp",
        "gateway",
        "run",
        "--additional-catalog",
        "$WIN_PATH_ESCAPED"
      ]
    }
  }
}
EOF

# Check if claude command exists
if command -v claude &> /dev/null; then
    claude mcp add-json docker-gateway --scope user < "$CONFIG_FILE"
    echo ""
    echo "Configuration injected into Claude Code!"
else
    echo ""
    echo "Claude CLI not found. Manual configuration required."
    echo "Add this to your Claude Code MCP settings:"
    echo ""
    cat "$CONFIG_FILE"
fi

rm -f "$CONFIG_FILE"

echo ""
echo "=========================================="
echo "  Setup Complete!"
echo "=========================================="
echo ""
echo "Chrome DevTools available at: http://localhost:9222"
echo ""
echo "Available tools in Claude Code:"
echo "  - navigate, screenshot, click, type"
echo "  - scroll, wait_for_selector"
echo "  - get_computed_styles, get_network_errors"
echo "  - get_console_logs, mobile_mode"
echo ""
echo "Test with: Ask Claude to 'navigate to https://example.com and take a screenshot'"
