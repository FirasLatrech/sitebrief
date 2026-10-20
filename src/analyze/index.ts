import { join } from "node:path";
import type { Browser } from "playwright";
import { detectBlock, launchBrowser, loadPage, newContext, type SkippedAsset } from "../browser.js";
import { assertPublicUrl } from "../guard.js";
import { ensureDir, newAnalysisId, saveFile } from "../store.js";
import { readComponents } from "./components.js";
import { readIcons } from "./icons.js";
import { readImages } from "./images.js";
import { readInteractions } from "./interactions.js";
import { readLayout } from "./layout.js";
import { captureSections } from "./sections.js";
import { readSensitive } from "./sensitive.js";
import { newCollector, observeNetwork, readTech } from "./tech.js";
import { inferTokens, mergeRaw } from "./tokens.js";
import { collectTokens, type RawTokens } from "./tokens-collect.js";
import type { Analysis, AnalyzeInput, PageReport } from "./types.js";

export type { Analysis, AnalyzeInput, PageReport } from "./types.js";

const BUDGET_MS = 120_000;
const PACE_MS = 1_000;

export async function analyzeSite(
  input: AnalyzeInput,
  onProgress: (step: string) => void = () => {},
): Promise<Analysis> {
  const base = await assertPublicUrl(input.url);
  const paths = [...new Set(input.pages?.length ? input.pages : [base.pathname || "/"])].slice(0, 5);
  const targets = paths.map((p) => {
    const u = new URL(p, base);
    if (u.origin !== base.origin) throw new Error(`Page ${p} is not on ${base.origin}`);
    return u;
  });
  const viewports = input.viewports?.length ? [...new Set(input.viewports)] : (["desktop", "mobile"] as const);
  const id = newAnalysisId();
  const dir = await ensureDir(id);
  const out: Analysis = {
    analysis_id: id,
    url: base.href,
    created_at: new Date().toISOString(),
    pages: [],
    tokens: null,
    components: [],
    interactions: [],
    icons: { libraries: [], custom_svg_icons: 0 },
    tech: null,
    sensitive_pages: [],
    screenshots: [],
    limitations: [
      "Images, fonts and media were not downloaded, so screenshots show empty boxes where they would be.",
      "Analyzed anonymously (no cookies, no login); signed-in screens are not covered.",
    ],
  };
  const browser: Browser = await launchBrowser();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void browser.close();
  }, BUDGET_MS);
  const collector = newCollector();
  const skipped: SkippedAsset[] = [];
  const frameworks = new Set<string>();
  let raw: RawTokens | null = null;
  let lastNav = 0;
  try {
    pages: for (const target of targets) {
      const report: PageReport = {
        path: target.pathname + target.search,
        sensitive: false,
        sensitive_reasons: [],
        tokens: null,
        views: [],
      };
      for (const [vi, viewport] of viewports.entries()) {
        const wait = lastNav + PACE_MS - Date.now();
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        lastNav = Date.now();
        onProgress(`analyzing ${target.pathname} (${viewport})`);
        const ctx = await newContext(browser, viewport, skipped);
        try {
          const page = await ctx.newPage();
          observeNetwork(page, collector);
          const load = await loadPage(page, target.href);
          out.limitations.push(...load.notes);
          const blocked = await detectBlock(page, target.href, load);
          if (blocked) {
            out.limitations.push(`${report.path}: ${blocked}. Stopped the analysis here.`);
            break pages;
          }
          const sens = await readSensitive(page);
          report.sensitive ||= sens.sensitive;
          report.sensitive_reasons = [...new Set([...report.sensitive_reasons, ...sens.reasons])];
          const layout = await readLayout(page);
          const shot = join(dir, `${slugify(report.path)}-${viewport}.png`);
          await page.screenshot({ path: shot, fullPage: true });
          out.screenshots.push(shot);
          const sections = await captureSections(page, layout, dir, `${slugify(report.path)}-${viewport}`);
          const images = await readImages(page, sections);
          report.views.push({ viewport, layout, screenshot: shot, sections, images });
          if (vi === 0) {
            const t = await collectTokens(page);
            raw = raw ? mergeRaw(raw, t) : t;
            report.tokens = inferTokens(t);
            const icons = await readIcons(page);
            out.icons = {
              libraries: [...new Set([...out.icons.libraries, ...icons.libraries])],
              custom_svg_icons: out.icons.custom_svg_icons + icons.custom_svg_icons,
            };
            const comps = await readComponents(page);
            out.components.push(...comps.map((c) => ({ ...c, page: report.path })));
          }
          const reload = async () => {
            await page.goto(target.href, {
              waitUntil: "load",
              timeout: 30_000,
            });
          };
          const inter = await readInteractions(page, reload, !report.sensitive);
          out.interactions.push({ ...inter, page: report.path, viewport });
          const tech = await readTech(page, collector, skipped);
          for (const f of tech.frameworks) frameworks.add(f);
          out.tech = { ...tech, frameworks: [...frameworks] };
        } catch (err) {
          if (timedOut) break pages;
          out.limitations.push(`${report.path} (${viewport}): ${(err as Error).message.split("\n")[0]}`);
        } finally {
          await ctx.close().catch(() => {});
        }
      }
      if (report.views.length) out.pages.push(report);
      if (report.sensitive) out.sensitive_pages.push(report.path);
    }
  } finally {
    clearTimeout(timer);
    await browser.close().catch(() => {});
  }
  if (timedOut) out.limitations.push("Stopped at the 2-minute analysis budget; results are partial.");
  if (raw) out.tokens = inferTokens(raw);
  await saveFile(id, "analysis.json", JSON.stringify(out, null, 2));
  return out;
}

const slugify = (p: string) => p.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home";
