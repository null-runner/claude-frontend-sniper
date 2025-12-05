<div align="center">

# Claude Frontend Sniper

**Persistent Chrome DevTools for Claude Code**

[![Docker Hub](https://img.shields.io/docker/pulls/nullrunner/claude-frontend-sniper?style=flat-square&logo=docker&label=pulls)](https://hub.docker.com/r/nullrunner/claude-frontend-sniper)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-compatible-green?style=flat-square)](https://modelcontextprotocol.io)

*Stop guessing CSS issues. Let Claude see your UI.*

</div>

---

## Why Sniper?

| Feature | Official MCP | **Sniper** |
|---------|:------------:|:----------:|
| Session Persistence | :x: | :white_check_mark: |
| Docker Stability | :x: | :white_check_mark: |
| Mobile Testing | :x: | :white_check_mark: |
| Native Interactions | :x: | :white_check_mark: |
| Console Logs | :x: | :white_check_mark: |
| Host Header Bypass | :x: | :white_check_mark: |

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
    "sniper": {
      "command": "docker",
      "args": ["run", "--rm", "-i", "--network", "host",
               "-e", "CHROME_HOST=localhost", "-e", "CHROME_PORT=9222",
               "nullrunner/claude-frontend-sniper:latest"]
    }
  }
}
```

### Option B: Docker MCP Gateway

> **Warning**: The Docker MCP Gateway has bugs affecting custom servers.
> See [PR #278](https://github.com/docker/mcp-gateway/pull/278) and [PR #279](https://github.com/docker/mcp-gateway/pull/279).
> Use Option A until these are merged.

```bash
git clone https://github.com/null-runner/claude-frontend-sniper.git
cd claude-frontend-sniper
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
- [Claude Code](https://claude.ai/download)

---

## Documentation

- [Setup Guide](SETUP_GUIDE.md) - Manual installation, configuration options
- [Troubleshooting](TROUBLESHOOTING.md) - Common issues and fixes
- [Architecture](ARCHITECTURE.md) - How it works under the hood

---

## How It Works

```
Claude Code
    ↓
Sniper MCP Server (Docker container)
    ↓
Chrome DevTools Protocol
    ↓
Persistent Chrome Browser
```

The key innovation: **Host Header Bypass**. Chrome rejects connections from Docker containers because `host.docker.internal` isn't `localhost`. Sniper spoofs the header.

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

**[Report Bug](https://github.com/null-runner/claude-frontend-sniper/issues)** · **[Request Feature](https://github.com/null-runner/claude-frontend-sniper/issues)**

Made with coffee by [null-runner](https://github.com/null-runner)

</div>
