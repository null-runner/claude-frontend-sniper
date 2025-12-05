# Troubleshooting Guide

Common issues and their solutions, learned from real-world debugging.

## Issue Index

1. [Container Exits Immediately](#container-exits-immediately)
2. [MCP Tools Not Loading](#mcp-tools-not-loading)
3. [Connection Refused to Chrome](#connection-refused-to-chrome)
4. [about:blank Still Appears](#aboutblank-still-appears)
5. [_targetId Crash Returns](#_targetid-crash-returns)
6. [Screenshot Shows Wrong Content](#screenshot-shows-wrong-content)
7. [Gateway Not Starting](#gateway-not-starting)
8. [Tools Load But Don't Work](#tools-load-but-dont-work)
9. [High Memory Usage](#high-memory-usage)
10. [Slow Navigation](#slow-navigation)

---

## Container Exits Immediately

**Symptom**:
```bash
docker ps  # Shows no claude-frontend-sniper container
docker logs claude-frontend-sniper-instance  # Container not found
```

**Diagnosis**:

MCP servers use stdio transport. Without stdin connected, Node.js sees EOF and exits gracefully.

**Solution 1: Check catalog has `-i` flag**

Edit `sniper-catalog.yaml`:
```yaml
args:
  - run
  - -i      # ← Must be present
  - --rm
  - --init
  # ...
```

**Solution 2: Test manual run**

```bash
# Should start and wait for input
docker run -i --rm --init \
  -e CHROME_HOST=host.docker.internal \
  -e CHROME_PORT=3333 \
  claude-frontend-sniper:latest

# If it exits immediately → Node.js error, check build
# If it waits → stdio working correctly
# Press Ctrl+C to exit
```

**Solution 3: Check Docker MCP Gateway version**

```bash
docker mcp --version
# Should be >= 1.0.0
```

Older versions might not handle `-i` correctly.

---

## MCP Tools Not Loading

**Symptom**:
```bash
mcp-add chromedev
# Error: Connection closed
```

Or tools list doesn't show `chromedev:navigate`, etc.

**Diagnosis**: Gateway not starting, catalog not found, or server crashed on startup.

**Step 1: Verify Gateway is configured**

```bash
cat ~/.claude.json | jq .mcpServers
# Should show MCP_DOCKER entry
```

If empty or missing:
```json
{
  "mcpServers": {
    "MCP_DOCKER": {
      "command": "docker",
      "args": ["mcp", "gateway", "run", "--additional-catalog", "C:\\Users\\...\\sniper-catalog.yaml"],
      "type": "stdio"
    }
  }
}
```

**Step 2: Check for project-level override**

```bash
ls -la .mcp.json
# If exists → it's overriding global config!
```

**Fix**: Remove it:
```bash
rm .mcp.json
```

**Step 3: Verify catalog path is correct**

```bash
# On Windows/WSL, use Windows path:
ls /mnt/c/Users/YOUR_USERNAME/.docker/mcp/catalogs/sniper-catalog.yaml

# Should exist and be readable
```

**Step 4: Check Gateway process**

```bash
# On Linux/Mac
ps aux | grep "docker mcp gateway"

# On Windows (PowerShell)
Get-Process | Select-String "docker"
```

If no process found → Gateway didn't start → check Claude Code logs.

**Step 5: Test catalog manually**

```bash
docker mcp gateway run --additional-catalog /path/to/sniper-catalog.yaml
# Should start without errors
# Press Ctrl+C to stop
```

If errors appear → catalog YAML syntax issue.

---

## Connection Refused to Chrome

**Symptom**:
```
Error: connect ECONNREFUSED 127.0.0.1:3333
```

Or:
```
Error: Failed to connect to Chrome
```

**Diagnosis**: Chrome container not running, wrong port, or wrong hostname.

**Step 1: Verify Chrome is running**

```bash
docker ps | grep chrome-devtools-browser
# Should show: Up X minutes, 0.0.0.0:3333->3000/tcp
```

If not running:
```bash
docker start chrome-devtools-browser
# Or re-create it (see SETUP_GUIDE.md)
```

**Step 2: Test Chrome CDP endpoint**

```bash
curl http://localhost:3333/json/version
# Should return JSON with Chrome version
```

If connection refused → port not bound:
```bash
# Check what's on port 3333
netstat -tuln | grep 3333  # Linux/Mac
netstat -ano | findstr 3333  # Windows
```

**Step 3: Check hostname configuration**

In `sniper-catalog.yaml`:
```yaml
- -e
- CHROME_HOST=host.docker.internal  # ← Correct for Docker Desktop
```

**Platform-specific hostnames**:
- Windows/WSL + Docker Desktop: `host.docker.internal` ✅
- Linux + Docker Engine: `172.17.0.1` (Docker bridge) ✅
- macOS + Docker Desktop: `host.docker.internal` ✅

**Step 4: Verify port mapping**

Chrome container must map internal port `3000` to host port `3333`:
```bash
docker inspect chrome-devtools-browser | grep -A 5 PortBindings
# Should show: "3000/tcp": [{"HostPort": "3333"}]
```

If wrong → recreate container with correct `-p 3333:3000`.

---

## about:blank Still Appears

**Symptom**: Screenshot shows blank page or "data:text/html..." instead of the URL you navigated to.

**Diagnosis**: The core bug we're supposed to fix! This means:
1. Multi-tab issue (new pages created)
2. Target mismatch (wrong WebSocket)
3. Navigation didn't wait for load

**Solution 1: Verify single-page enforcement**

Check `index.js`:
```javascript
// Should NOT have:
// - new_page tool
// - browser.newPage() calls (except in getPage() first-time setup)
```

**Solution 2: Check navigation wait condition**

In `index.js`, navigate handler:
```javascript
await page.goto(url, { waitUntil: 'domcontentloaded' });
```

For SPAs, try:
```javascript
await page.goto(url, { waitUntil: 'networkidle0' });
```

**Solution 3: Test outside MCP**

```bash
# Start container manually
docker run -i --rm --init \
  -e CHROME_HOST=host.docker.internal \
  -e CHROME_PORT=3333 \
  claude-frontend-sniper:latest
```

Then send MCP command via stdin (complex, use for debugging only).

**Solution 4: Check Chrome container health**

```bash
docker logs chrome-devtools-browser | tail -20
# Look for crashes or errors
```

If Chrome keeps restarting → increase `--shm-size`:
```bash
docker rm -f chrome-devtools-browser
docker run -d ... --shm-size=4gb ...  # Increased from 2gb
```

---

## _targetId Crash Returns

**Symptom**:
```
Error: Cannot read properties of undefined (reading '_targetId')
```

**Diagnosis**: Direct CDP connection attempted instead of Puppeteer's HTTP discovery.

**Solution**: Verify `index.js` uses `browserURL`, not `browserWSEndpoint`:

```javascript
// ❌ WRONG:
const wsEndpoint = `ws://${CHROME_HOST}:${CHROME_PORT}/devtools/page/XXXXX`;
const browser = await puppeteer.connect({ browserWSEndpoint: wsEndpoint });

// ✅ CORRECT:
const BROWSER_URL = `http://${CHROME_HOST}:${CHROME_PORT}`;
const browser = await puppeteer.connect({ browserURL: BROWSER_URL });
```

If code is correct but error persists:
- Rebuild image: `docker build -t claude-frontend-sniper:latest .`
- Clear Docker cache: `docker system prune -a`
- Verify no old image: `docker images | grep claude-frontend-sniper`

---

## Screenshot Shows Wrong Content

**Symptom**: Screenshot shows content from a previous navigation, not current page.

**Diagnosis**: Page not fully loaded, or page object stale.

**Solution 1: Add wait after navigation**

```javascript
// In navigate handler
await page.goto(url, { waitUntil: 'networkidle0' });  // Stricter wait
await page.waitForTimeout(1000);  // Extra 1s buffer
```

**Solution 2: Check viewport**

```javascript
// In getPage()
await page.setViewport({ width: 1920, height: 1080 });
```

If you need different viewport, modify and rebuild.

**Solution 3: Clear cache before navigation**

```javascript
// Before goto
await page.setCacheEnabled(false);
await page.goto(url, { waitUntil: 'domcontentloaded' });
```

---

## Gateway Not Starting

**Symptom**: No Gateway process running, `mcp-add` does nothing.

**Diagnosis**: Config error, binary not found, or Claude Code not loading config.

**Step 1: Check Claude Code is reading config**

Restart Claude Code with verbose logging:
```bash
# In terminal before starting Claude Code
export CLAUDE_DEBUG=1
```

Check logs for MCP initialization errors.

**Step 2: Test Gateway manually**

```bash
docker mcp gateway run
# Should start and wait
```

If error → Docker MCP plugin issue:
```bash
docker plugin ls | grep mcp
# Should show: docker/mcp   enabled
```

If not enabled:
```bash
docker plugin enable docker/mcp
```

**Step 3: Verify command path**

In `~/.claude.json`:
```json
"command": "docker"  // ← Must be findable in PATH
```

Test:
```bash
which docker  # Should return /usr/bin/docker or similar
```

**Step 4: Check file permissions**

```bash
ls -la ~/.claude.json
# Should be readable: -rw-r--r--
```

If wrong:
```bash
chmod 644 ~/.claude.json
```

---

## Tools Load But Don't Work

**Symptom**: `mcp-add chromedev` succeeds, tools show up, but calling them fails.

**Diagnosis**: Server started but can't connect to Chrome, or tool logic error.

**Test each tool individually**:

```bash
# 1. Navigate
chromedev:navigate url="https://example.com"
# Should return: "Navigated to https://example.com"

# 2. Screenshot
chromedev:screenshot
# Should return base64 image

# 3. Evaluate
chromedev:evaluate script="document.title"
# Should return page title

# 4. Console logs
chromedev:get_console_logs
# Should return: "Not implemented" or actual logs
```

**If navigate fails**:
- Check Chrome container (see "Connection Refused" section)

**If screenshot fails**:
- Check viewport setup in `index.js`
- Verify page loaded: try evaluate first

**If evaluate fails**:
- Check for JavaScript errors in page context
- Try simple script: `"1 + 1"`

---

## High Memory Usage

**Symptom**: Docker using >1GB RAM, system slowing down.

**Diagnosis**: Chrome memory leak, too many dead tabs, or large pages.

**Solution 1: Restart Chrome container**

```bash
docker restart chrome-devtools-browser
# Fresh start, clears memory
```

**Solution 2: Limit Chrome memory**

```bash
docker update chrome-devtools-browser --memory=512m
# Hard limit at 512MB
```

**Solution 3: Check for tab leaks**

```bash
curl http://localhost:3333/json | jq length
# Should show 1-2 (if Sniper is working correctly)
```

If many tabs → bug in Sniper, rebuild from clean repo.

---

## Slow Navigation

**Symptom**: Navigate takes >10 seconds, or timeouts.

**Diagnosis**: Network issue, heavy page, or wait condition too strict.

**Solution 1: Increase timeout**

In `index.js`:
```javascript
await page.goto(url, {
  waitUntil: 'domcontentloaded',
  timeout: 30000  // 30 seconds (default is 30s)
});
```

**Solution 2: Use lighter wait condition**

```javascript
// Fastest (may miss content):
waitUntil: 'domcontentloaded'

// Balanced:
waitUntil: 'load'

// Slowest (waits for all network):
waitUntil: 'networkidle0'
```

**Solution 3: Check Chrome logs**

```bash
docker logs chrome-devtools-browser | grep -i error
# Look for network errors, crashes
```

**Solution 4: Test network from container**

```bash
docker exec chrome-devtools-browser curl -I https://example.com
# Should return 200 OK
```

---

## Still Stuck?

If none of these solutions work:

1. **Collect diagnostic info**:
   ```bash
   # Save to a file
   {
     echo "=== Docker Version ==="
     docker --version
     echo "=== Running Containers ==="
     docker ps
     echo "=== Chrome Logs ==="
     docker logs chrome-devtools-browser --tail 50
     echo "=== MCP Config ==="
     cat ~/.claude.json
     echo "=== Catalog ==="
     cat /path/to/sniper-catalog.yaml
   } > diagnostic.txt
   ```

2. **Open a GitHub issue** with:
   - `diagnostic.txt` contents
   - Your OS and architecture
   - Exact error message
   - Steps to reproduce

3. **Check existing issues**: [GitHub Issues](https://github.com/YOUR_USERNAME/claude-frontend-sniper/issues)

4. **Read the architecture docs**: `ARCHITECTURE.md` has deep technical details

---

## Quick Reference: Common Fixes

| Issue | Quick Fix |
|-------|-----------|
| Container exits | Add `-i` flag to catalog |
| Connection refused | Start Chrome: `docker start chrome-devtools-browser` |
| Tools not loading | Remove `.mcp.json` in project |
| Gateway not starting | Check `~/.claude.json` has `MCP_DOCKER` |
| about:blank appearing | Rebuild from clean repo |
| High memory | Restart Chrome container |
| Slow navigation | Change `waitUntil: 'domcontentloaded'` |

---

## Emergency Reset

If everything is broken:

```bash
# 1. Stop all containers
docker stop $(docker ps -q --filter ancestor=claude-frontend-sniper)
docker stop chrome-devtools-browser

# 2. Remove all containers and images
docker rm chrome-devtools-browser
docker rmi claude-frontend-sniper:latest

# 3. Remove configs
rm ~/.claude.json
rm .mcp.json  # In project directory

# 4. Start fresh
# Follow SETUP_GUIDE.md from Step 1
```

This nuclear option clears all state and lets you start clean.
