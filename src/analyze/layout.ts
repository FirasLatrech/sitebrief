import type { Page } from "playwright";

export interface Region {
  name: string;
  box: { x: number; y: number; w: number; h: number };
  layout: { mode: string; direction?: string; columns?: number; gap?: string };
  children: string;
  regions: Region[];
}

/** Landmarks and large visible boxes as a nested outline (max depth 4). */
export function readLayout(page: Page): Promise<Region[]> {
  return page.evaluate(() => {
    const LANDMARK = "header,nav,main,aside,footer,section,article,form,dialog,[role]";
    const vw = window.innerWidth;
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const isRegion = (el: Element) => {
      if (!visible(el)) return false;
      if (el.matches(LANDMARK) && !el.matches("[role=presentation],[role=none],[role=img]")) return true;
      const r = el.getBoundingClientRect();
      return (
        el.children.length > 1 &&
        !/^(H[1-6]|P|A|BUTTON|LABEL)$/.test(el.tagName) &&
        r.width >= vw * 0.5 &&
        r.height >= 160
      );
    };
    const name = (el: Element) => {
      const role = el.getAttribute("role");
      return role ? `${el.tagName.toLowerCase()}[role=${role}]` : el.tagName.toLowerCase();
    };
    const layoutOf = (el: Element) => {
      const s = getComputedStyle(el);
      const gap = s.gap && s.gap !== "normal" ? s.gap : undefined;
      if (s.display.includes("grid")) {
        const cols = s.gridTemplateColumns.split(" ").filter(Boolean).length;
        return { mode: "grid", columns: cols, gap };
      }
      if (s.display.includes("flex")) return { mode: "flex", direction: s.flexDirection, gap };
      return { mode: "block" };
    };
    const summary = (el: Element) => {
      const counts = new Map<string, number>();
      for (const c of el.children) {
        if (!visible(c)) continue;
        const t = c.tagName.toLowerCase();
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
      return [...counts].map(([t, n]) => `${n}×${t}`).join(", ") || "no element children";
    };
    // Regions below `el`, skipping non-region wrappers.
    const collect = (el: Element, depth: number): unknown[] => {
      const out: unknown[] = [];
      for (const c of el.children) {
        if (["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG"].includes(c.tagName.toUpperCase())) continue;
        if (isRegion(c)) {
          const r = c.getBoundingClientRect();
          out.push({
            name: name(c),
            box: {
              x: Math.round(r.x + scrollX),
              y: Math.round(r.y + scrollY),
              w: Math.round(r.width),
              h: Math.round(r.height),
            },
            layout: layoutOf(c),
            children: summary(c),
            regions: depth < 4 ? collect(c, depth + 1) : [],
          });
        } else out.push(...collect(c, depth));
      }
      return out.slice(0, 20);
    };
    return collect(document.body, 1) as never;
  });
}
