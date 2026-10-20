import type { Analysis } from "../analyze/index.js";
import { type Fidelity, iconAdvice } from "./fidelity.js";
import type { DesignSystem } from "./originality.js";

const PURPOSE: Record<string, string> = {
  card: "presents one item (feature, plan, product, post) in a framed block",
  "repeated block": "repeats one content unit without a frame",
  button: "triggers the main actions",
  "nav item": "moves between top-level sections",
  "list row": "shows one entry in a list",
  "table row": "shows one record in a data table",
  input: "collects user input",
  tab: "switches between views within one area",
  modal: "shows focused content above the page",
};

const BASE_PROPS: Record<string, string[]> = {
  button: ["label", "variant", "onClick | href", "disabled", "loading"],
  "nav item": ["label", "href", "active", "icon?"],
  input: ["label", "value", "onChange", "placeholder", "error?", "disabled"],
  tab: ["label", "active", "onSelect"],
  modal: ["open", "onClose", "title", "children"],
  "table row": ["record", "columns", "onSelect?"],
  "list row": ["item", "onSelect?"],
};

const ROLE_PROPS: Record<string, string> = {
  title: "title",
  price: "price",
  label: "eyebrow/label",
  action: "ctaLabel + onAction",
  body: "description",
  emphasis: "highlight",
};

export function componentsSection(a: Analysis): string {
  const merged = new Map<string, { count: number; pages: Set<string>; c: Analysis["components"][number] }>();
  for (const c of a.components) {
    const key = `${c.kind}|${c.example.children}`;
    const m = merged.get(key) ?? { count: 0, pages: new Set<string>(), c };
    m.count += c.count;
    m.pages.add(c.page);
    merged.set(key, m);
  }
  const out = ["## Components"];
  const seen = new Map<string, number>();
  for (const { count, pages, c } of [...merged.values()].sort((x, y) => y.count - x.count).slice(0, 14)) {
    const n = (seen.get(c.kind) ?? 0) + 1;
    seen.set(c.kind, n);
    const name = `${c.kind[0].toUpperCase()}${c.kind.slice(1)}${n > 1 ? ` ${n}` : ""}`;
    const props = [
      ...new Set([...(BASE_PROPS[c.kind] ?? []), ...c.text_roles.map((r) => ROLE_PROPS[r]).filter(Boolean)]),
    ];
    const states = Object.entries(c.states).map(([s, p]) => `${s} (changes ${p.join(", ")})`);
    out.push(
      "",
      `### ${name}`,
      `- Purpose: ${PURPOSE[c.kind] ?? "repeated unit"}; seen ${count}× on ${[...pages].join(", ")}.`,
      `- Structure: ${c.example.layout} container about ${c.example.box.w}×${c.example.box.h}px with ${c.example.children}; text roles: ${c.text_roles.join(", ") || "none"}.`,
      `- States: default${states.length ? `, ${states.join(", ")}` : ""}, focus-visible, disabled where it applies.`,
      `- Props: ${props.join(", ") || "children"}.`,
    );
  }
  if (out.length === 1)
    out.push("", "No repeated components were detected; derive components from the layout outline.");
  return out.join("\n");
}

export function designSection(a: Analysis, d: DesignSystem, fidelity: Fidelity = "original"): string {
  const t = a.tokens;
  const observed = t
    ? `Observed structure: ${Object.keys(t.colors.roles).length} color roles (${Object.keys(t.colors.roles).join(", ")}), ` +
      `${t.typography.sizes.length} font sizes, ${t.typography.weights.length} weights, ` +
      `${t.spacing.values.length} spacing steps${t.spacing.base_guess ? ` on a ~${t.spacing.base_guess}px grid` : ""}, ` +
      `${t.radii.filter((r) => r > 0).length} radii, ${t.shadows.length} shadow level(s), ${t.motion.durations.length} transition duration(s).`
    : "No tokens were observed; use the set below as is.";
  const vars = [
    ...Object.entries(d.colors).map(([k, v]) => `  --color-${k}: ${v};`),
    `  --font-sans: "${d.font}", system-ui, sans-serif;`,
    ...d.type_scale.map((v, i) => `  --text-${i + 1}: ${v}px;`),
    ...d.weights.map((v, i) => `  --weight-${i + 1}: ${v};`),
    ...d.spacing.map((v, i) => `  --space-${i + 1}: ${v}px;`),
    ...d.radii.map((v, i) => `  --radius-${i + 1}: ${v}px;`),
    ...d.durations.map((v, i) => `  --duration-${i + 1}: ${v}ms;`),
    `  --ease: ${d.easing};`,
  ];
  return [
    "## Design system",
    "",
    observed,
    "",
    fidelity === "close"
      ? "Use this token set. It matches the analyzed site's values (close-fidelity brief requested by the team)."
      : "Use this original token set (same roles and scale sizes, new values). Do not look up or reuse the analyzed site's colors or fonts.",
    "",
    "```css",
    ":root {",
    ...vars,
    "}",
    "```",
    "",
    `Font: ${d.font} (open license). ${iconAdvice(a.icons, fidelity)} Check text/background contrast reaches WCAG AA.`,
    ...d.notes.map((n) => `- ${n}`),
  ].join("\n");
}
