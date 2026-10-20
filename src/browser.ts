import { isIP } from "node:net";
import { type Browser, type BrowserContext, chromium, type Page } from "playwright";
import { TECH_INIT_SCRIPT } from "./analyze/tech.js";
import { allowLocal, isLocalHostname, resolvesPrivate } from "./guard.js";

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;
export type ViewportName = keyof typeof VIEWPORTS;

export const NAV_TIMEOUT = 30_000;

/** Common cookie/consent banners. Hidden with CSS only: never accepted or rejected. */
export const CONSENT = [
  "#onetrust-consent-sdk",
  "#CybotCookiebotDialog",
  "#usercentrics-root",
  "#didomi-host",
  "#truste-consent-track",
  ".cc-window",
  ".qc-cmp2-container",
  '[id*="cookie" i][role="dialog"]',
  '[class*="cookie" i][role="dialog"]',
  '[aria-label*="cookie" i]',
  '[aria-label*="consent" i]',
].join(",");

/** Image/font/media requests we refused to download; only URL and type are kept. */
export interface SkippedAsset {
  type: string;
  url: string;
}

export async function launchBrowser(): Promise<Browser> {
  try {
    return await chromium.launch({ headless: true });
  } catch (err) {
    if (
      err instanceof Error &&
      /Executable doesn't exist|install the browsers|npx playwright install/i.test(err.message)
    ) {
      throw new Error("Chromium is not installed for sitebrief. Run `npx sitebrief setup` once, then retry.");
    }
    throw err;
  }
}

/** Fresh context: no cookies, no service workers, no asset downloads, no private hosts, no form posts. */
export async function newContext(
  browser: Browser,
  viewport: ViewportName,
  skipped: SkippedAsset[],
  opts: { allowPrivate?: boolean } = {},
): Promise<BrowserContext> {
  const mobile = viewport === "mobile";
  const ctx = await browser.newContext({
    viewport: VIEWPORTS[viewport],
    isMobile: mobile,
    hasTouch: mobile,
    serviceWorkers: "block",
  });
  ctx.setDefaultTimeout(5_000);
  await ctx.addInitScript(TECH_INIT_SCRIPT);
  // Names are resolved too (cached per context), so redirects or sub-resources to names that point at
  // private addresses are blocked. Chromium resolves again on its own, so a very fast rebinding attack
  // remains theoretically possible; the cache keeps the window to one lookup per host.
  const dnsCache = new Map<string, Promise<boolean>>();
  const privateHost = (host: string) => {
    if (isLocalHostname(host)) return Promise.resolve(true);
    if (isIP(host.replace(/^\[|\]$/g, ""))) return Promise.resolve(false);
    const hit = dnsCache.get(host) ?? resolvesPrivate(host);
    dnsCache.set(host, hit);
    return hit;
  };
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const type = req.resourceType();
    let host = "";
    try {
      host = new URL(req.url()).hostname;
    } catch {}
    if (!(opts.allowPrivate || allowLocal()) && host && (await privateHost(host)))
      return route.abort("blockedbyclient");
    if (type === "document" && req.method() !== "GET") return route.abort("blockedbyclient");
    if (type === "image" || type === "font" || type === "media") {
      if (skipped.length < 500) skipped.push({ type, url: req.url() });
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });
  return ctx;
}

export interface LoadResult {
  status: number;
  finalUrl: string;
  notes: string[];
}

/** Load, wait for network idle, scroll down in steps so lazy content renders, scroll back up. */
export async function loadPage(page: Page, url: string): Promise<LoadResult> {
  const notes: string[] = [];
  const res = await page.goto(url, { waitUntil: "load", timeout: NAV_TIMEOUT });
  await page.waitForLoadState("networkidle", { timeout: NAV_TIMEOUT }).catch(() => {
    notes.push(`${url}: network never went idle within 30s; analyzed what had loaded`);
  });
  await page.evaluate(async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0, y = 0; i < 40 && y < document.documentElement.scrollHeight; i++) {
      y += Math.round(window.innerHeight * 0.8);
      window.scrollTo(0, y);
      await sleep(120);
    }
    window.scrollTo(0, 0);
  });
  await page
    .addStyleTag({ content: `${CONSENT} { display: none !important; } html, body { overflow: auto !important; }` })
    .catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
  return { status: res?.status() ?? 0, finalUrl: page.url(), notes };
}

const BLOCK_TITLE = /just a moment|attention required|access denied|captcha|verify you are human|are you a robot/i;
const LOGIN_PATH = /\/(login|log-in|signin|sign-in|auth|sso)(\/|$|\?)/i;

/** Returns a reason when the page blocks bots or wants a login, else null. */
export async function detectBlock(page: Page, requested: string, load: LoadResult): Promise<string | null> {
  if ([401, 403, 407, 429, 503].includes(load.status)) return `HTTP ${load.status} (blocked or login required)`;
  const title = await page.title();
  if (BLOCK_TITLE.test(title)) return "bot challenge page detected";
  const captcha = await page
    .locator('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="challenges.cloudflare"]')
    .count();
  if (captcha > 0) return "CAPTCHA detected";
  const req = new URL(requested);
  const fin = new URL(load.finalUrl);
  if (fin.origin !== req.origin) return `redirected to another origin (${fin.origin})`;
  if (fin.pathname !== req.pathname && LOGIN_PATH.test(fin.pathname)) return "redirected to a login page";
  return null;
}
