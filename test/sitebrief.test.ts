import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Analysis } from "../src/analyze/index.js";
import { ORIGINALITY_RULES } from "../src/prompt/originality.js";
import { createServer } from "../src/server.js";
import { FIXTURES, serveFixtures } from "./helpers.js";

let site: Awaited<ReturnType<typeof serveFixtures>>;
let client: Client;
let home: string;
let analysis: Analysis;
let brief: string;

const text = (r: unknown) => (r as { content: { text: string }[] }).content[0].text;

beforeAll(async () => {
  process.env.SITEBRIEF_ALLOW_LOCAL = "1";
  home = await mkdtemp(join(tmpdir(), "sitebrief-"));
  process.env.SITEBRIEF_HOME = home;
  site = await serveFixtures();
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createServer().connect(a);
  client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(b);
  const res = await client.callTool({
    name: "analyze_site",
    arguments: {
      url: `${site.url}/landing.html`,
      pages: ["/landing.html", "/dashboard.html", "/login.html", "/checkout.html"],
    },
  });
  expect(res.isError, text(res)).toBeFalsy();
  analysis = JSON.parse(text(res));
  const built = await client.callTool({
    name: "build_prompt",
    arguments: {
      analysis_id: analysis.analysis_id,
      product_name: "Orbitly",
      notes: "A small team planner",
    },
  });
  expect(built.isError, text(built)).toBeFalsy();
  brief = text(built);
}, 120_000);

afterAll(async () => {
  await client?.close();
  await site?.close();
  await rm(home, { recursive: true, force: true });
});

const page = (p: string) => analysis.pages.find((x) => x.path === p);
const names = (p: string) => {
  const walk = (rs: { name: string; regions: unknown[] }[]): string[] =>
    rs.flatMap((r) => [r.name, ...walk(r.regions as typeof rs)]);
  return walk(page(p)?.views[0].layout ?? []);
};

describe("analyze_site", () => {
  it("finds landmarks", () => {
    expect(names("/landing.html")).toEqual(expect.arrayContaining(["header", "nav", "main", "section", "footer"]));
    expect(names("/dashboard.html")).toEqual(expect.arrayContaining(["aside", "main"]));
    expect(page("/landing.html")?.views.map((v) => v.viewport)).toEqual(["desktop", "mobile"]);
  });

  it("detects repeated cards and their hover state", () => {
    const cards = analysis.components.filter((c) => c.kind === "card" && c.page === "/landing.html");
    expect(cards.reduce((n, c) => n + c.count, 0)).toBeGreaterThanOrEqual(6);
    expect(cards.some((c) => c.text_roles.includes("price"))).toBe(true);
    expect(cards.some((c) => c.states.hover?.includes("transform"))).toBe(true);
  });

  it("infers token roles", () => {
    const roles = analysis.tokens?.colors.roles ?? {};
    for (const r of ["background", "text", "primary", "border"]) expect(roles[r], r).toBeTruthy();
    expect(roles.primary).toBe("#e4572e");
    expect(analysis.tokens?.breakpoints).toEqual(expect.arrayContaining(["max-width 768px", "min-width 1200px"]));
  });

  it("flags login and checkout as sensitive", () => {
    expect(analysis.sensitive_pages.sort()).toEqual(["/checkout.html", "/login.html"]);
  });

  it("clicks through the dialog and the mobile menu, and sees the API call", () => {
    const desk = analysis.interactions.find((i) => i.page === "/landing.html" && i.viewport === "desktop");
    expect(desk?.click_through.some((c) => c.opened.startsWith("dialog"))).toBe(true);
    const mob = analysis.interactions.find((i) => i.page === "/landing.html" && i.viewport === "mobile");
    expect(mob?.click_through.some((c) => c.opened !== "nothing detected")).toBe(true);
    expect(analysis.tech?.rest_endpoints.some((e) => e.endsWith("/api/plans/:id"))).toBe(true);
    expect(analysis.screenshots.length).toBe(8);
  });
});

