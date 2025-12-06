#!/bin/bash
# Chrome MCP Docker - Automatic Setup Script
# Configures MCP clients to use the Chrome DevTools MCP server via Docker MCP Gateway

set -e

echo ""
echo "  Chrome MCP Docker - Setup"
echo "  ========================="
echo ""

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

echo "[3/4] Pulling Chrome MCP Docker server..."
$DOCKER_CMD pull nullrunner/chrome-mcp-docker:latest

echo "[4/4] Configuring Claude Code..."

# Get the directory where this script lives
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
CATALOG_PATH="$DIR/catalogs/chrome-catalog.yaml"

# Convert to Windows path if running in WSL
if grep -q Microsoft /proc/version 2>/dev/null; then
    WIN_PATH=$(wslpath -w "$CATALOG_PATH")
    # Escape backslashes for JSON
    ESCAPED_PATH=$(echo "$WIN_PATH" | sed 's/\\/\\\\/g')
else
    ESCAPED_PATH="$CATALOG_PATH"
fi

# Build JSON config string
JSON_CONFIG="{\"command\":\"$DOCKER_CMD\",\"args\":[\"mcp\",\"gateway\",\"run\",\"--additional-catalog\",\"$ESCAPED_PATH\"]}"

# Check if claude command exists
if command -v claude &> /dev/null; then
    echo "Injecting MCP configuration..."
    claude mcp add-json docker-gateway "$JSON_CONFIG" --scope user 2>/dev/null || {
        echo ""
        echo "Note: If docker-gateway already exists, run:"
        echo "  claude mcp remove docker-gateway --scope user"
        echo "Then run this script again."
    }
    echo ""
    echo "Configuration injected into Claude Code!"
else
    echo ""
    echo "Claude CLI not found. Add this to your MCP settings manually:"
    echo ""
    echo "  Name: docker-gateway"
    echo "  Config: $JSON_CONFIG"
fi

echo ""
echo "  Setup Complete!"
echo "  ==============="
echo ""
echo "  Chrome DevTools: http://localhost:9222"
echo ""
echo "  Tools available:"
echo "    navigate, screenshot, click, type, scroll"
echo "    wait_for_selector, get_computed_styles"
echo "    get_network_errors, get_console_logs, mobile_mode"
echo ""
echo "  Test: Ask Claude to 'navigate to example.com and screenshot'"
echo ""
