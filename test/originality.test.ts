import { describe, expect, it } from "vitest";
import type { Tokens } from "../src/analyze/tokens.js";
import { generateDesign } from "../src/prompt/originality.js";

const tokens = (background: string) =>
  ({
    colors: { roles: { background, text: "#ffffff", primary: "#1461e1" }, text: [], background: [], border: [] },
    typography: {
      families: ['"Plus Jakarta Sans", sans-serif'],
      sizes: [],
      weights: [],
      line_heights: [],
      letter_spacing: [],
    },
    spacing: { values: [], base_guess: null },
    radii: [],
  }) as unknown as Tokens;

describe("generateDesign", () => {
  it("keeps a dark theme dark and a light theme light, with new values", () => {
    const dark = generateDesign("seed", tokens("#12151d"));
    const light = generateDesign("seed", tokens("#fafafa"));
    const lum = (h: string) => Number.parseInt(h.slice(1, 3), 16);
    expect(lum(dark.colors.background)).toBeLessThan(60);
    expect(lum(light.colors.background)).toBeGreaterThan(200);
    expect(Object.values(dark.colors)).not.toContain("#12151d");
    expect(dark.font.toLowerCase()).not.toBe("plus jakarta sans");
  });

  it("refuses a brand font or color that equals the analyzed site's", () => {
    const d = generateDesign("seed", tokens("#12151d"), { primary: "#1461E1", font: "Plus Jakarta Sans" });
    expect(d.colors.primary).not.toBe("#1461e1");
    expect(d.font).not.toBe("Plus Jakarta Sans");
    expect(d.notes.length).toBeGreaterThanOrEqual(2);
  });
});

describe("palette family", () => {
  it("keeps the accent near the observed hue without reusing it", () => {
    const d = generateDesign("another-seed", tokens("#12151d"));
    const v = Number.parseInt(d.colors.primary.slice(1), 16);
    const [r, g, b] = [v >> 16, (v >> 8) & 255, v & 255];
    expect(b).toBeGreaterThan(r); // observed accent is blue (#1461e1), so the new one stays blue
    expect(b).toBeGreaterThan(g);
    expect(d.colors.primary).not.toBe("#1461e1");
  });
});
