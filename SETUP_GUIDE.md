# Complete Setup Guide

This guide walks you through setting up Claude Frontend Sniper from scratch, with detailed explanations and troubleshooting.

## Prerequisites

- Docker Desktop installed and running
- Docker MCP Gateway plugin installed (`docker mcp --version` should work)
- Claude Code or Claude Desktop
- WSL2 (if on Windows) or Linux/Mac terminal

## Step-by-Step Setup

### Step 1: Start the Chrome Browser Container

This container runs persistently and provides the browser that Sniper connects to.

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

**Verify it's running**:
```bash
# Check container status
docker ps | grep chrome-devtools-browser

# Test CDP endpoint
curl http://localhost:3333/json/version
# Should return JSON with browser version
```

**Troubleshooting**:
- If port 3333 is already in use: Change `-p 3333:3000` to another port (e.g., `-p 3334:3000`)
- If container exits: Check logs with `docker logs chrome-devtools-browser`
- If Chrome crashes: Increase `--shm-size` to `4gb`

---

### Step 2: Build the Sniper MCP Server Image

Clone or download this repository, then build the Docker image:

```bash
cd claude-frontend-sniper
docker build -t claude-frontend-sniper:latest .
```

**Verify build succeeded**:
```bash
docker images | grep claude-frontend-sniper
# Should show: claude-frontend-sniper   latest   <IMAGE_ID>   <SIZE>
```

**Troubleshooting**:
- If npm install fails: Check internet connection
- If build hangs: Docker may be downloading base image, wait 2-3 minutes
- If out of disk space: Run `docker system prune` to clean up

---

### Step 3: Configure Docker MCP Gateway

You have two options:

#### Option A: Global Configuration (Recommended)

This makes Sniper available across all your projects.

**1. Copy the catalog to Docker's MCP directory**:
```bash
# On Windows/WSL
cp catalogs/sniper-catalog.yaml /mnt/c/Users/YOUR_USERNAME/.docker/mcp/catalogs/

# On Linux
cp catalogs/sniper-catalog.yaml ~/.docker/mcp/catalogs/

# On Mac
cp catalogs/sniper-catalog.yaml ~/Library/Containers/com.docker.docker/Data/mcp/catalogs/
```

**2. Configure Claude Code to use the Gateway**:

