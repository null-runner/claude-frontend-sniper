#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import puppeteer from "puppeteer-core";

const CHROME_HOST = process.env.CHROME_HOST || "host.docker.internal";
const CHROME_PORT = process.env.CHROME_PORT || "3333";
const BROWSER_URL = `http://${CHROME_HOST}:${CHROME_PORT}`;

// Global state
let browser = null;
let page = null;

async function getPage() {
  if (page && !page.isClosed()) return page;

  try {
    // Connect explicitly via browserURL (Puppeteer handles discovery)
    browser = await puppeteer.connect({ browserURL: BROWSER_URL });

    // Find an existing page or create one
    const pages = await browser.pages();
    if (pages.length > 0) {
      page = pages[0];
    } else {
      page = await browser.newPage();
    }

    // Fix viewport for design debugging
    await page.setViewport({ width: 1920, height: 1080 });
    return page;
  } catch (err) {
    console.error("Connection failed:", err);
    process.exit(1); // Let Docker restart us
  }
}

const server = new Server(
  { name: "claude-frontend-sniper", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "navigate",
        description: "Navigates the browser to a specific URL. Use this for ALL navigation.",
        inputSchema: {
          type: "object",
          properties: { url: { type: "string" } },
          required: ["url"],
        },
      },
      {
        name: "screenshot",
        description: "Takes a screenshot of the current viewport. Returns base64 image.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "evaluate",
        description: "Executes JavaScript in the browser context and returns the result.",
        inputSchema: {
          type: "object",
          properties: { script: { type: "string" } },
          required: ["script"],
        },
      },
      {
        name: "get_console_logs",
        description: "Retrieves the last 100 console logs from the browser.",
        inputSchema: { type: "object", properties: {} },
      }
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const p = await getPage();

  if (request.params.name === "navigate") {
    await p.goto(request.params.arguments.url, { waitUntil: "domcontentloaded" });
    return { content: [{ type: "text", text: `Navigated to ${request.params.arguments.url}` }] };
  }

  if (request.params.name === "screenshot") {
    const b64 = await p.screenshot({ encoding: "base64", type: "jpeg", quality: 80 });
    return { content: [{ type: "image", data: b64, mimeType: "image/jpeg" }] };
  }

  if (request.params.name === "evaluate") {
    const result = await p.evaluate((code) => {
      try { return eval(code); } catch (e) { return e.toString(); }
    }, request.params.arguments.script);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }

  // Fallback
  throw new Error("Unknown tool");
});

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

run().catch(console.error);
