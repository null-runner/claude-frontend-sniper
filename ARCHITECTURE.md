# Architecture & Technical Deep Dive

## The Problem We're Solving

### 1. The `about:blank` Crash

When using official `chrome-devtools-mcp` with Browserless/Docker:

**Symptom**: Browser shows `about:blank` instead of the navigated URL, then crashes.

**Root Cause**: **Target Mismatch**
- MCP connects to browser's **root WebSocket** (`ws://host:port/devtools/browser/XXXXX`)
- Browser creates new page with its own WebSocket (`ws://host:port/devtools/page/YYYYY`)
- MCP keeps watching the wrong target → sees `about:blank`
- Eventually Chrome/Puppeteer gets confused and crashes

### 2. The `_targetId` Crash

```
Error: Cannot read properties of undefined (reading '_targetId')
    at Connection.send (puppeteer-core/lib/cjs/puppeteer/common/Connection.js:178:48)
```

**Root Cause**: Browserless Puppeteer Proxy Bug
- Browserless runs a Puppeteer proxy layer between you and Chrome
- When you try to connect directly to a **page target** WebSocket, the proxy fails
- The proxy expects connections to go through `puppeteer.connect()` using its HTTP endpoint
- Direct CDP connections bypass the proxy → undefined `_targetId` → crash

### 3. Container Exit (stdio EOF)

**Symptom**: MCP container exits immediately with Exit Code 0

**Root Cause**:
- MCP servers use stdio transport (stdin/stdout for communication)
- Without stdin connected, the Node.js process sees EOF and exits
- Docker's `-i` flag keeps stdin open, but Docker MCP Gateway doesn't always use it correctly

### 4. Multi-Tab Chaos

**Symptom**: After using `new_page`, navigation stops working and screenshots show wrong content

**Root Cause**:
- Creating multiple tabs makes Chrome juggle multiple page targets
- CDP connections get confused about which target is active
- MCP loses track of the "main" page

## Our Solution: Claude Frontend Sniper

### Core Design Principles

1. **Single Page Only** - Physically remove `new_page` tool
2. **Puppeteer Native Connection** - Use `puppeteer.connect()` instead of direct CDP
3. **Page Target Reuse** - Always reuse the same page, never create new ones
4. **Graceful Restart** - Let Docker handle crashes with `--init` and `--rm`

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│ Claude Code (WSL)                                       │
│  - Sends MCP stdio commands                             │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│ Docker MCP Gateway                                      │
│  - Launches MCP server containers on-demand             │
│  - Manages stdio transport                              │
│  - Hot-loading via mcp-add                              │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│ Claude Frontend Sniper (this container)                 │
│  - Node.js 20 Alpine                                    │
│  - Puppeteer Core 23.10.1                               │
│  - MCP SDK 1.0.1                                        │
│  - Tools: navigate, screenshot, evaluate, console       │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼ puppeteer.connect({ browserURL })
┌─────────────────────────────────────────────────────────┐
│ Browserless Chrome (persistent container)               │
│  - Port 3000 (internal) → 3333 (host)                   │
│  - Full font support for UI debugging                   │
│  - Headless Chrome with CDP enabled                     │
└─────────────────────────────────────────────────────────┘
```

### Key Implementation Details

#### 1. Puppeteer Connection Strategy

```javascript
// ❌ WRONG: Direct CDP connection (causes _targetId crash with Browserless)
const wsEndpoint = 'ws://host:port/devtools/page/XXXXX';
const browser = await puppeteer.connect({ browserWSEndpoint: wsEndpoint });

// ✅ CORRECT: Use browserURL (Puppeteer discovers endpoint via HTTP)
const BROWSER_URL = 'http://host.docker.internal:3333';
const browser = await puppeteer.connect({ browserURL: BROWSER_URL });
```

**Why this works**:
- Puppeteer fetches `/json/version` from the HTTP endpoint
- Gets the correct WebSocket URL from Browserless
- Browserless proxy stays happy
- No `_targetId` crashes

#### 2. Page Reuse Pattern

```javascript
let browser = null;
let page = null;

async function getPage() {
  if (page && !page.isClosed()) return page;  // Reuse existing page

  browser = await puppeteer.connect({ browserURL: BROWSER_URL });

  const pages = await browser.pages();
  if (pages.length > 0) {
    page = pages[0];  // Use first existing page
  } else {
    page = await browser.newPage();  // Create only if none exist
  }

  await page.setViewport({ width: 1920, height: 1080 });
  return page;
}
```

**Benefits**:
- Single page target = no confusion
- Survives multiple navigate calls
- Viewport fixed for consistent screenshots

#### 3. Minimal Tool Surface

We expose ONLY:
- `navigate` - Go to URL
- `screenshot` - Take JPEG screenshot (base64)
- `evaluate` - Run JavaScript in page context
- `get_console_logs` - Get browser console output

**Deliberately omitted**:
- ❌ `new_page` - Causes multi-tab chaos
- ❌ `close_page` - Would kill our only page
- ❌ `list_tabs` - We don't do tabs
- ❌ `click`, `type`, etc. - Use Playwright MCP for that

### Docker Configuration

#### Chrome Container (Browserless)

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

**Why these flags**:
- `ENABLE_DEBUGGER=true` - Enables CDP on port 3000
- `CONNECTION_TIMEOUT=600000` - 10min timeout for long debugging sessions
- `--shm-size=2gb` - Chrome needs shared memory for rendering
- Port mapping `3333:3000` - Internal Browserless port is 3000

#### MCP Server Container (Sniper)

Launched on-demand by Docker MCP Gateway:

```bash
docker run -i --rm --init \
  -e CHROME_HOST=host.docker.internal \
  -e CHROME_PORT=3333 \
  claude-frontend-sniper:latest
