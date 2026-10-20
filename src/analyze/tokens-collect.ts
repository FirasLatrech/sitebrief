import type { Page } from "playwright";

export type Counts = Record<string, number>;

export interface RawTokens {
  text: Counts;
  background: Counts;
  border: Counts;
  accentCandidates: Counts; // backgrounds of buttons and colors of links
  rootBackground: string;
  fontFamily: Counts;
  fontSize: Counts;
  fontWeight: Counts;
  lineHeight: Counts;
  letterSpacing: Counts;
  spacing: Counts;
  radius: Counts;
  shadow: Counts;
  borderWidth: Counts;
  duration: Counts;
  easing: Counts;
  breakpoints: Counts;
  unreadableSheets: number;
}

/** Samples computed styles of visible elements (max 4000) and @media rules of readable stylesheets. */
export function collectTokens(page: Page): Promise<RawTokens> {
  return page.evaluate(() => {
    const buckets =
      "text background border accentCandidates fontFamily fontSize fontWeight lineHeight letterSpacing spacing radius shadow borderWidth duration easing breakpoints";
    const c: Record<string, Record<string, number>> = Object.fromEntries(buckets.split(" ").map((b) => [b, {}]));
    const t = { rootBackground: "", unreadableSheets: 0 };
    const add = (bucket: string, v: string | undefined, n = 1) => {
      if (!v || v === "none" || v === "normal" || v === "0px" || v === "auto" || v === "rgba(0, 0, 0, 0)") return;
      c[bucket][v] = (c[bucket][v] ?? 0) + n;
    };
    const transparent = (c: string) => c === "rgba(0, 0, 0, 0)" || c === "transparent";
    const bodyBg = getComputedStyle(document.body).backgroundColor;
    t.rootBackground = transparent(bodyBg) ? getComputedStyle(document.documentElement).backgroundColor : bodyBg;
    let n = 0;
    for (const el of document.body.querySelectorAll("*")) {
      if (n >= 4000) break;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const s = getComputedStyle(el);
      if (s.visibility === "hidden" || s.display === "none") continue;
      n++;
      const hasText = [...el.childNodes].some((k) => k.nodeType === 3 && k.textContent?.trim());
      if (hasText) {
        add("text", s.color, Math.max(1, (el.textContent?.trim().length ?? 0) > 40 ? 3 : 1));
        add("fontFamily", s.fontFamily);
        add("fontSize", s.fontSize);
        add("fontWeight", s.fontWeight);
        add("lineHeight", s.lineHeight);
        add("letterSpacing", s.letterSpacing);
      }
      if (!transparent(s.backgroundColor))
        add("background", s.backgroundColor, Math.ceil((r.width * r.height) / 20000));
      const bw = parseFloat(s.borderTopWidth) || parseFloat(s.borderBottomWidth);
      if (bw > 0 && s.borderTopStyle !== "none") {
        add("border", s.borderTopColor);
        add("borderWidth", `${bw}px`);
      }
      const tag = el.tagName.toLowerCase();
      if (tag === "button" || el.getAttribute("role") === "button") add("accentCandidates", s.backgroundColor, 2);
      if (tag === "a") add("accentCandidates", s.color);
      for (const p of ["marginTop", "marginBottom", "paddingTop", "paddingLeft", "rowGap", "columnGap"] as const) {
        const v = s[p];
        if (v.endsWith("px") && parseFloat(v) > 0 && parseFloat(v) <= 200)
          add("spacing", `${Math.round(parseFloat(v))}px`);
      }
      add("radius", s.borderTopLeftRadius);
      add("shadow", s.boxShadow);
      const easings = s.transitionTimingFunction.split(",");
      for (const [i, d] of s.transitionDuration.split(",").entries()) {
        if (d.trim() === "0s") continue;
        add("duration", d.trim());
        add("easing", (easings[i] ?? easings[0]).trim());
      }
    }
    for (const sheet of document.styleSheets) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        t.unreadableSheets++;
        continue;
      }
      for (const rule of rules) {
        if (!(rule instanceof CSSMediaRule)) continue;
        for (const m of rule.conditionText.matchAll(/(min|max)-width:\s*([\d.]+)(px|em|rem)/g)) {
          const px = m[3] === "px" ? Number(m[2]) : Number(m[2]) * 16;
          add("breakpoints", `${m[1]}-width ${Math.round(px)}px`);
        }
      }
    }
    return { ...c, ...t } as unknown as never;
  });
}
