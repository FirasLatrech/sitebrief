import type { Page } from "playwright";

export interface Component {
  kind: string;
  signature: string;
  count: number;
  example: {
    tag: string;
    box: { w: number; h: number };
    children: string;
    layout: string;
  };
  text_roles: string[];
  states: Record<string, string[]>;
}

const STATE_PROPS = [
  "color",
  "backgroundColor",
  "borderColor",
  "boxShadow",
  "transform",
  "opacity",
  "outlineStyle",
  "textDecorationLine",
];

/** Repeated structures (same tag + class pattern + child shape, 2+ times), with hover/focus diffs. */
export async function readComponents(page: Page): Promise<Component[]> {
  const found = await page.evaluate(() => {
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width >= 24 && r.height >= 14 && s.visibility !== "hidden" && s.display !== "none";
    };
    const classPattern = (el: Element) =>
      [...el.classList]
        .map((c) => c.replace(/[-_]?[0-9a-f]{5,}$/i, "").replace(/\d+/g, "#"))
        .sort()
        .slice(0, 3)
        .join(".");
    const shape = (el: Element) => [...el.children].map((c) => c.tagName.toLowerCase()).join(",");
    const kindOf = (el: Element): string | null => {
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute("role");
      if (role === "tab") return "tab";
      if (role === "dialog" || tag === "dialog") return "modal";
      if (tag === "button" || role === "button") return "button";
      if (tag === "input" || tag === "select" || tag === "textarea") return "input";
      if (tag === "tr") return "table row";
      if (tag === "a" && el.closest("nav")) return "nav item";
      if (tag === "li") return el.closest("nav") ? "nav item" : "list row";
      if (tag === "a") {
        const s = getComputedStyle(el);
        return s.backgroundColor !== "rgba(0, 0, 0, 0)" && parseFloat(s.paddingLeft) >= 8 ? "button" : null;
      }
      if (el.children.length >= 2 && el.querySelector("h1,h2,h3,h4,h5,h6,p,img,svg,strong")) {
        const s = getComputedStyle(el);
        const framed =
          s.boxShadow !== "none" ||
          parseFloat(s.borderTopWidth) > 0 ||
          parseFloat(s.borderRadius) > 0 ||
          s.backgroundColor !== "rgba(0, 0, 0, 0)";
        return framed ? "card" : "repeated block";
      }
      return null;
    };
    const textRole = (el: Element): string => {
      const tag = el.tagName.toLowerCase();
      const txt = el.textContent?.trim() ?? "";
      if (/^h[1-6]$/.test(tag)) return "title";
      if (/[$€£¥]\s?\d|\d\s?[$€£¥]|\/(mo|month|yr|year)\b/i.test(txt)) return "price";
      if (tag === "button" || tag === "a") return "action";
      const s = getComputedStyle(el);
      if (s.textTransform === "uppercase" || parseFloat(s.fontSize) <= 13) return "label";
      if (parseFloat(s.fontWeight) >= 600) return "emphasis";
      return "body";
    };
    const groups = new Map<string, Element[]>();
    for (const el of document.body.querySelectorAll("*")) {
      if (!visible(el)) continue;
      const kind = kindOf(el);
      if (!kind) continue;
      const key = `${kind}|${el.tagName.toLowerCase()}|${classPattern(el)}|${shape(el)}`;
      const list = groups.get(key) ?? [];
      list.push(el);
      groups.set(key, list);
    }
    const out = [...groups]
      .filter(([k, els]) => els.length >= 2 || /^(modal|tab)\|/.test(k))
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 20);
    return out.map(([key, els], i) => {
      const ex = els[0];
      ex.setAttribute("data-sb-comp", String(i));
      const r = ex.getBoundingClientRect();
      const s = getComputedStyle(ex);
      const leaves = [ex, ...ex.querySelectorAll("*")].filter((e) =>
        [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim()),
      );
      const [kind, tag, cls, children] = key.split("|");
      return {
        kind,
        signature: `${tag}${cls ? `.${cls}` : ""}`,
        count: els.length,
        example: {
          tag,
          box: { w: Math.round(r.width), h: Math.round(r.height) },
          children: children || "text only",
          layout: s.display.includes("grid")
            ? "grid"
            : s.display.includes("flex")
              ? `flex ${s.flexDirection}`
              : s.display,
        },
        text_roles: [...new Set(leaves.slice(0, 12).map(textRole))],
        states: {},
      };
    });
  });
  for (const [i, c] of found.entries()) {
    if (!["button", "nav item", "input", "tab", "card", "list row"].includes(c.kind) || i >= 12) continue;
    c.states = await readStates(page, `[data-sb-comp="${i}"]`);
  }
  return found;
}

async function readStates(page: Page, sel: string): Promise<Record<string, string[]>> {
  const el = page.locator(sel).first();
  const snap = () =>
    el.evaluate((e, props) => {
      const s = getComputedStyle(e) as unknown as Record<string, string>;
      return Object.fromEntries(props.map((p) => [p, s[p]]));
    }, STATE_PROPS);
  const states: Record<string, string[]> = {};
  try {
    await page.mouse.move(0, 0);
    const base = await snap();
    const diff = (after: Record<string, string>) => STATE_PROPS.filter((p) => after[p] !== base[p]);
    await el.hover({ timeout: 1_500 });
    await page.waitForTimeout(350);
    const hover = diff(await snap());
    if (hover.length) states.hover = hover;
    await page.mouse.move(0, 0);
    await el.focus({ timeout: 1_000 });
    await page.waitForTimeout(350);
    const focus = diff(await snap());
    if (focus.length) states.focus = focus;
    await el.blur();
  } catch {
    // Element not hoverable/focusable (covered, detached): states unknown.
  }
  return states;
}