```

**Why these flags**:
- `-i` - Keep stdin open (MCP stdio transport)
- `--rm` - Auto-cleanup when stopped
- `--init` - Proper signal handling for graceful shutdown
- `host.docker.internal` - Docker's magic DNS for host network

## Troubleshooting

### Container Exits Immediately

**Symptom**: `docker ps` shows no sniper container running

**Cause**: stdin not connected (MCP sees EOF)

**Fix**: Ensure Docker MCP Gateway catalog uses `-i` flag:
```yaml
args:
  - run
  - -i  # ← Critical
  - --rm
  - --init
  # ...
```

### "Connection refused" to Chrome

**Symptom**: `Error: connect ECONNREFUSED`

**Checks**:
1. Is Chrome container running? `docker ps | grep chrome`
2. Is port 3333 bound? `curl http://localhost:3333/json/version`
3. Correct hostname? Use `host.docker.internal` (not `localhost`)

**Fix**: Restart Chrome container with correct flags

### Tools Not Loading in Claude Code

**Symptom**: `mcp-add chromedev` returns "Connection closed"

**Cause**: Gateway not starting or catalog not found

**Checks**:
1. Is Gateway in `~/.claude.json`? `cat ~/.claude.json | jq .mcpServers`
2. Catalog path correct? Use absolute Windows path
3. No local `.mcp.json` overriding? `ls -la .mcp.json`

**Fix**:
```bash
# Use global config, remove project-level overrides
rm .mcp.json  # If exists in project
# Edit ~/.claude.json to add Gateway
```

### Screenshot Shows Wrong Page

**Symptom**: Screenshot shows old content after navigation

**Cause**: Page not waiting for load

**Fix**: Our `navigate` uses `waitUntil: 'domcontentloaded'` - might need `networkidle0` for SPAs:

```javascript
await page.goto(url, { waitUntil: 'networkidle0' });
```

## Lessons Learned

### What Worked

1. ✅ **Puppeteer `browserURL`** - Solves Browserless proxy issues
2. ✅ **Single page reuse** - Eliminates target mismatch
3. ✅ **Minimal tool API** - Less surface area = fewer bugs
4. ✅ **Docker `--init`** - Proper signal handling prevents zombie processes
5. ✅ **Global Gateway config** - Hot-loading works across all projects

### What Didn't Work

1. ❌ **Direct CDP connections** - Browserless proxy rejects them
2. ❌ **Page Target Lock via bash** - Targets keep changing/disappearing
3. ❌ **Alpine Chrome** - Missing fonts, renders UI incorrectly
4. ❌ **Project-local MCP config** - Overrides global, breaks hot-loading
5. ❌ **`longLived: true` catalog flag** - Gateway ignores it, not a real feature

### Critical Insights

**Target Mismatch is the root of all evil**:
- `about:blank` crashes
- Screenshot mismatches
- Navigation failures
→ **Solution**: Never create new pages, always reuse one page

**Browserless needs special handling**:
- Has a Puppeteer proxy layer
- Doesn't like direct WebSocket connections
- Works beautifully with `puppeteer.connect({ browserURL })`
→ **Solution**: Let Puppeteer discover the endpoint via HTTP

**Docker MCP Gateway is finnicky**:
- Silently fails if catalog path is wrong
- Project config overrides global (counter-intuitive)
- Requires `-i` flag but doesn't always apply it
→ **Solution**: Use global `~/.claude.json`, test catalog with manual `docker run`

## Performance Considerations

### Startup Time
- **Cold start**: ~2-3s (Puppeteer connection + page setup)
- **Warm calls**: <100ms (page already exists)

### Memory Usage
- **Sniper container**: ~50MB (Node + Puppeteer)
- **Chrome container**: ~300-400MB (Browserless)
- **Total**: ~450MB persistent

### Optimization Tips

1. **Keep Chrome running** - Don't restart it, use `--restart unless-stopped`
2. **Reuse pages** - Our `getPage()` pattern caches the page object
3. **JPEG screenshots** - 80% quality is 10x smaller than PNG, looks identical
4. **Viewport lock** - Fixed 1920x1080 = consistent rendering

## Security Notes

### Network Isolation

Chrome container is exposed on `localhost:3333`:
- ✅ Not accessible from external network
- ✅ Only containers on `host.docker.internal` can reach it
- ⚠️ Any process on the host can access it

**Recommendation**: Use Docker networks for production:
```bash
docker network create chrome-net
# Run both containers on chrome-net instead of host
```

### Code Execution Risk

`evaluate` tool runs arbitrary JavaScript in browser:
- ✅ Sandboxed in Chrome renderer process
- ✅ No access to Node.js/filesystem
- ⚠️ Can access any page content (cookies, localStorage, DOM)

**Recommendation**: Trust the AI or restrict with MCP permissions

## Future Improvements

### Potential Features
- [ ] Multi-browser support (Firefox via Playwright)
- [ ] Mobile viewport presets
- [ ] Video recording (Browserless supports it)
- [ ] Network HAR export
- [ ] Accessibility tree inspection

### Known Limitations
- **No interaction tools** - Use Playwright MCP for clicks/forms
- **Single page only** - Can't debug multi-tab apps
- **No browser extensions** - Headless Chrome limitation
- **Font rendering differences** - Even Browserless isn't pixel-perfect vs real Chrome

## References

- [Puppeteer Documentation](https://pptr.dev/)
- [Browserless Docker Hub](https://hub.docker.com/r/browserless/chrome)
- [Docker MCP Gateway GitHub](https://github.com/docker/mcp-gateway)
- [Model Context Protocol Spec](https://modelcontextprotocol.io/)
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)