describe("build_prompt", () => {
  it("contains every section and the originality rules", () => {
    for (const h of [
      "Product summary",
      "Pages and layout",
      "Components",
      "Design system",
      "Behaviors",
      "Technical notes",
      "Build plan",
      "Originality rules",
    ]) {
      expect(brief).toContain(`## ${h}`);
    }
    expect(brief).toContain(ORIGINALITY_RULES);
    expect(brief).toContain("do not imitate the analyzed site's screens");
  });

  it("leaks none of the fixture's colors, fonts or copy", async () => {
    const css = await readFile(join(FIXTURES, "styles.css"), "utf8");
    const hexes = [...new Set(css.match(/#[0-9a-f]{6}\b/gi) ?? [])];
    expect(hexes.length).toBeGreaterThan(5);
    const lower = brief.toLowerCase();
    for (const h of hexes) expect(lower, h).not.toContain(h.toLowerCase());
    for (const s of [
      "Quirkfixture",
      "Georgia",
      "Zebracorn",
      "Moonlit",
      "Launchpad",
      "Welcome back",
      "Glowing widgets",
    ]) {
      expect(brief, s).not.toContain(s);
    }
  });
});

describe("v2: sections, icons, close fidelity, compare, workflow", () => {
  it("detects image slots by role without downloading them", () => {
    const view = page("/landing.html")?.views.find((v) => v.viewport === "desktop");
    const roles = Object.fromEntries((view?.images ?? []).map((s) => [s.role, s.count]));
    expect(roles["logo strip"]).toBe(4);
    expect(roles["hero media"]).toBe(1);
    expect(brief).toContain("## Images and media");
  });

  it("captures section crops and detects the icon library", () => {
    const view = page("/landing.html")?.views.find((v) => v.viewport === "desktop");
    expect(view?.sections.length).toBeGreaterThanOrEqual(3);
    expect(analysis.icons.libraries).toContain("Lucide");
  });

  it("get_sections returns images and skips sensitive pages", async () => {
    const res = await client.callTool({
      name: "get_sections",
      arguments: { analysis_id: analysis.analysis_id, limit: 2 },
    });
    const content = (res as { content: { type: string; text?: string }[] }).content;
    expect(content.filter((c) => c.type === "image")).toHaveLength(2);
    expect(content[0].text).not.toContain("/login.html");
  });

  it("close fidelity reuses observed colors but still no copy", async () => {
    const res = await client.callTool({
      name: "build_prompt",
      arguments: { analysis_id: analysis.analysis_id, product_name: "Orbitly", fidelity: "close" },
    });
    const md = text(res);
    expect(md).toContain("#e4572e");
    expect(md).toContain("Fidelity: close");
    expect(md).toContain("Lucide");
    for (const s of ["Zebracorn", "Moonlit", "Glowing widgets", "Quirkfixture"]) expect(md, s).not.toContain(s);
  });

  it("compare_site scores the reference against itself near 100%", async () => {
    const res = await client.callTool({
      name: "compare_site",
      arguments: {
        analysis_id: analysis.analysis_id,
        base_url: site.url,
        pages: ["/landing.html"],
        viewports: ["desktop"],
      },
    });
    expect(res.isError, text(res)).toBeFalsy();
    // Same page on both sides: pixels and structure must match fully. (Tokens lose the font point on purpose:
    // the fixture's font is proprietary, so close mode targets an open substitute.)
    expect(text(res)).toMatch(/pixels 100%, structure 100%/);
    expect(text(res)).toMatch(/images 100%/);
    expect(Number(/Overall match: (\d+)%/.exec(text(res))?.[1])).toBeGreaterThanOrEqual(90);
    const images = (res as { content: { type: string }[] }).content.filter((c) => c.type === "image");
    expect(images).toHaveLength(3);
  });

  it("clone_site prompt drives the whole loop", async () => {
    const p = await client.getPrompt({
      name: "clone_site",
      arguments: { url: "https://example.com", product_name: "Orbitly" },
    });
    const body = (p.messages[0].content as { text: string }).text;
    for (const step of [
      "analyze_site",
      "build_prompt",
      "get_sections",
      "compare_site",
      "create-next-app",
      "image slot",
    ]) {
      expect(body).toContain(step);
    }
  });
});
