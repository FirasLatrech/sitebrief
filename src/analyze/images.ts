import type { Page } from "playwright";
import type { Section } from "./sections.js";

export type ImageRole =
  | "hero media"
  | "background"
  | "logo strip"
  | "site logo"
  | "avatar"
  | "card image"
  | "media"
  | "video";

/** One place on the page that shows an image or video. Files are never downloaded; only geometry and role. */
export interface ImageSlot {
  role: ImageRole;
  count: number;
  box: { x: number; y: number; w: number; h: number };
  aspect: string;
  fit: string;
  rounded: boolean;
  section: number | null;
  format: string;
  /** True when the height was estimated because the blocked image collapsed. */
  estimated: boolean;
}

interface Raw {
  role: ImageRole;
  x: number;
  y: number;
  w: number;
  h: number;
  fit: string;
  rounded: boolean;
  format: string;
  group: string;
  src: string;
  estimated: boolean;
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
const aspect = (w: number, h: number) => {
  const g = gcd(Math.round(w), Math.round(h)) || 1;
  const [a, b] = [Math.round(w / g), Math.round(h / g)];
  return a <= 32 && b <= 32 ? `${a}:${b}` : (w / h).toFixed(2);
};

/** Finds <img>, <video> and CSS background images, classifies them and groups repeats (carousels, logo rows). */
export async function readImages(page: Page, sections: Section[]): Promise<ImageSlot[]> {
  const raw: Raw[] = await page.evaluate(() => {
    const vw = innerWidth;
    const out: Raw[] = [];
    // Blocked images collapse to their alt text; use width/height attributes, else the nearest sized container.
    const boxOf = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width >= 24 && r.height >= 24) return r;
      const aw = Number(el.getAttribute("width")) || 0;
      const ah = Number(el.getAttribute("height")) || 0;
      if (aw >= 24 && ah >= 24) return new DOMRect(r.x, r.y, aw, ah);
      // Climb only through wrappers that hold nothing but this image.
      let p = el.parentElement;
      for (let i = 0; p && i < 4 && p.childElementCount === 1; i++, p = p.parentElement) {
        const pr = p.getBoundingClientRect();
        if (pr.height >= 40 && pr.width >= 24) return pr;
      }
      // Logos in a row keep their own (small) box; guessing a photo size would misclassify them.
      const row = el.closest("li, a, figure, div")?.parentElement;
      if (row && row.querySelectorAll("img, svg").length >= 4) return r;
      // Inside a card, the card's box is the slot.
      const card = el.closest("li, article");
      const cr = card?.getBoundingClientRect();
      if (cr && cr.height >= 40 && cr.width <= vw * 0.6) return cr;
      // Otherwise the height is unknown without loading the file: estimate (square if round, else 16:9).
      // Logos are wide wordmarks, so they keep their rendered box.
      const w = r.width >= 24 && !el.closest("header, nav, footer") ? r.width : 0;
      const round = parseFloat(getComputedStyle(el).borderRadius) >= 40;
      return w ? Object.assign(new DOMRect(r.x, r.y, w, round ? w : (w * 9) / 16), { estimated: true }) : r;
    };
    const fmt = (url: string) =>
      (url.match(/\.(png|jpe?g|webp|avif|gif|svg|mp4|webm|m3u8)(\?|$)/i)?.[1] ?? "unknown").toLowerCase();
    const add = (el: Element, src: string, video: boolean) => {
      const r = boxOf(el);
      const [w, h] = [r.width, r.height];
      const estimated = "estimated" in r;
      if (w < 16 || h < 16) return;
      const s = getComputedStyle(el);
      const rounded = parseFloat(s.borderRadius) >= Math.min(w, h) / 2 - 1 || (estimated && w === h);
      const parent = el.closest("li, a, figure, div")?.parentElement;
      const siblings = parent ? parent.querySelectorAll("img, svg").length : 0;
      let role: Raw["role"] = video ? "video" : "media";
      if (video && w >= vw * 0.6) role = "hero media";
      else if (!video && el.closest("header, nav, footer") && h <= 80 && siblings < 4) role = "site logo";
      else if (!video && h <= 80 && siblings >= 4) role = "logo strip";
      else if (rounded && w <= 160) role = "avatar";
      else if (w >= vw * 0.6 && h >= 300) role = r.y + scrollY < innerHeight * 0.6 ? "hero media" : "background";
      else if (el.closest("li, article, [class*='card' i]")) role = "card image";
      out.push({
        role,
        x: Math.round(r.x + scrollX),
        y: Math.round(r.y + scrollY),
        w: Math.round(w),
        h: Math.round(h),
        fit: s.objectFit || "fill",
        rounded,
        format: fmt(src),
        src,
        estimated,
        // Logo rows group by row (logos differ in size); everything else by size and vertical band.
        group:
          role === "logo strip"
            ? `strip|${Math.round((r.y + scrollY) / 150)}`
            : `${role}|${Math.round(w / 8)}x${Math.round(h / 8)}|${Math.round((r.y + scrollY) / 400)}`,
      });
    };
    for (const img of document.querySelectorAll("img")) add(img, img.currentSrc || img.src, false);
    for (const v of document.querySelectorAll("video"))
      add(v, v.currentSrc || v.querySelector("source")?.src || "", true);
    for (const el of document.querySelectorAll("body *")) {
      const bg = getComputedStyle(el).backgroundImage;
      const url = bg.match(/url\(["']?([^"')]+)/)?.[1];
      if (!url) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 100 || r.height < 100) continue;
      out.push({
        role: "background",
        x: Math.round(r.x + scrollX),
        y: Math.round(r.y + scrollY),
        w: Math.round(r.width),
        h: Math.round(r.height),
        fit: getComputedStyle(el).backgroundSize,
        rounded: false,
        format: fmt(url),
        src: url,
        estimated: false,
        group: `bg|${Math.round(r.y / 200)}`,
      });
    }
    return out.slice(0, 300);
  });
  const groups = new Map<string, Raw[]>();
  for (const r of raw) groups.set(r.group, [...(groups.get(r.group) ?? []), r]);
  return [...groups.values()]
    .map((g) => {
      const first = g[0];
      const section = sections.find((s) => first.y >= s.box.y && first.y < s.box.y + s.box.h)?.index ?? null;
      // A "strip" of one logo is just a logo (e.g. the footer's).
      const role = first.role === "logo strip" && g.length === 1 ? "site logo" : first.role;
      return {
        role,
        // Marquees repeat their items; count distinct files.
        count: ((n) => (n > 1 ? n : g.length))(new Set(g.map((x) => x.src)).size),
        box: { x: first.x, y: first.y, w: first.w, h: first.h },
        aspect: aspect(first.w, first.h),
        fit: first.fit,
        rounded: first.rounded,
        section,
        format: first.format,
        estimated: first.estimated,
      };
    })
    .sort((a, b) => a.box.y - b.box.y)
    .slice(0, 40);
}
