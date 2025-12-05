# Chrome DevTools MCP Server

A persistent Chrome DevTools Protocol (CDP) server for the Model Context Protocol (MCP), designed to work with Docker MCP Gateway.

## Features

- **Persistent Sessions**: Page state maintained between tool calls
- **Host Header Workaround**: Bypasses Chrome's localhost-only restriction for Docker containers
- **9 Tools**: Navigate, screenshot, click, type, scroll, wait, CSS inspection, network errors, mobile mode

## Tools

| Tool | Description |
|------|-------------|
| `navigate` | Navigate to URL, wait for network idle |
| `screenshot` | Capture viewport as JPEG |
| `click` | Click element by CSS selector |
| `type` | Type text into input field |
| `scroll` | Scroll by coordinates or to element |
| `wait_for_selector` | Wait for element to appear |
| `get_computed_styles` | Get CSS styles for element |
| `get_network_errors` | List failed network requests |
| `mobile_mode` | Toggle iPhone X viewport |

## Quick Start

### 1. Start Chrome Container

```bash
docker run -d \
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
```

### 2. Add to Docker MCP Gateway

Add to `~/.docker/mcp/catalogs/custom-servers.yaml`:

```yaml
version: 3
name: custom-servers
displayName: Custom MCP Servers
registry:
  chromedev:
    description: Chrome DevTools MCP Server
    title: Chrome DevTools
    type: server
    image: nullrunner/chrome-devtools-mcp:latest
    ref: ""
    tools:
      - name: navigate
      - name: screenshot
      - name: click
      - name: type
      - name: scroll
      - name: wait_for_selector
      - name: get_computed_styles
      - name: get_network_errors
      - name: mobile_mode
    env:
      - name: CHROME_HOST
        value: host.docker.internal
      - name: CHROME_PORT
        value: "9222"
    prompts: 0
    resources: {}
```

### 3. Enable Server

```bash
docker mcp server enable chromedev
docker mcp client connect claude-code
```

## How It Works

### The Host Header Problem

Chrome's DevTools Protocol rejects HTTP requests where the `Host` header is not `localhost` or an IP address. When connecting from a Docker container via `host.docker.internal`, Chrome returns:

```
Host header is specified and is not an IP address or localhost.
```

### The Solution

This server fetches `/json/version` with a spoofed `Host: localhost` header:

```javascript
const req = http.request({
  host: CHROME_HOST,           // host.docker.internal
  port: CHROME_PORT,           // 9222
  path: "/json/version",
  headers: { "Host": "localhost" }  // Trick Chrome
}, ...);
```

Then replaces `ws://localhost/` with the actual host:port in the WebSocket URL.

## Building Locally

```bash
docker build -t chrome-devtools-mcp:latest .
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CHROME_HOST` | `host.docker.internal` | Chrome container hostname |
| `CHROME_PORT` | `9222` | Chrome DevTools port |

## Troubleshooting

### "HTTP Internal Server Error"

Chrome is rejecting the connection. Ensure:
1. Chrome container is running: `docker ps | grep chrome`
2. Port 9222 is accessible: `curl http://localhost:9222/json/version`

### "Unknown tool: chromedev:navigate"

The gateway is using `:` separator but your code expects `__`. This server handles both.

### Screenshots show wrong page

The page state persists. If you navigated elsewhere manually, the server will screenshot that page.

## Architecture

```
Claude Code (WSL)
    ↓
Docker MCP Gateway
    ↓
Chrome DevTools MCP (this container, stdio)
    ↓
Alpine Chrome (persistent, port 9222)
```

## License

MIT

## Author

[null-runner](https://github.com/null-runner)
