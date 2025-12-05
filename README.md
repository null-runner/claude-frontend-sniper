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

## Quick Start

```bash
# Clone
git clone https://github.com/null-runner/claude-frontend-sniper.git
cd claude-frontend-sniper

# Setup (starts Chrome + configures Claude Code)
./setup.sh
```

That's it. Ask Claude: *"Navigate to my localhost:3000 and take a screenshot"*

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
Claude Code (WSL/Mac/Linux)
    ↓
Docker MCP Gateway
    ↓
Sniper MCP Server (this container)
    ↓
Chrome DevTools Protocol
    ↓
Persistent Chrome Browser
```

The key innovation: **Host Header Bypass**. Chrome rejects connections from Docker containers because `host.docker.internal` isn't `localhost`. Sniper spoofs the header.

---

## License

MIT

---

<div align="center">

**[Report Bug](https://github.com/null-runner/claude-frontend-sniper/issues)** · **[Request Feature](https://github.com/null-runner/claude-frontend-sniper/issues)**

Made with coffee by [null-runner](https://github.com/null-runner)

</div>
