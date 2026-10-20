import type { IconReport } from "../analyze/icons.js";
import type { Tokens } from "../analyze/tokens.js";
import { type Brand, type DesignSystem, generateDesign } from "./originality.js";

export type Fidelity = "original" | "close";

/** Google Fonts families under the SIL Open Font License or Apache 2.0, so they may be reused freely. */
const OPEN_FONTS = new Set(
  [
    "Inter",
    "Roboto",
    "Open Sans",
    "Lato",
    "Montserrat",
    "Poppins",
    "Plus Jakarta Sans",
    "Manrope",
    "DM Sans",
    "Work Sans",
    "Nunito",
    "Nunito Sans",
    "Raleway",
    "Source Sans 3",
    "Source Sans Pro",
    "IBM Plex Sans",
    "Rubik",
    "Outfit",
    "Figtree",
    "Public Sans",
    "Mulish",
    "Karla",
    "Space Grotesk",
    "Sora",
    "Lexend",
    "Urbanist",
    "Barlow",
    "Heebo",
    "Noto Sans",
    "Noto Sans JP",
    "Noto Serif",
    "Merriweather",
    "Playfair Display",
    "Lora",
    "PT Sans",
    "Fira Sans",
    "Ubuntu",
    "Oswald",
    "Archivo",
    "Red Hat Display",
    "Red Hat Text",
    "Be Vietnam Pro",
    "Onest",
    "Geist",
    "Geist Mono",
    "JetBrains Mono",
    "Roboto Mono",
    "Josefin Sans",
    "Quicksand",
    "Cabin",
    "Hind",
    "Titillium Web",
    "Libre Franklin",
    "Prompt",
    "Kanit",
    "Epilogue",
    "Instrument Sans",
    "Bricolage Grotesque",
    "Albert Sans",
    "Schibsted Grotesk",
    "Hanken Grotesk",
    "Golos Text",
    "Space Mono",
    "Bebas Neue",
    "Anton",
    "Archivo Black",
  ].map((f) => f.toLowerCase()),
);

const families = (t: Tokens) =>
  t.typography.families.flatMap((s) => s.split(",").map((f) => f.trim().replace(/["']/g, ""))).filter(Boolean);

const luminance = (hex: string) => {
  const v = Number.parseInt(hex.slice(1), 16);
  return (0.2126 * (v >> 16) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255)) / 255;
};

const toMs = (d: string) => Math.round(Number.parseFloat(d) * (d.endsWith("ms") ? 1 : 1000));

/** The observed token set, reused as-is. Only the font is filtered: proprietary faces get an open substitute. */
export function closeDesign(seed: string, tokens: Tokens | null, brand: Brand = {}): DesignSystem {
  const fallback = generateDesign(seed, tokens, brand);
  if (!tokens) return { ...fallback, notes: [...fallback.notes, "No tokens were observed; using a generated set."] };
  const notes: string[] = [];
  const colors = { ...tokens.colors.roles };
  if (brand.primary) colors.primary = brand.primary.toLowerCase();
  if (colors.primary) colors["on-primary"] = luminance(colors.primary) > 0.6 ? "#111111" : "#ffffff";
  const open = families(tokens).find((f) => OPEN_FONTS.has(f.toLowerCase()));
  const seen = families(tokens)[0];
  const font = brand.font ?? open ?? fallback.font;
  if (!brand.font && !open && seen)
    notes.push(`The site's primary font is not a known open font; use ${font} instead.`);
  if (!brand.font && open && seen && open !== seen)
    notes.push(`The site's first font is not open-licensed; "${open}" from the same font stack is.`);
  const weights = tokens.typography.weights.map(Number).filter((w) => w > 0);
  return {
    colors,
    font,
    type_scale: tokens.typography.sizes.length ? tokens.typography.sizes : fallback.type_scale,
    weights: weights.length ? weights : fallback.weights,
    spacing: tokens.spacing.values.length ? tokens.spacing.values : fallback.spacing,
    radii: tokens.radii.filter((r) => r > 0 && r < 1000).length
      ? tokens.radii.filter((r) => r > 0 && r < 1000)
      : fallback.radii,
    durations: tokens.motion.durations.length ? tokens.motion.durations.map(toMs) : fallback.durations,
    easing: tokens.motion.easings[0] ?? fallback.easing,
    notes,
  };
}

/** One line telling the builder which icon set to use. Only open libraries are named; custom artwork is never reused. */
export function iconAdvice(icons: IconReport | undefined, fidelity: Fidelity): string {
  const libs = icons?.libraries ?? [];
  const custom = icons?.custom_svg_icons ?? 0;
  const parts: string[] = [];
  if (fidelity === "close" && libs.length)
    parts.push(`Icons: the site uses ${libs.join(", ")}; use the same open library.`);
  else parts.push("Icons: Lucide.");
  if (custom)
    parts.push(`It also has ${custom} custom SVG icon(s): pick equivalents from your icon set, do not trace them.`);
  return parts.join(" ");
}
