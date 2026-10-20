import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readImages } from "../analyze/images.js";
import type { Analysis } from "../analyze/index.js";
import { readLayout } from "../analyze/layout.js";
import { inferTokens } from "../analyze/tokens.js";
import { collectTokens } from "../analyze/tokens-collect.js";
import { launchBrowser, loadPage, newContext, type ViewportName } from "../browser.js";
import type { DesignSystem } from "../prompt/originality.js";
import { analysisDir, ensureDir, loadAnalysis, saveFile } from "../store.js";
import { comparePixels } from "./pixels.js";
import { imageSimilarity, structureSimilarity, type TokenTarget, tokenSimilarity } from "./structure.js";

export interface CompareInput {
  analysis_id: string;
  base_url: string;
  pages?: string[];
  viewports?: ViewportName[];
}

export interface ViewScore {
  page: string;
  viewport: ViewportName;
  score: number;
  pixels: number;
  structure: number;
  tokens: number;
  images: number;
  worst: { y0: number; y1: number; mismatch: number; sections: string[] }[];
  missing_regions: string[];
  token_notes: string[];
  image_notes: string[];
  width: number;
  height: { reference: number; candidate: number };
  diff_file: string;
  candidate_file: string;
  reference_file: string;
}

/** Target tokens: the design saved by build_prompt (close or original), else the observed ones. */
async function tokenTarget(a: Analysis): Promise<{ target: TokenTarget; close: boolean }> {
  try {
    const d = JSON.parse(await readFile(join(analysisDir(a.analysis_id), "design.json"), "utf8")) as DesignSystem & {
      fidelity?: string;
    };
    // Derived roles like on-primary are not observable on a page, so they are not scored.
    const { "on-primary": _, ...roles } = d.colors;
    return { target: { roles, font: d.font }, close: d.fidelity === "close" };
  } catch {
    const font = (a.tokens?.typography.families[0] ?? "").split(",")[0].replace(/["']/g, "").trim();
    return { target: { roles: a.tokens?.colors.roles ?? {}, font }, close: true };
  }
}

/** Screenshots the local build at the analyzed pages/viewports and scores it against the reference. */
export async function compareSite(
  input: CompareInput,
  onProgress: (step: string) => void = () => {},
): Promise<ViewScore[]> {
  const a = await loadAnalysis<Analysis>(input.analysis_id);
  const base = new URL(input.base_url);
  if (base.protocol !== "http:" && base.protocol !== "https:") throw new Error("base_url must be http(s)");
  const { target, close } = await tokenTarget(a);
  // In original mode colors differ on purpose, so pixels weigh less and structure more.
  const w = close
    ? { pixels: 0.45, structure: 0.25, tokens: 0.15, images: 0.15 }
    : { pixels: 0.2, structure: 0.45, tokens: 0.2, images: 0.15 };
  const outDir = join(await ensureDir(a.analysis_id), "compare");
  await mkdir(outDir, { recursive: true });
  const scores: ViewScore[] = [];
  const browser = await launchBrowser();
  try {
    for (const p of a.pages.filter((x) => !x.sensitive && (!input.pages || input.pages.includes(x.path)))) {
      for (const ref of p.views.filter((v) => !input.viewports || input.viewports.includes(v.viewport))) {
        onProgress(`comparing ${p.path} (${ref.viewport})`);
        const ctx = await newContext(browser, ref.viewport, [], { allowPrivate: true });
        try {
          const page = await ctx.newPage();
          await loadPage(page, new URL(p.path, base).href);
          const shot = await page.screenshot({ fullPage: true });
          const slug = `${p.path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home"}-${ref.viewport}`;
          await writeFile(join(outDir, `${slug}.png`), shot);
          const px = await comparePixels(ref.screenshot, shot, join(outDir, `${slug}-diff.png`));
          const st = structureSimilarity(ref.layout, await readLayout(page));
          // Close mode: each page is held to its own observed colors (a site can mix dark and light pages).
          const pageTarget = close && p.tokens ? { roles: p.tokens.colors.roles, font: target.font } : target;
          const tk = tokenSimilarity(pageTarget, inferTokens(await collectTokens(page)));
          const im = imageSimilarity(ref.images ?? [], await readImages(page, ref.sections));
          const worst = [...px.bands]
            .sort((x, y) => y.mismatch - x.mismatch)
            .slice(0, 3)
            .map((b) => ({
              ...b,
              sections: ref.sections
                .filter((s) => s.box.y < b.y1 && s.box.y + s.box.h > b.y0)
                .map((s) => `#${s.index} ${s.name}`),
            }));
          scores.push({
            page: p.path,
            viewport: ref.viewport,
            score:
              px.similarity * w.pixels +
              st.similarity * w.structure +
              tk.similarity * w.tokens +
              im.similarity * w.images,
            pixels: px.similarity,
            structure: st.similarity,
            tokens: tk.similarity,
            images: im.similarity,
            worst,
            missing_regions: st.missing,
            token_notes: tk.notes,
            image_notes: im.notes,
            width: px.width,
            height: px.height,
            diff_file: px.diff_file,
            candidate_file: join(outDir, `${slug}.png`),
            reference_file: ref.screenshot,
          });
        } finally {
          await ctx.close().catch(() => {});
        }
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
  await saveFile(a.analysis_id, "compare/report.json", JSON.stringify(scores, null, 2));
  return scores;
}
