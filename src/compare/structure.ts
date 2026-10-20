import type { ImageSlot } from "../analyze/images.js";
import type { Region } from "../analyze/layout.js";
import type { Tokens } from "../analyze/tokens.js";

const IMPLICIT: Record<string, string> = {
  main: "main",
  header: "banner",
  footer: "contentinfo",
  nav: "navigation",
  aside: "complementary",
  form: "form",
  dialog: "dialog",
  section: "region",
};

/** `main[role=main]` and `main` are the same landmark; only explicit, non-implicit roles stay in the name. */
const normName = (name: string) => {
  const m = name.match(/^(\w+)\[role=([\w-]+)\]$/);
  return m && IMPLICIT[m[1]] === m[2] ? m[1] : name;
};
const sig = (r: Region) => `${normName(r.name)}|${r.layout.mode}${r.layout.direction ? `-${r.layout.direction}` : ""}`;

/** Top 3 levels, skipping tiny regions (e.g. 1×1 live regions) and stepping through single-child div wrappers. */
const flatten = (rs: Region[], depth = 0): string[] =>
  depth > 2
    ? []
    : rs
        .filter((r) => r.box.w * r.box.h >= 400)
        .flatMap((r) =>
          r.name === "div" && r.regions.length === 1
            ? flatten(r.regions, depth)
            : [sig(r), ...flatten(r.regions, depth + 1)],
        );

function lcs(a: string[], b: string[]): number {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return dp[a.length][b.length];
}

/** Ordered landmark/layout-mode match of the two outlines (top 3 levels), 0..1. */
export function structureSimilarity(ref: Region[], cand: Region[]): { similarity: number; missing: string[] } {
  const a = flatten(ref);
  const b = flatten(cand);
  if (!a.length) return { similarity: 1, missing: [] };
  const missing = [...new Set(a.filter((s) => !b.includes(s)))].slice(0, 8);
  return { similarity: lcs(a, b) / Math.max(a.length, b.length), missing };
}

const rgb = (hex: string) => {
  const v = Number.parseInt(hex.slice(1), 16);
  return [v >> 16, (v >> 8) & 255, v & 255];
};
const dist = (x: string, y: string) => {
  const [a, b] = [rgb(x), rgb(y)];
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / 441.7;
};
export interface TokenTarget {
  roles: Record<string, string>;
  font: string;
}

const firstFont = (t: Tokens) => (t.typography.families[0] ?? "").split(",")[0].replace(/["']/g, "").trim();

/** How close the build's color roles and primary font are to the target, 0..1. */
export function tokenSimilarity(target: TokenTarget, cand: Tokens | null): { similarity: number; notes: string[] } {
  if (!cand) return { similarity: 0, notes: ["no tokens read from your build"] };
  const notes: string[] = [];
  const roles = Object.entries(target.roles).filter(([, v]) => /^#[0-9a-f]{6}$/i.test(v));
  let sum = 0;
  for (const [role, value] of roles) {
    const mine = cand.colors.roles[role];
    const d = mine && /^#[0-9a-f]{6}$/i.test(mine) ? dist(value, mine) : 1;
    sum += d;
    if (d > 0.12) notes.push(`color role "${role}": yours ${mine ?? "missing"}, target ${value}`);
  }
  const colorSim = roles.length ? 1 - sum / roles.length : 1;
  const yours = firstFont(cand);
  const fontOk = yours.toLowerCase() === target.font.toLowerCase();
  if (!fontOk) notes.push(`primary font: yours "${yours}", target "${target.font}"`);
  return { similarity: colorSim * 0.8 + (fontOk ? 0.2 : 0), notes };
}

/** Every reference image slot (by role and count) should have a counterpart in the build, 0..1. */
export function imageSimilarity(ref: ImageSlot[], cand: ImageSlot[]): { similarity: number; notes: string[] } {
  // Content images are interchangeable (a carousel picture may sit in a card on one site and not the other).
  const family = (role: ImageSlot["role"]) =>
    role === "media" || role === "card image" || role === "background" || role === "video" ? "content image" : role;
  const count = (slots: ImageSlot[]) => {
    const m = new Map<string, number>();
    for (const s of slots) m.set(family(s.role), (m.get(family(s.role)) ?? 0) + s.count);
    return m;
  };
  const [r, c] = [count(ref), count(cand)];
  if (!r.size) return { similarity: 1, notes: [] };
  const notes: string[] = [];
  let sum = 0;
  for (const [role, n] of r) {
    const mine = c.get(role) ?? 0;
    sum += Math.min(mine, n) / n;
    if (mine < n) notes.push(`images: ${role} ${mine}/${n} filled`);
  }
  return { similarity: sum / r.size, notes };
}
