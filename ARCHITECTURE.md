# Chrome MCP Docker - Architecture

## Overview

Chrome MCP Docker provides persistent Chrome DevTools for AI coding assistants via MCP (Model Context Protocol). It enables Claude Code and other MCP clients to debug frontend UIs with real browser capabilities.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              HOST MACHINE                                    │
│                                                                             │
│  ┌─────────────────────┐        ┌─────────────────────────────────────────┐ │
│  │   Claude Code       │        │         DOCKER                          │ │
│  │   (or any MCP       │        │                                         │ │
│  │    client)          │        │  ┌─────────────────────────────────────┐│ │
│  │                     │        │  │  zenika/alpine-chrome:with-puppeteer││ │
│  │  ┌───────────────┐  │        │  │                                     ││ │
│  │  │ MCP Protocol  │  │ stdio  │  │  • Chromium (headless)              ││ │
│  │  │ (stdin/stdout)│◄─┼────────┼──┤  • Full CSS/font rendering          ││ │
│  │  └───────────────┘  │        │  │  • CDP on port 9222                 ││ │
│  │                     │        │  │  • Persistent session               ││ │
│  └─────────────────────┘        │  │                                     ││ │
│           │                     │  └──────────────┬──────────────────────┘│ │
│           │                     │                 │ :9222                  │ │
│           │                     │  ┌──────────────▼──────────────────────┐│ │
│           │                     │  │  nullrunner/chrome-mcp-docker       ││ │
│           └─────────────────────┼──►                                     ││ │
│                                 │  │  • Node.js 20 Alpine                ││ │
│                                 │  │  • puppeteer-core                   ││ │
│                                 │  │  • MCP SDK                          ││ │
│                                 │  │  • Host Header Bypass               ││ │
│                                 │  │                                     ││ │
│                                 │  │  Tools:                             ││ │
│                                 │  │  ├── navigate                       ││ │
│                                 │  │  ├── screenshot                     ││ │
│                                 │  │  ├── click / type / scroll          ││ │
│                                 │  │  ├── wait_for_selector              ││ │
│                                 │  │  ├── get_computed_styles            ││ │
│                                 │  │  ├── get_network_errors             ││ │
│                                 │  │  ├── get_console_logs               ││ │
│                                 │  │  └── mobile_mode                    ││ │
│                                 │  └─────────────────────────────────────┘│ │
│                                 └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. Chrome Container (zenika/alpine-chrome)

```bash
docker run -d --name chrome-persistent \
  --restart unless-stopped \
  -p 9222:9222 \
  --shm-size=2g \
  zenika/alpine-chrome:with-puppeteer \
  --no-sandbox \
  --remote-debugging-address=0.0.0.0 \
  --remote-debugging-port=9222 \
  --disable-gpu \
  --headless
```

**Why zenika/alpine-chrome?**
| Feature | zenika/alpine-chrome | browserless/chrome |
|---------|---------------------|-------------------|
| Size | ~1.4GB | ~4.5GB |
| Stealth/anti-bot | No | Yes |
| Use case | Debug own sites | Automate external sites |
| Memory | ~300MB | ~500MB |

For UI debugging of your own applications, stealth is not needed. zenika is lightweight and sufficient.

### 2. MCP Server (nullrunner/chrome-mcp-docker)

```dockerfile
FROM node:20-alpine
COPY package.json index.js .
RUN npm install
ENTRYPOINT ["node", "index.js"]
```

**Key Innovation: Host Header Bypass**

Chrome rejects CDP connections from Docker because `host.docker.internal` isn't `localhost`:

```javascript
// Fetch WebSocket endpoint with spoofed Host header
async function getWSEndpoint() {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: CHROME_HOST,
      port: CHROME_PORT,
      path: "/json/version",
      headers: { "Host": "localhost" }  // <-- Bypass Chrome security
    }, ...);
  });
}
```

## Data Flow

```
┌──────────┐   ┌──────────────┐   ┌───────────────┐   ┌─────────────┐
│  Claude  │──▶│ MCP Protocol │──▶│ chrome-mcp-   │──▶│   Chrome    │
│  Code    │   │   (stdio)    │   │ docker        │   │   (CDP)     │
└──────────┘   └──────────────┘   └───────────────┘   └─────────────┘
     │                                    │                   │
     │                                    │                   │
     ▼                                    ▼                   ▼
  "navigate to                      puppeteer.         page.goto()
   localhost:8080"                  connect()          screenshot()
                                                       evaluate()
```

## Tools Reference

| Tool | Description | Use Case |
|------|-------------|----------|
| `navigate` | Go to URL, wait for load | Load pages |
| `screenshot` | JPEG viewport capture | Visual debugging |
| `click` | Click element by selector | Interactions |
| `type` | Type into input field | Form testing |
| `scroll` | Scroll page/element | Long pages |
| `wait_for_selector` | Wait for element | Dynamic content |
| `get_computed_styles` | CSS properties | Style debugging |
| `get_network_errors` | Failed requests | API debugging |
| `get_console_logs` | JS console output | Error hunting |
| `mobile_mode` | Toggle iPhone X viewport | Responsive testing |

## Session Persistence

The MCP server maintains a persistent connection to Chrome:

