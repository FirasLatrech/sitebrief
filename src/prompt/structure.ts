import type { Analysis, PageReport } from "../analyze/index.js";
import type { Region } from "../analyze/layout.js";

export function sensitiveLine(p: PageReport): string {
  const auth = p.sensitive_reasons.includes("password field");
  const pay = p.sensitive_reasons.some((r) => r.startsWith("payment"));
  const flow = auth && pay ? "authentication / checkout" : pay ? "checkout" : "authentication";
  return `Design your own ${flow} flow using a provider of your choice; do not imitate the analyzed site's screens.`;
}

const kinds = (a: Analysis) => new Set(a.components.map((c) => c.kind));
const roles = (a: Analysis) => new Set(a.components.flatMap((c) => c.text_roles));

export function productSummary(a: Analysis, product: string, notes?: string): string {
  const k = kinds(a);
  const r = roles(a);
  const t = a.tech;
  const s: string[] = [];
  const hasApp = k.has("table row") || a.pages.some((p) => p.views[0]?.layout.some((x) => x.name === "aside"));
  s.push(
    hasApp
      ? `${product} is an application-style product: a persistent navigation area frames a main workspace that shows structured data.`
      : `${product} is presented through a content-led site: a top navigation, stacked full-width sections and a footer.`,
  );
  if (k.has("card"))
    s.push(
      `It groups its offering into repeated cards${r.has("price") ? ", including priced plan or product cards" : ""}.`,
    );
  if (t && (t.media.length || t.webrtc))
    s.push("Video is central: the page loads streaming media, so a player or live stage is a core surface.");
  if (t?.websockets.length)
    s.push(
      "It keeps a live connection open, which points to real-time updates such as chat, presence or notifications.",
    );
  const forms = a.interactions
    .filter((i) => i === a.interactions.find((j) => j.page === i.page))
    .flatMap((i) => i.forms);
  if (forms.length)
    s.push(
      `Visitors act through ${forms.length} form(s) (${[...new Set(forms.flatMap((f) => f.fields))].join(", ") || "no visible fields"}).`,
    );
  if (a.sensitive_pages.length) s.push("It has account and/or payment screens, which you will design independently.");
  if (s.length < 3) s.push("Its primary actions are buttons and links that lead deeper into the product.");
  const direction = notes ? `\n\nDirection from the team: ${notes}` : "";
  return `## Product summary\n\n${s.join(" ")}${direction}`;
}

const box = (r: Region) => `${r.box.w}×${r.box.h}px`;
const mode = (r: Region) =>
  r.layout.mode === "grid"
    ? `grid, ${r.layout.columns} column(s)${r.layout.gap ? `, gap ${r.layout.gap}` : ""}`
    : r.layout.mode === "flex"
      ? `flex ${r.layout.direction}${r.layout.gap ? `, gap ${r.layout.gap}` : ""}`
      : "block";

function outline(regions: Region[], depth = 0): string[] {
  return regions.flatMap((r) => [
    `${"  ".repeat(depth)}- **${r.name}**: ${mode(r)}; ${box(r)}; contains ${r.children}`,
    ...outline(r.regions, depth + 1),
  ]);
}

function responsive(p: PageReport, a: Analysis): string[] {
  const d = p.views.find((v) => v.viewport === "desktop");
  const m = p.views.find((v) => v.viewport === "mobile");
  if (!d || !m) return [];
  const lines: string[] = [];
  // Key regions by name + occurrence so the 2nd <section> is compared with the 2nd <section>.
  const keyed = (rs: Region[]) => {
    const seen = new Map<string, number>();
    return new Map(
      rs
        .flatMap((r) => [r, ...r.regions])
        .map((r) => {
          const n = (seen.get(r.name) ?? 0) + 1;
          seen.set(r.name, n);
          return [`${r.name}#${n}`, r] as const;
        }),
    );
  };
  const dm = keyed(d.layout);
  const mm = keyed(m.layout);
  for (const [k, r] of mm) {
    const o = dm.get(k);
    if (o && mode(o) !== mode(r))
      lines.push(`- **${r.name}** changes from ${mode(o)} on desktop to ${mode(r)} on mobile.`);
  }
  for (const [k, r] of dm) if (!mm.has(k)) lines.push(`- **${r.name}** is hidden or collapsed on mobile.`);
  const clicks = (vp: string) =>
    a.interactions.find((i) => i.page === p.path && i.viewport === vp)?.click_through ?? [];
  const desktopTriggers = new Set(clicks("desktop").map((c) => c.trigger));
  for (const c of clicks("mobile")) {
    if (/^(nothing|click failed)/.test(c.opened) || desktopTriggers.has(c.trigger)) continue;
    const drawer = /^(nav|menu|navigation)\b/.test(c.opened) ? " (navigation drawer pattern)" : "";
    lines.push(`- On mobile only, a ${c.trigger} opens ${c.opened}${drawer}.`);
  }
  return lines.length
    ? ["", "Responsive behavior:", ...lines]
    : ["", "Responsive behavior: same structure stacked to a single column on mobile."];
}

export function pagesSection(a: Analysis): string {
  const out = ["## Pages and layout"];
  for (const p of a.pages) {
    out.push("", `### \`${p.path}\``);
    if (p.sensitive) {
      out.push("", sensitiveLine(p));
      continue;
    }
    for (const v of p.views)
      out.push("", `${v.viewport[0].toUpperCase()}${v.viewport.slice(1)}:`, ...outline(v.layout));
    out.push(...responsive(p, a));
  }
  if (a.tokens?.breakpoints.length)
    out.push("", `Breakpoints observed: ${a.tokens.breakpoints.join(", ")}. Use a similar number of breakpoints.`);
  return out.join("\n");
}
