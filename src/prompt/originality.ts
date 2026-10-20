import { createHash } from "node:crypto";
import type { Tokens } from "../analyze/tokens.js";

export const ORIGINALITY_RULES = `## Originality rules

- Write all code from scratch. Do not fetch, copy or adapt the analyzed site's HTML, CSS, JS, images, icons, logos, illustrations, fonts, or text.
- Use the new product name and brand everywhere. The result must not be mistakable for the analyzed site.
- Use placeholder or newly written copy; use an open icon set (e.g. Lucide) and open fonts.`;

const OPEN_FONTS = [
  "Manrope",
  "IBM Plex Sans",
  "Work Sans",
  "DM Sans",
  "Source Sans 3",
  "Figtree",
  "Outfit",
  "Public Sans",
];

export interface Brand {
  primary?: string;
  font?: string;
}

export interface DesignSystem {
  colors: Record<string, string>;
  font: string;
  type_scale: number[];
  weights: number[];
  spacing: number[];
  radii: number[];
  durations: number[];
  easing: string;
  notes: string[];
}

const hslToHex = (h: number, s: number, l: number) => {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

/** Every font family name mentioned in the observed stacks, lowercased. */
export const observedFonts = (t: Tokens | null) =>
  new Set(
    (t?.typography.families ?? []).flatMap((s) => s.split(",").map((f) => f.trim().replace(/["']/g, "").toLowerCase())),
  );

export const observedColors = (t: Tokens | null) =>
  new Set(
    t
      ? [...Object.values(t.colors.roles), ...t.colors.text, ...t.colors.background, ...t.colors.border].map((c) =>
          c.toLowerCase(),
        )
      : [],
  );

/** New token values with the same roles and scale sizes as observed; never reuses an observed hex or font name. */
export function generateDesign(seed: string, tokens: Tokens | null, brand: Brand = {}): DesignSystem {
  const notes: string[] = [];
  const taken = observedColors(tokens);
  const fonts = observedFonts(tokens);
  const n = createHash("sha256").update(seed).digest().readUInt32BE(0);
  const unique = (h: number, s: number, l: number) => {
    let hex = hslToHex(h, s, l);
    for (let i = 1; taken.has(hex); i++) hex = hslToHex((h + i * 7) % 360, s, l);
    taken.add(hex);
    return hex;
  };
  // Stay in the analyzed site's color family (a few degrees off its accent hue), never on its exact values.
  const seen = tokens?.colors.roles.primary;
  const seenHue = seen && /^#[0-9a-f]{6}$/i.test(seen) ? hexHue(seen) : null;
  let hue = seenHue === null ? n % 360 : (seenHue + (n % 2 ? 1 : -1) * (6 + (n % 7)) + 360) % 360;
  let primary = unique(hue, 0.75, 0.5);
  if (brand.primary && /^#[0-9a-f]{6}$/i.test(brand.primary)) {
    if (observedColors(tokens).has(brand.primary.toLowerCase())) {
      notes.push(
        "The requested primary color matched the analyzed site exactly, so a nearby new color is used instead.",
      );
    } else primary = brand.primary.toLowerCase();
    hue = hexHue(primary);
  }
  const roles = new Set(Object.keys(tokens?.colors.roles ?? {}));
  for (const r of ["background", "text", "primary"]) roles.add(r);
  // Keep the observed light/dark structure: flip neutral lightness when the site's background is dark.
  const bg = tokens?.colors.roles.background;
  const dark = !!bg && /^#[0-9a-f]{6}$/i.test(bg) && luminance(bg) < 0.35;
  const L = (l: number) => (dark ? 1 - l : l);
  const make: Record<string, () => string> = {
    background: () => unique(hue, 0.3, L(0.985)),
    surface: () => unique(hue, 0.25, L(0.94)),
    text: () => unique(hue, 0.25, L(0.08)),
    muted: () => unique(hue, 0.1, L(0.4)),
    primary: () => primary,
    border: () => unique(hue, 0.15, L(0.86)),
    danger: () => unique(356, 0.7, dark ? 0.62 : 0.48),
    success: () => unique(146, 0.55, dark ? 0.55 : 0.36),
  };
  const colors = Object.fromEntries([...roles].filter((r) => make[r]).map((r) => [r, make[r]()]));
  colors["on-primary"] = unique(hue, 0.2, 0.99);
  if (dark) notes.push("The analyzed site uses a dark theme, so this palette is dark too.");

  let font = OPEN_FONTS[n % OPEN_FONTS.length];
  if (brand.font && !fonts.has(brand.font.toLowerCase())) font = brand.font;
  else if (brand.font)
    notes.push("The requested font is the one the analyzed site uses, so a different open font is suggested.");
  for (let i = 1; i <= OPEN_FONTS.length && fonts.has(font.toLowerCase()); i++)
    font = OPEN_FONTS[(n + i) % OPEN_FONTS.length];

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const sizes = clamp(tokens?.typography.sizes.length ?? 6, 4, 9);
  const ratio = 1.2 + (n % 3) * 0.025;
  const type_scale = Array.from({ length: sizes }, (_, i) => Math.round(12 * ratio ** i));
  const steps = clamp(tokens?.spacing.values.length ?? 8, 4, 10);
  const unit = tokens?.spacing.base_guess === 8 ? 8 : 4;
  const spacing = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32].slice(0, steps).map((m) => m * unit);
  const radiiCount = clamp(tokens?.radii.filter((r) => r > 0).length ?? 3, 1, 6);
  const radii = [3, 6, 10, 14, 20, 28].slice(0, radiiCount);
  const weights = clamp(tokens?.typography.weights.length ?? 3, 2, 4) >= 3 ? [400, 500, 700] : [400, 600];
  return {
    colors,
    font,
    type_scale,
    weights,
    spacing,
    radii,
    durations: [120, 200, 320],
    easing: "cubic-bezier(0.2, 0, 0, 1)",
    notes,
  };
}

function rgbHue(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

function luminance(hex: string): number {
  const v = Number.parseInt(hex.slice(1), 16);
  return (0.2126 * (v >> 16) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255)) / 255;
}

const hexHue = (hex: string) => {
  const v = Number.parseInt(hex.slice(1), 16);
  return rgbHue(v >> 16, (v >> 8) & 255, v & 255);
};
