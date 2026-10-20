import { describe, expect, it } from "vitest";
import { inferTokens } from "../src/analyze/tokens.js";
import type { RawTokens } from "../src/analyze/tokens-collect.js";

const empty = (): RawTokens => ({
  text: {},
  background: {},
  border: {},
  accentCandidates: {},
  rootBackground: "rgb(255, 255, 255)",
  fontFamily: {},
  fontSize: {},
  fontWeight: {},
  lineHeight: {},
  letterSpacing: {},
  spacing: {},
  radius: {},
  shadow: {},
  borderWidth: {},
  duration: {},
  easing: {},
  breakpoints: {},
  unreadableSheets: 0,
});

describe("inferTokens", () => {
  it("detects an 8px grid as 8, not 4 (audit #5)", () => {
    const raw = empty();
    raw.spacing = { "8px": 10, "16px": 8, "24px": 6, "32px": 4, "64px": 2 };
    expect(inferTokens(raw).spacing.base_guess).toBe(8);
    raw.spacing = { "4px": 10, "8px": 8, "12px": 6, "20px": 4 };
    expect(inferTokens(raw).spacing.base_guess).toBe(4);
  });
});
