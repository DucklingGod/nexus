// Browser automation tools using puppeteer-core (uses system-installed Chrome/Edge).
// No bundled Chromium — lighter for desktop app. Falls back to full puppeteer if installed.
//
// Tools: browser_navigate, browser_click, browser_type, browser_screenshot,
//        browser_get_text, browser_scroll

import { registerTool } from "./registry.ts";
import { existsSync } from "node:fs";
import { join } from "node:path";

// Lazy-load puppeteer-core; fall back to full puppeteer if available.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getPuppeteer(): Promise<any> {
  try {
    return await import("puppeteer-core");
  } catch {
    throw new Error(
      "puppeteer-core is not installed. Run: npm install puppeteer-core in the engine directory.",
    );
  }
}

// Detect system browser executable path.
function findBrowserPath(): string | null {
  const platform = process.platform;

  const candidates: string[] = [];
  if (platform === "win32") {
    const pf = process.env.PROGRAMFILES || "C:\\Program Files";
    const pf86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
    const localAppData = process.env.LOCALAPPDATA || "";
    candidates.push(
      `${pf}\\Google\\Chrome\\Application\\chrome.exe`,
      `${pf86}\\Google\\Chrome\\Application\\chrome.exe`,
      `${pf}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${pf86}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${localAppData}\\Google\\Chrome\\Application\\chrome.exe`,
      `${localAppData}\\Microsoft\\Edge\\Application\\msedge.exe`,
    );
  } else if (platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    );
  } else {
    candidates.push(
      "/usr/bin/google-chrome",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/usr/bin/microsoft-edge",
    );
  }

  for (const p of candidates) {
    try {
      if (existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

// Shared browser instance (lazy-loaded).
let browser: import("puppeteer-core").Browser | null = null;
let currentPage: import("puppeteer-core").Page | null = null;

async function getBrowser(): Promise<import("puppeteer-core").Browser> {
  if (browser && browser.connected) return browser;

  const puppeteer = await getPuppeteer();
  const execPath = findBrowserPath();
  if (!execPath) {
    throw new Error(
      "No browser found. Install Google Chrome or Microsoft Edge, or set the browser path manually.",
    );
  }

  browser = await puppeteer.launch({
    executablePath: execPath,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  }) as import("puppeteer-core").Browser;
  return browser;
}

async function getPage(): Promise<import("puppeteer-core").Page> {
  const b = await getBrowser();
  if (!currentPage || currentPage.isClosed()) {
    currentPage = await b.newPage();
    await currentPage.setViewport({ width: 1280, height: 800 });
  }
  return currentPage;
}

export function registerBrowserTools(): void {
  registerTool(
    {
      name: "browser_navigate",
      category: "web" as const,
      description: "Navigate the browser to a URL. Opens a headless Chrome/Edge instance.",
      parameters: [{ name: "url", type: "string", description: "URL to navigate to", required: true }],
      dangerous: true,
    },
    async (args) => {
      const url = String(args.url);
      const page = await getPage();
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        const title = await page.title();
        return { output: `Navigated to: ${url}\nTitle: ${title}` };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { output: `Navigation failed: ${msg}` };
      }
    },
  );

  registerTool(
    {
      name: "browser_click",
      category: "web" as const,
      description: "Click an element on the current page using a CSS selector.",
      parameters: [{ name: "selector", type: "string", description: "CSS selector for the element to click", required: true }],
      dangerous: true,
    },
    async (args) => {
      const selector = String(args.selector);
      const page = await getPage();
      try {
        await page.waitForSelector(selector, { timeout: 10000 });
        await page.click(selector);
        return { output: `Clicked: ${selector}` };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { output: `Click failed: ${msg}` };
      }
    },
  );

  registerTool(
    {
      name: "browser_type",
      category: "web" as const,
      description: "Type text into an input field identified by CSS selector.",
      parameters: [
        { name: "selector", type: "string", description: "CSS selector for the input field", required: true },
        { name: "text", type: "string", description: "Text to type", required: true },
      ],
    },
    async (args) => {
      const selector = String(args.selector);
      const text = String(args.text);
      const page = await getPage();
      try {
        await page.waitForSelector(selector, { timeout: 10000 });
        await page.click(selector, { clickCount: 3 }); // select all
        await page.type(selector, text);
        return { output: `Typed "${text}" into ${selector}` };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { output: `Type failed: ${msg}` };
      }
    },
  );

  registerTool(
    {
      name: "browser_screenshot",
      category: "web" as const,
      description: "Take a screenshot of the current page. Saves as PNG and returns the file path.",
      parameters: [
        { name: "full_page", type: "boolean", description: "Capture full page (default: false, viewport only)" },
      ],
    },
    async (args) => {
      const page = await getPage();
      const fullPage = Boolean(args.full_page);
      const { join } = await import("node:path");
      const { writeFileSync, mkdirSync } = await import("node:fs");

      const dataDir = process.env.NEXUS_DATA_DIR ?? process.env.APPDATA ?? join(process.env.HOME ?? ".", ".nexus");
      const screenshotDir = join(dataDir, "nexus", "screenshots");
      mkdirSync(screenshotDir, { recursive: true });

      const filename = `screenshot_${Date.now()}.png`;
      const filepath = join(screenshotDir, filename);

      try {
        const buf = await page.screenshot({ fullPage, type: "png" });
        writeFileSync(filepath, buf as Buffer);
        const sizeKB = Math.round((buf as Buffer).length / 1024);
        return { output: `Screenshot saved: ${filepath}\nSize: ${sizeKB} KB\nFull page: ${fullPage}` };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { output: `Screenshot failed: ${msg}` };
      }
    },
  );

  registerTool(
    {
      name: "browser_get_text",
      category: "web" as const,
      description: "Extract text content from the current page or a specific element.",
      parameters: [
        { name: "selector", type: "string", description: "CSS selector to extract text from (omit for full page)" },
      ],
    },
    async (args) => {
      const page = await getPage();
      const selector = args.selector ? String(args.selector) : null;
      try {
        let text: string;
        if (selector) {
          await page.waitForSelector(selector, { timeout: 10000 });
          text = await page.$eval(selector, (el: Element) => el.textContent || "");
        } else {
          text = await page.evaluate(() => document.body?.innerText || "");
        }
        const trimmed = text.replace(/\s+/g, " ").trim().slice(0, 8000);
        return { output: trimmed || "(no text found)" };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { output: `Text extraction failed: ${msg}` };
      }
    },
  );

  registerTool(
    {
      name: "browser_scroll",
      category: "web" as const,
      description: "Scroll the page up or down by a specified amount.",
      parameters: [
        {
          name: "direction",
          type: "string",
          description: '"down" (default) or "up"',
        },
        { name: "amount", type: "number", description: "Pixels to scroll (default: 800)" },
      ],
    },
    async (args) => {
      const page = await getPage();
      const direction = String(args.direction || "down");
      const amount = Number(args.amount) || 800;
      const delta = direction === "up" ? -amount : amount;
      try {
        await page.evaluate((d: number) => window.scrollBy(0, d), delta);
        return { output: `Scrolled ${direction} by ${amount}px` };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { output: `Scroll failed: ${msg}` };
      }
    },
  );
}

// Cleanup on process exit.
process.on("exit", () => {
  if (browser) void browser.close().catch(() => {});
});