Edit `~/.claude.json` (create if it doesn't exist):

```json
{
  "mcpServers": {
    "MCP_DOCKER": {
      "command": "docker",
      "args": [
        "mcp",
        "gateway",
        "run",
        "--additional-catalog",
        "C:\\Users\\YOUR_USERNAME\\.docker\\mcp\\catalogs\\sniper-catalog.yaml"
      ],
      "env": {
        "LOCALAPPDATA": "C:\\Users\\YOUR_USERNAME\\AppData\\Local",
        "ProgramData": "C:\\ProgramData",
        "ProgramFiles": "C:\\Program Files"
      },
      "type": "stdio"
    }
  }
}
```

**IMPORTANT**:
- Use **Windows paths** (e.g., `C:\Users\...`) even on WSL
- Replace `YOUR_USERNAME` with your actual Windows username
- Use double backslashes `\\` in JSON

**3. Remove any project-local MCP configs**:
```bash
# In your project directory
rm .mcp.json  # If it exists
```

**4. Restart Claude Code**

#### Option B: Connect Docker Desktop to Claude Code

Simpler but less flexible:

```bash
# In your project directory
docker mcp client connect claude-code
```

This creates `.mcp.json` in the current project but doesn't include custom catalogs by default.

---

### Step 4: Enable Sniper in Claude Code

After restarting Claude Code:

```bash
# Load the chromedev server
mcp-add chromedev
```

You should see a success message. The server is now loaded and ready to use.

**Verify tools are available**:

In Claude Code, check that these tools are now available:
- `chromedev:navigate`
- `chromedev:screenshot`
- `chromedev:evaluate`
- `chromedev:get_console_logs`

**Troubleshooting**:
- `Connection closed` error → Gateway not starting, check `~/.claude.json` config
- `Server not found` → Catalog path wrong or not loaded
- No tools showing → Server enabled but crashed, check Docker logs

---

### Step 5: Test the Setup

Try a simple navigation and screenshot:

```bash
# Navigate to a website
chromedev:navigate url="https://stripe.com"

# Take a screenshot
chromedev:screenshot
```

You should see:
1. Navigation confirmation message
2. A screenshot image of Stripe's homepage

**Troubleshooting**:
- Screenshot shows blank/error page → Chrome container not running
- `Connection refused` → Wrong CHROME_PORT or Chrome not accessible
- Screenshot shows "about:blank" → Old bug is back, check ARCHITECTURE.md

---

## Configuration Options

### Environment Variables

You can customize the Sniper container behavior:

| Variable | Default | Description |
|----------|---------|-------------|
| `CHROME_HOST` | `host.docker.internal` | Hostname of Chrome container |
| `CHROME_PORT` | `3333` | Port where Chrome CDP is exposed |

**Example**: If you changed Chrome port to 3334:

Edit `catalogs/sniper-catalog.yaml`:
```yaml
args:
  # ...
  - -e
  - CHROME_PORT=3334  # Changed from 3333
  - claude-frontend-sniper:latest
```

### Chrome Container Options

You can customize the Chrome container:

**Higher timeout** (for slow networks):
```bash
-e CONNECTION_TIMEOUT=1200000  # 20 minutes
```

**Different viewport** (requires rebuilding Sniper with custom viewport):
```javascript
// In index.js
await page.setViewport({ width: 2560, height: 1440 });  // 2K
```

**Enable extensions** (Browserless doesn't support this well, but you can try):
```bash
-e ENABLE_EXTENSIONS=true
```

---

## Platform-Specific Notes

### Windows + WSL2

**Path translation**:
- WSL path: `/home/user/project`
- Windows path: `\\wsl.localhost\Ubuntu\home\user\project`
- Use Windows paths in `~/.claude.json`

**Docker context**:
- Docker Desktop runs on Windows, not WSL
- Use `host.docker.internal` to reach localhost from containers
- `docker` command in WSL talks to Windows Docker

### Linux

**Direct paths**:
- No WSL translation needed
- Use `localhost` or `127.0.0.1` instead of `host.docker.internal`
- MCP catalog paths: `~/.docker/mcp/catalogs/`

**Update catalog for Linux**:
```yaml
args:
  # ...
  - -e
  - CHROME_HOST=172.17.0.1  # Docker bridge network
  # ...
```

### macOS

**Docker Desktop**:
- Similar to Windows setup
- Use `host.docker.internal`
- Catalog path: `~/Library/Containers/com.docker.docker/Data/mcp/catalogs/`

---

## Uninstallation

To completely remove Claude Frontend Sniper:

```bash
# 1. Stop and remove containers
docker stop claude-frontend-sniper-instance 2>/dev/null
docker stop chrome-devtools-browser
docker rm chrome-devtools-browser

# 2. Remove images
docker rmi claude-frontend-sniper:latest
docker rmi browserless/chrome:latest

# 3. Remove catalog
rm ~/.docker/mcp/catalogs/sniper-catalog.yaml

# 4. Remove MCP config from ~/.claude.json
# (manually edit and remove the MCP_DOCKER section)

# 5. Restart Claude Code
```

---

## Updating

When a new version is released:

```bash
# 1. Pull latest code
cd claude-frontend-sniper
git pull

# 2. Rebuild image
docker build -t claude-frontend-sniper:latest .

# 3. Restart Claude Code
# The Gateway will use the new image on next mcp-add
```

**Note**: The Chrome container doesn't need rebuilding unless you want to update Browserless.

---

## Advanced: Running Without Docker Desktop

If you're using Docker Engine (not Desktop):

**1. Install MCP Gateway manually**:
```bash
# Download from https://github.com/docker/mcp-gateway/releases
wget https://github.com/docker/mcp-gateway/releases/download/v1.0.0/docker-mcp-linux-amd64
chmod +x docker-mcp-linux-amd64
sudo mv docker-mcp-linux-amd64 /usr/local/bin/docker-mcp
```

**2. Run Gateway manually**:
```bash
docker-mcp gateway run --additional-catalog /path/to/sniper-catalog.yaml
```

**3. Configure Claude Code** to use the manual gateway binary instead of `docker mcp`.

---

## Getting Help

If you're stuck:

1. **Check the logs**:
   ```bash
   # Chrome container logs
   docker logs chrome-devtools-browser

   # Sniper container logs (if it stays up)
   docker logs claude-frontend-sniper-instance
   ```

2. **Test components individually**:
   ```bash
   # Test Chrome is accessible
   curl http://localhost:3333/json/version

   # Test Sniper can start
   docker run -i --rm --init \
     -e CHROME_HOST=host.docker.internal \
     -e CHROME_PORT=3333 \
     claude-frontend-sniper:latest
   # (Type Ctrl+C to exit)
   ```

3. **Read the troubleshooting docs**:
   - `ARCHITECTURE.md` - Technical deep dive
   - `README.md` - Quick reference
   - GitHub Issues - Community solutions

4. **Open an issue** on GitHub with:
   - Your OS and Docker version
   - Error messages from logs
   - Steps to reproduce
