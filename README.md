<div align="center">

# Chrome MCP Docker

**Persistent Chrome DevTools MCP Server**

[![Docker Hub](https://img.shields.io/docker/pulls/nullrunner/chrome-mcp-docker?style=flat-square&logo=docker&label=pulls)](https://hub.docker.com/r/nullrunner/chrome-mcp-docker)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-compatible-green?style=flat-square)](https://modelcontextprotocol.io)

*Stable, persistent Chrome DevTools for AI coding assistants.*

</div>

---

## Why Docker?

| Feature | Official MCP | **This** |
|---------|:------------:|:--------:|
| Session Persistence | ❌ | ✅ |
| Docker Stability | ❌ | ✅ |
| Mobile Testing | ❌ | ✅ |
| Native Interactions | ❌ | ✅ |
| Console Logs | ❌ | ✅ |
| Host Header Bypass | ❌ | ✅ |

---

## Installation

### Option A: Standalone (Recommended)

Works with just Docker - no additional dependencies.

```bash
# 1. Start Chrome container
docker run -d --name chrome-persistent --restart unless-stopped \
  -p 9222:9222 --shm-size=2g \
  zenika/alpine-chrome:with-puppeteer \
  --no-sandbox --remote-debugging-address=0.0.0.0 \
  --remote-debugging-port=9222 --disable-gpu --headless

# 2. Add to Claude Code (~/.claude.json)
```

```json
{
  "mcpServers": {
    "chrome": {
      "command": "docker",
      "args": ["run", "--rm", "-i", "--network", "host",
               "-e", "CHROME_HOST=localhost", "-e", "CHROME_PORT=9222",
               "nullrunner/chrome-mcp-docker:latest"]
    }
  }
}
```

### Option B: Docker MCP Gateway

> **Warning**: The official Docker MCP Gateway has bugs affecting custom servers.
> See [Known Issues](#known-issues). Use Option A or the patched fork below.

```bash
# Use patched fork (recommended if you want Gateway)
git clone https://github.com/null-runner/mcp-gateway.git
cd mcp-gateway && go build -o docker-mcp ./cmd/docker-mcp

# Then setup chrome-mcp-docker
git clone https://github.com/null-runner/chrome-mcp-docker.git
cd chrome-mcp-docker
./setup.sh
```

---

## Tools

| Tool | What it does |
|------|--------------|
| `navigate` | Go to URL, wait for load |
| `screenshot` | Capture viewport |
| `click` | Click element |
| `type` | Type into input |
| `scroll` | Scroll page/element |
| `wait_for_selector` | Wait for element |
| `get_computed_styles` | CSS debugging |
| `get_network_errors` | Failed requests |
| `get_console_logs` | JS console output |
| `mobile_mode` | iPhone X viewport |

---

## Requirements

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Any MCP-compatible client (Claude Code, Cursor, Windsurf, Cline, etc.)

---

## Documentation

- [Setup Guide](SETUP_GUIDE.md) - Manual installation, configuration options
- [Troubleshooting](TROUBLESHOOTING.md) - Common issues and fixes
- [Architecture](ARCHITECTURE.md) - How it works under the hood

---

## How It Works

```
AI Coding Assistant (Claude, Cursor, etc.)
    ↓
chrome-mcp-docker (MCP Server)
    ↓
Chrome DevTools Protocol
    ↓
Persistent Chrome Browser (Docker)
```

The key innovation: **Host Header Bypass**. Chrome rejects connections from Docker containers because `host.docker.internal` isn't `localhost`. This server spoofs the header.

---

## Known Issues

**Docker MCP Gateway** has several open bugs affecting custom servers:
- [PR #263](https://github.com/docker/mcp-gateway/pull/263) - Tool name prefix separator (`:` → `__`)
- [PR #278](https://github.com/docker/mcp-gateway/pull/278) - Prefixed names sent to remote servers
- [PR #279](https://github.com/docker/mcp-gateway/pull/279) - Claude clients excluded from tool activation

**Recommendation**: Use standalone installation (Option A) until these PRs are merged.

---

## License

MIT

---

<div align="center">

**[Report Bug](https://github.com/null-runner/chrome-mcp-docker/issues)** · **[Request Feature](https://github.com/null-runner/chrome-mcp-docker/issues)**

Made with ☕ by [null-runner](https://github.com/null-runner)

</div>
