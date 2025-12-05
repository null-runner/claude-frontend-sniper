#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import puppeteer from "puppeteer-core";
import http from "http";

const CHROME_HOST = process.env.CHROME_HOST || "host.docker.internal";
const CHROME_PORT = process.env.CHROME_PORT || "9222";

let browser = null;
let page = null;
// Store per i log di rete e console
const requestLogs = [];
const consoleLogs = [];

// Fetch WS endpoint with localhost Host header to bypass Chrome security check
async function getWSEndpoint() {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: CHROME_HOST,
      port: CHROME_PORT,
      path: "/json/version",
      headers: { "Host": "localhost" }  // Trick Chrome into accepting the request
    }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          // Replace localhost with actual host:port in WS URL
          // Chrome returns ws://localhost/devtools/... without port
          const wsUrl = json.webSocketDebuggerUrl
            .replace("ws://localhost/", `ws://${CHROME_HOST}:${CHROME_PORT}/`)
            .replace("ws://localhost:", `ws://${CHROME_HOST}:`);
          resolve(wsUrl);
        } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function getPage() {
  if (page && !page.isClosed() && browser && browser.isConnected()) return page;
  try {
    if (!browser || !browser.isConnected()) {
        const wsEndpoint = await getWSEndpoint();
        browser = await puppeteer.connect({ browserWSEndpoint: wsEndpoint });
    }
    const pages = await browser.pages();
    if (pages.length > 0) {
        page = pages[0];
        await page.bringToFront();
    } else {
        page = await browser.newPage();
    }

    // Setup Listeners (Network & Console Spy)
    page.removeAllListeners('requestfailed');
    page.removeAllListeners('console');

    if (requestLogs.length > 100) requestLogs.length = 0;

    page.on('requestfailed', request => {
      requestLogs.push({
        url: request.url(),
        method: request.method(),
        error: request.failure().errorText
      });
    });

    page.on('console', msg => {
        consoleLogs.push({ type: msg.type(), text: msg.text() });
        if (consoleLogs.length > 100) consoleLogs.shift();
    });

    await page.setViewport({ width: 1920, height: 1080 });
    return page;
  } catch (err) { console.error(err); process.exit(1); }
}

const server = new Server({ name: "sniper", version: "3.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "navigate",
        description: "Navigates to a URL and waits for network idle.",
        inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] }
      },
      {
        name: "screenshot",
        description: "Takes a screenshot of the viewport. Returns base64.",
        inputSchema: { type: "object", properties: {} }
      },
      {
        name: "click",
        description: "Clicks an element identified by CSS selector.",
        inputSchema: { type: "object", properties: { selector: { type: "string" } }, required: ["selector"] }
      },
      {
        name: "type",
        description: "Types text into an input field.",
        inputSchema: { type: "object", properties: { selector: { type: "string" }, text: { type: "string" } }, required: ["selector", "text"] }
      },
      {
        name: "scroll",
        description: "Scrolls the page. Use x,y coordinates OR selector to scroll into view.",
        inputSchema: { type: "object", properties: { x: { type: "number" }, y: { type: "number" }, selector: { type: "string" } } }
      },
      {
        name: "wait_for_selector",
        description: "Waits for an element to appear in the DOM.",
        inputSchema: { type: "object", properties: { selector: { type: "string" }, timeout: { type: "number" } }, required: ["selector"] }
      },
      {
        name: "get_computed_styles",
        description: "Returns the computed CSS styles for an element (essential for UI debugging).",
        inputSchema: { type: "object", properties: { selector: { type: "string" } }, required: ["selector"] }
      },
      {
        name: "get_network_errors",
        description: "Returns a list of failed network requests.",
        inputSchema: { type: "object", properties: {} }
      },
      {
        name: "mobile_mode",
        description: "Toggles mobile viewport (iPhone X dimensions).",
        inputSchema: { type: "object", properties: { enable: { type: "boolean" } }, required: ["enable"] }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const p = await getPage();
  // Robust prefix stripping - handle both : and _ separators
  let name = request.params.name;
  if (name.includes("__")) name = name.split("__").pop();
  else if (name.includes(":")) name = name.split(":").pop();
  else if (name.startsWith("chromedev_")) name = name.replace("chromedev_", "");

  try {
    if (name === "navigate") {
      await p.goto(request.params.arguments.url, { waitUntil: "networkidle2", timeout: 30000 });
      return { content: [{ type: "text", text: `Navigated to ${request.params.arguments.url}` }] };
    }
    if (name === "screenshot") {
      const b64 = await p.screenshot({ encoding: "base64", type: "jpeg", quality: 80 });
      return { content: [{ type: "image", data: b64, mimeType: "image/jpeg" }] };
    }
    if (name === "click") {
      await p.click(request.params.arguments.selector);
      return { content: [{ type: "text", text: `Clicked ${request.params.arguments.selector}` }] };
    }
    if (name === "type") {
      await p.type(request.params.arguments.selector, request.params.arguments.text);
      return { content: [{ type: "text", text: `Typed into ${request.params.arguments.selector}` }] };
    }
    if (name === "scroll") {
        if (request.params.arguments.selector) {
            await p.evaluate((sel) => { document.querySelector(sel)?.scrollIntoView(); }, request.params.arguments.selector);
            return { content: [{ type: "text", text: `Scrolled to ${request.params.arguments.selector}` }] };
        } else {
            await p.evaluate((x, y) => { window.scrollBy(x || 0, y || 0); }, request.params.arguments.x, request.params.arguments.y);
            return { content: [{ type: "text", text: "Scrolled page" }] };
        }
    }
    if (name === "wait_for_selector") {
        await p.waitForSelector(request.params.arguments.selector, { timeout: request.params.arguments.timeout || 5000 });
        return { content: [{ type: "text", text: `Element ${request.params.arguments.selector} found` }] };
    }
    if (name === "get_computed_styles") {
        const styles = await p.evaluate((selector) => {
            const el = document.querySelector(selector);
            if (!el) return "Element not found";
            const s = window.getComputedStyle(el);
            return {
                color: s.color,
                backgroundColor: s.backgroundColor,
                fontFamily: s.fontFamily,
                fontSize: s.fontSize,
                display: s.display,
                position: s.position,
                margin: s.margin,
                padding: s.padding,
                width: s.width,
                height: s.height,
                zIndex: s.zIndex
            };
        }, request.params.arguments.selector);
        return { content: [{ type: "text", text: JSON.stringify(styles, null, 2) }] };
    }
    if (name === "get_network_errors") {
        const errors = requestLogs.slice();
        requestLogs.length = 0;
        return { content: [{ type: "text", text: errors.length ? JSON.stringify(errors, null, 2) : "No network errors detected." }] };
    }
    if (name === "mobile_mode") {
      if (request.params.arguments.enable) await p.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
      else await p.setViewport({ width: 1920, height: 1080, isMobile: false });
      return { content: [{ type: "text", text: "Viewport updated" }] };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
      return { isError: true, content: [{ type: "text", text: `Error executing ${name}: ${error.message}` }] };
  }
});

async function run() { const t = new StdioServerTransport(); await server.connect(t); }
run().catch(console.error);
