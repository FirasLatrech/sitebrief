import { describe, expect, it } from "vitest";
import { parseColor, toHex } from "../src/analyze/color.js";

const hex = (v: string) => {
  const c = parseColor(v);
  return c ? toHex(c) : null;
};

describe("parseColor", () => {
  it("reads every form Chromium serializes", () => {
    expect(hex("rgb(228, 87, 46)")).toBe("#e4572e");
    expect(hex("rgba(0, 0, 0, 0.5)")).toBe("#000000");
    expect(hex("oklab(0.999994 0.0000455678 0.0000200868 / 0.9)")).toBe("#ffffff");
    expect(hex("oklab(0 0 0)")).toBe("#000000");
    expect(hex("oklch(0.628 0.2577 29.23)")).toBe("#ff0000");
    expect(hex("color(srgb 0 0.5 1 / 0.4)")).toBe("#0080ff");
    expect(parseColor("oklab(0.5 0 0 / 0.25)")?.a).toBe(0.25);
    expect(parseColor("transparent")).toBeNull();
    // Wide-gamut spaces are not sRGB: rejected instead of producing #NaN… (audit #4).
    expect(parseColor("color(display-p3 0.5 0.2 0.1)")).toBeNull();
    expect(parseColor("color(rec2020 0.5 0.2 0.1 / 0.5)")).toBeNull();
  });
});