```javascript
let browser = null;
let page = null;

async function getPage() {
  // Reuse existing page if still valid
  if (page && !page.isClosed() && browser && browser.isConnected()) {
    return page;
  }

  // Reconnect if needed
  const wsEndpoint = await getWSEndpoint();
  browser = await puppeteer.connect({ browserWSEndpoint: wsEndpoint });

  // Reuse first page or create new
  const pages = await browser.pages();
  page = pages[0] || await browser.newPage();

  return page;
}
```

This pattern ensures:
- Sessions survive multiple tool calls
- No "about:blank" crashes
- Cookies/localStorage persist across navigations

## Network Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Docker Network (bridge)                       │
│                                                                 │
│   ┌─────────────────┐            ┌─────────────────────────┐   │
│   │ chrome-mcp-     │◄──────────▶│ chrome-persistent       │   │
│   │ docker          │  internal  │                         │   │
│   │                 │  :9222     │ zenika/alpine-chrome    │   │
│   └────────┬────────┘            └─────────────────────────┘   │
│            │                                                    │
└────────────┼────────────────────────────────────────────────────┘
             │
             │ stdio (MCP)
             ▼
       ┌───────────┐
       │  Claude   │
       │  Code     │
       └───────────┘
```

## Comparison with Related Projects

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MCP Chrome Tools Ecosystem                            │
│                                                                             │
│  ┌─────────────────────────────────┐  ┌─────────────────────────────────┐  │
│  │ chrome-mcp-docker (PUBLIC)      │  │ private-chrome-mcp-docker       │  │
│  │                                 │  │                                 │  │
│  │ Purpose: UI/CSS debugging       │  │ Purpose: Gemini AI automation   │  │
│  │ Chrome: zenika/alpine-chrome    │  │ Chrome: browserless/chrome      │  │
│  │ Stealth: No                     │  │ Stealth: Yes (puppeteer-extra)  │  │
│  │ Accounts: None                  │  │ Accounts: 4 burner containers   │  │
│  │                                 │  │                                 │  │
│  │ Tools:                          │  │ Tools (superset):               │  │
│  │ - navigate                      │  │ - All public tools              │  │
│  │ - screenshot                    │  │ - gemini_send                   │  │
│  │ - click/type/scroll             │  │ - gemini_check_auth             │  │
│  │ - get_computed_styles           │  │ - smart_login                   │  │
│  │ - get_console_logs              │  │ - smart_learn_pattern           │  │
│  │ - mobile_mode                   │  │                                 │  │
│  └─────────────────────────────────┘  └─────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Performance

| Metric | Value |
|--------|-------|
| MCP container memory | ~50MB |
| Chrome container memory | ~300MB |
| Cold start | ~2-3s |
| Warm tool call | <100ms |
| Screenshot size | ~50-100KB (JPEG 80%) |

## Security Considerations

1. **Network**: Chrome only exposed on localhost:9222
2. **Sandbox**: Chrome runs with `--no-sandbox` (required in Docker)
3. **Code execution**: `evaluate` runs JS in page context (sandboxed)
4. **No secrets**: MCP server has no access to host filesystem

## Problems We Solved

This project exists because the official `chrome-devtools-mcp` has critical bugs with Docker:

### 1. The `about:blank` Crash
**Symptom**: Browser shows `about:blank` instead of navigated URL, then crashes.

**Root Cause**: Target Mismatch - MCP connects to browser's root WebSocket but Chrome creates pages with different WebSocket targets. MCP watches wrong target → sees `about:blank`.

**Our Fix**: Single page reuse pattern in `getPage()` - never create new pages, always reuse existing.

### 2. The `_targetId` Crash
```
Error: Cannot read properties of undefined (reading '_targetId')
```

**Root Cause**: Browserless has a Puppeteer proxy layer. Direct CDP connections bypass it → crash.

**Our Fix**: Use `puppeteer.connect()` with Host Header Bypass instead of direct WebSocket.

### 3. Container Exit (stdio EOF)
**Symptom**: MCP container exits immediately with Exit Code 0.

**Root Cause**: MCP uses stdio transport. Without stdin connected, Node.js sees EOF and exits.

**Our Fix**: Always use `-i` flag in Docker run commands.

### 4. Host Header Rejection
**Symptom**: Chrome rejects connections from `host.docker.internal`.

**Our Fix**: Spoof `Host: localhost` header when fetching WebSocket endpoint.

> See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for detailed solutions to common issues.

## Lessons Learned

### What Works
- ✅ `puppeteer.connect()` with Host Header Bypass
- ✅ Single page reuse (eliminates target mismatch)
- ✅ Minimal tool API (less surface area = fewer bugs)
- ✅ Docker `--init` flag (proper signal handling)
- ✅ zenika/alpine-chrome for own-site debugging

### What Doesn't Work
- ❌ Direct CDP WebSocket connections (Browserless proxy rejects)
- ❌ Creating new pages per navigation (causes chaos)
- ❌ `browserURL` parameter (doesn't work with Docker networking)
- ❌ Alpine Chrome without `--shm-size` (Chrome crashes)

## Quick Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Connection refused" | Chrome not running | `docker start chrome-persistent` |
| "about:blank" | Target mismatch | Restart both containers |
| Empty screenshot | Page not loaded | Add wait after navigate |
| Missing fonts | Web fonts blocked | Check CSP headers |
| Container exits | Missing `-i` flag | Add `-i` to docker run |

## References

- [Puppeteer Documentation](https://pptr.dev/)
- [zenika/alpine-chrome](https://github.com/Zenika/alpine-chrome)
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
