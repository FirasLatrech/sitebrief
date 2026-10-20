import { parseColor, type Rgb, toHex } from "./color.js";
import type { Counts, RawTokens } from "./tokens-collect.js";

export function hsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

const ranked = (c: Counts) => Object.entries(c).sort((a, b) => b[1] - a[1]);
const hexRanked = (c: Counts) => {
  const merged: Counts = {};
  for (const [k, n] of ranked(c)) {
    const rgb = parseColor(k);
    // Fully transparent colors carry no role; unparseable ones are dropped rather than leaking raw CSS.
    if (!rgb || rgb.a < 0.05) continue;
    const key = toHex(rgb);
    merged[key] = (merged[key] ?? 0) + n;
  }
  return ranked(merged).map(([k]) => k);
};
const top = (c: Counts, n: number) =>
  ranked(c)
    .slice(0, n)
    .map(([k]) => k);
const px = (c: Counts, n: number) =>
  top(c, n)
    .map((v) => parseFloat(v))
    .filter((v) => !Number.isNaN(v))
    .sort((a, b) => a - b);

export interface Tokens {
  colors: {
    roles: Record<string, string>;
    text: string[];
    background: string[];
    border: string[];
  };
  typography: {
    families: string[];
    sizes: number[];
    weights: string[];
    line_heights: string[];
    letter_spacing: string[];
  };
  spacing: { values: number[]; base_guess: number | null };
  radii: number[];
  shadows: string[];
  border_widths: string[];
  motion: { durations: string[]; easings: string[] };
  breakpoints: string[];
  notes: string[];
}

const sat = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16);
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return { h: 0, s: 0, l: 0 };
  return hsl({ r: n >> 16, g: (n >> 8) & 255, b: n & 255, a: 1 });
};

/** Groups frequency-ranked colors into roles and turns raw counts into scales. */
export function inferTokens(raw: RawTokens): Tokens {
  const text = hexRanked(raw.text);
  const bg = hexRanked(raw.background);
  const border = hexRanked(raw.border);
  const accent = hexRanked(raw.accentCandidates);
  const rootRgb = parseColor(raw.rootBackground);
  const roles: Record<string, string> = {};
  roles.background = rootRgb && rootRgb.a > 0 ? toHex(rootRgb) : (bg[0] ?? "#ffffff");
  const surface = bg.find((c) => c !== roles.background && sat(c).s < 0.25);
  if (surface) roles.surface = surface;
  if (text[0]) roles.text = text[0];
  const muted = text.find((c) => c !== roles.text && sat(c).s < 0.3);
  if (muted) roles.muted = muted;
  const primary = [...accent, ...bg, ...text].find((c) => sat(c).s >= 0.45 && sat(c).l >= 0.25 && sat(c).l <= 0.75);
  if (primary) roles.primary = primary;
  if (border[0]) roles.border = border[0];
  const all = [...new Set([...text, ...bg, ...border])];
  const danger = all.find((c) => c !== roles.primary && sat(c).s > 0.45 && (sat(c).h < 12 || sat(c).h > 345));
  const success = all.find((c) => c !== roles.primary && sat(c).s > 0.35 && sat(c).h > 95 && sat(c).h < 160);
  if (danger) roles.danger = danger;
  if (success) roles.success = success;

  const spacing = px(raw.spacing, 12);
  const base = spacing.length
    ? [8, 4, 6, 5].find((b) => spacing.filter((v) => v % b === 0).length >= spacing.length * 0.7)
    : null;
  return {
    colors: {
      roles,
      text: text.slice(0, 8),
      background: bg.slice(0, 8),
      border: border.slice(0, 5),
    },
    typography: {
      families: top(raw.fontFamily, 4),
      sizes: px(raw.fontSize, 10),
      weights: top(raw.fontWeight, 5).sort(),
      line_heights: top(raw.lineHeight, 6),
      letter_spacing: top(raw.letterSpacing, 4),
    },
    spacing: { values: spacing, base_guess: base ?? null },
    radii: px(raw.radius, 6),
    shadows: top(raw.shadow, 4),
    border_widths: top(raw.borderWidth, 3),
    motion: { durations: top(raw.duration, 4), easings: top(raw.easing, 3) },
    breakpoints: top(raw.breakpoints, 8).sort((a, b) => parseInt(a.split(" ")[1], 10) - parseInt(b.split(" ")[1], 10)),
    notes: raw.unreadableSheets
      ? [`${raw.unreadableSheets} cross-origin stylesheet(s) unreadable; breakpoints may be incomplete`]
      : [],
  };
}

/** Adds counts from b into a (for merging pages). */
export function mergeRaw(a: RawTokens, b: RawTokens): RawTokens {
  const out = { ...a } as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(b)) {
    if (typeof v === "object" && v) {
      const dst = { ...(out[k] as Counts) };
      for (const [kk, n] of Object.entries(v as Counts)) dst[kk] = (dst[kk] ?? 0) + n;
      out[k] = dst;
    }
  }
  out.unreadableSheets = a.unreadableSheets + b.unreadableSheets;
  return out as unknown as RawTokens;
}
