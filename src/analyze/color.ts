export interface Rgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

const num = (s: string, scale = 1) => (s.endsWith("%") ? (Number.parseFloat(s) / 100) * scale : Number.parseFloat(s));
const gamma = (x: number) => 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
const clamp = (x: number) => Math.max(0, Math.min(255, x));

/** OKLab → sRGB (Björn Ottosson's reference matrices). */
function oklabToRgb(L: number, A: number, B: number, alpha: number): Rgb {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return {
    r: clamp(gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    g: clamp(gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    b: clamp(gamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
    a: alpha,
  };
}

/** Parses the color forms Chromium's getComputedStyle returns: rgb(a), oklab, oklch, color(srgb …). */
export function parseColor(v: string): Rgb | null {
  const c = parseAny(v);
  return c && [c.r, c.g, c.b, c.a].every(Number.isFinite) ? c : null;
}

function parseAny(v: string): Rgb | null {
  const m = v.trim().match(/^(rgba?|oklab|oklch|color)\(\s*(srgb\s+)?([^)]*)\)$/i);
  // color(display-p3 …), color(rec2020 …) etc. are not sRGB: skip rather than misread.
  if (!m || (m[1].toLowerCase() === "color" && !m[2])) return null;
  const [main, alphaPart] = m[3].split("/");
  const p = main.split(/[\s,]+/).filter(Boolean);
  const alpha = alphaPart !== undefined ? num(alphaPart.trim(), 1) : p.length === 4 ? num(p[3], 1) : 1;
  if (p.length < 3) return null;
  switch (m[1].toLowerCase()) {
    case "rgb":
    case "rgba":
      return { r: num(p[0], 255), g: num(p[1], 255), b: num(p[2], 255), a: alpha };
    case "color":
      return { r: num(p[0]) * 255, g: num(p[1]) * 255, b: num(p[2]) * 255, a: alpha };
    case "oklab":
      return oklabToRgb(num(p[0], 1), num(p[1], 0.4), num(p[2], 0.4), alpha);
    default: {
      const h = (num(p[2]) * Math.PI) / 180;
      const c = num(p[1], 0.4);
      return oklabToRgb(num(p[0], 1), c * Math.cos(h), c * Math.sin(h), alpha);
    }
  }
}

export const toHex = ({ r, g, b }: Rgb) =>
  `#${[r, g, b].map((x) => Math.round(x).toString(16).padStart(2, "0")).join("")}`;
