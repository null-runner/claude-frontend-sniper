# Claude Frontend Sniper 🎯

**The Ultimate Chrome DevTools MCP Server for Claude**

Zero crashes. Perfect UI debugging. Built to solve the `about:blank` and Puppeteer Docker crash nightmare.

## Why This Exists

The official `chrome-devtools-mcp` and Browserless setups crash constantly in Docker due to:
- Target mismatch issues (`about:blank` rendering)
- Puppeteer proxy bugs (`Cannot read properties of undefined (reading '_targetId')`)
- Container exits when stdin closes
- Multi-tab chaos breaking CDP connections

**This MCP server solves ALL of these problems.**

## Features

✅ **No `new_page` tool** - Physically removed to prevent multi-tab issues  
✅ **Smart Target Lock** - Puppeteer auto-connects to the right page  
✅ **Auto-restart on crash** - Docker handles recovery  
✅ **Font-perfect rendering** - Uses Browserless Chrome for accurate UI  
✅ **Minimal API** - Only `navigate`, `screenshot`, `evaluate`, `get_console_logs`

## Architecture

```
Claude Code (WSL)
    ↓
Docker MCP Gateway
    ↓
Claude Frontend Sniper (this container, stdio)
    ↓
Browserless Chrome (persistent, port 3333)
```

## Setup

### 1. Start the Chrome "Fat" container (once, persists forever):

```bash
docker run -d \
  --name chrome-devtools-browser \
  --restart unless-stopped \
  -p 3333:3000 \
  --shm-size=2gb \
  -e ENABLE_DEBUGGER=true \
  -e CONNECTION_TIMEOUT=600000 \
  browserless/chrome:latest
```

> **Why Browserless?** Full font rendering for pixel-perfect UI debugging. Alpine Chrome lacks fonts.

### 2. Build this MCP server:

```bash
cd claude-frontend-sniper
docker build -t claude-frontend-sniper:latest .
```

### 3. Configure Docker MCP Gateway:

**Option A: Use the included catalog (recommended)**

```bash
# Add the catalog from this repo to Docker MCP Gateway
docker mcp gateway run --additional-catalog /path/to/claude-frontend-sniper/catalogs/sniper-catalog.yaml
```

Or configure it in `~/.claude.json`:

```json
{
  "mcpServers": {
    "MCP_DOCKER": {
      "command": "docker",
      "args": ["mcp", "gateway", "run", "--additional-catalog", "/path/to/claude-frontend-sniper/catalogs/sniper-catalog.yaml"],
      "type": "stdio"
    }
  }
}
```

**Option B: Manual catalog integration**

Copy `catalogs/sniper-catalog.yaml` to `~/.docker/mcp/catalogs/` and add it to your Gateway config.

### 4. Use in Claude:

```bash
mcp-add chromedev
chromedev:navigate url="https://yoursite.com"
chromedev:screenshot
```

## Why It's Better

| Problem | Official chrome-devtools-mcp | Claude Frontend Sniper |
|---------|------------------------------|------------------------|
| `about:blank` crashes | ✗ Constant | ✓ Never happens |
| Multi-tab confusion | ✗ Yes | ✓ Physically disabled |
| Container exits | ✗ Requires restart | ✓ Auto-restarts |
| Font rendering | ✗ Basic Chrome | ✓ Browserless (full fonts) |
| CDP stability | ✗ Bash scripts fail | ✓ Puppeteer handles it |

## Contributing

This tool was born from frustration. If you've suffered through `about:blank` or Puppeteer crashes in Docker, you know the pain.

PRs welcome. Let's make frontend debugging with Claude actually work.

## License

MIT - Use it, fork it, fix the world's Claude debugging problems with it.
