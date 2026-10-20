import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright";
import type { Region } from "./layout.js";

export interface Section {
  index: number;
  name: string;
  box: Region["box"];
  file: string;
}

const MAX_SECTIONS = 25;
const MAX_CROP_HEIGHT = 1600;

/**
 * Splits the outline into stacked visual sections: a region taller than ~half the viewport
 * that contains 2+ sizable child regions is replaced by those children.
 */
export function pickSections(layout: Region[], viewportH: number, viewportW: number): Region[] {
  const sizable = (r: Region) => r.box.h >= 60 && r.box.w >= viewportW * 0.5;
  let list = layout.filter(sizable);
  for (let pass = 0; pass < 8; pass++) {
    list = list.flatMap((r) => {
      const kids = r.regions.filter(sizable);
      // Single-child wrappers (common in SPA frameworks) are stepped through.
      if (kids.length === 1 && kids[0].box.h >= r.box.h * 0.8) return kids;
      return r.box.h > viewportH * 0.6 && kids.length >= 2 ? kids : [r];
    });
  }
  return list.sort((a, b) => a.box.y - b.box.y).slice(0, MAX_SECTIONS);
}

/** Saves one JPEG crop per section (reference images for the building agent, never to ship). */
export async function captureSections(page: Page, layout: Region[], dir: string, prefix: string): Promise<Section[]> {
  const vp = page.viewportSize() ?? { width: 1440, height: 900 };
  const out: Section[] = [];
  await mkdir(join(dir, "sections"), { recursive: true });
  let picked: Pick<Region, "name" | "box">[] = pickSections(layout, vp.height, vp.width);
  if (!picked.length) {
    // Small or landmark-free pages: the whole page is one section, so the builder still gets an image.
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    picked = [{ name: "page", box: { x: 0, y: 0, w: vp.width, h } }];
  }
  for (const [index, r] of picked.entries()) {
    const file = join(dir, "sections", `${prefix}-${String(index).padStart(2, "0")}.jpg`);
    const clip = { x: 0, y: Math.max(0, r.box.y), width: vp.width, height: Math.min(r.box.h, MAX_CROP_HEIGHT) };
    try {
      await page.screenshot({ path: file, fullPage: true, clip, type: "jpeg", quality: 70 });
      out.push({ index, name: r.name, box: r.box, file });
    } catch {
      // Region outside the rendered page (e.g. collapsed after load): skip it.
    }
  }
  return out;
}
