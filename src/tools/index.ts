import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { CallToolResult, ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { type Analysis, analyzeSite } from "../analyze/index.js";
import { pickDesign, renderPrompt } from "../prompt/render.js";
import { cloneWorkflow } from "../prompt/workflow.js";
import { loadAnalysis, saveFile } from "../store.js";
import { compareReport } from "./compare-report.js";
import { getSections } from "./get-sections.js";

const viewport = z.enum(["desktop", "mobile"]);

type Extra = RequestHandlerExtra<ServerRequest, ServerNotification>;

/** Progress notifications keep long browser runs from hitting the client's request timeout. */
const progress = (extra: Extra) => {
  const token = extra._meta?.progressToken;
  let n = 0;
  return (message: string) => {
    if (token === undefined) return;
    // The client may have disconnected mid-run; a failed notification must not become an unhandled rejection.
    extra
      .sendNotification({ method: "notifications/progress", params: { progressToken: token, progress: ++n, message } })
      .catch(() => {});
  };
};

/** One browser job at a time: parallel analyses would multiply memory use and trip the 2-minute budget. */
let chain: Promise<unknown> = Promise.resolve();
const exclusive = <T>(fn: () => Promise<T>): Promise<T> => {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
};

/** Wraps a handler so thrown errors become MCP tool errors instead of protocol errors. */
const safe =
  <A>(fn: (args: A, onProgress: (step: string) => void) => Promise<CallToolResult>) =>
  async (args: A, extra: Extra): Promise<CallToolResult> => {
    try {
      return await fn(args, progress(extra));
    } catch (err) {
      return { isError: true, content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }] };
    }
  };

const text = (t: string): CallToolResult => ({ content: [{ type: "text", text: t }] });

export function registerAll(server: McpServer): void {
  server.registerTool(
    "analyze_site",
    {
      title: "Analyze a website's structure",
      description:
        "Studies a public web page in headless Chromium (no login, no form submission) and records layout, sections, repeated components, design tokens, icon library, safe interactions and passive tech hints. Returns an analysis_id.",
      inputSchema: {
        url: z.string().url().describe("Public http(s) URL"),
        pages: z.array(z.string()).max(5).optional().describe("Same-origin paths, max 5, e.g. ['/', '/pricing']"),
        viewports: z.array(viewport).optional().describe("Default both: 1440x900 and 390x844"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    safe(async (args, onProgress) =>
      text(JSON.stringify(await exclusive(() => analyzeSite(args, onProgress)), null, 2)),
    ),
  );

  server.registerTool(
    "build_prompt",
    {
      title: "Write a build prompt",
      description:
        'Turns a stored analysis into a Markdown build prompt for a coding agent. fidelity "original" (default) generates a new palette and font; "close" reuses the site\'s colors, spacing, type scale, open-licensed font and open icon library. Never includes logos, brand names, copy or images.',
      inputSchema: {
        analysis_id: z.string().describe("From analyze_site"),
        product_name: z.string().min(1).max(80),
        stack: z.string().max(200).optional().describe('Free text, default "React + Vite + plain CSS"'),
        brand: z
          .object({
            primary: z
              .string()
              .regex(/^#[0-9a-fA-F]{6}$/)
              .optional(),
            font: z.string().max(60).optional(),
          })
          .optional(),
        notes: z.string().max(2000).optional(),
        fidelity: z.enum(["original", "close"]).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    safe(async (args) => {
      const analysis = await loadAnalysis<Analysis>(args.analysis_id);
      const md = renderPrompt(analysis, args);
      await saveFile(args.analysis_id, "brief.md", md);
      const design = { ...pickDesign(analysis, args), fidelity: args.fidelity ?? "original" };
      await saveFile(args.analysis_id, "design.json", JSON.stringify(design, null, 2));
      return text(md);
    }),
  );

  server.registerTool(
    "get_sections",
    {
      title: "View reference sections",
      description:
        "Returns the analyzed page's sections as images (a few per call) with an index, so you can see what to build. Sensitive pages are excluded.",
      inputSchema: {
        analysis_id: z.string(),
        page: z.string().optional().describe("Path, e.g. '/pricing'; default all pages"),
        viewport: viewport.optional(),
        start: z.number().int().min(0).optional(),
        limit: z.number().int().min(1).max(6).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    safe(getSections),
  );

  server.registerTool(
    "compare_site",
    {
      title: "Compare your build with the reference",
      description:
        "Screenshots your running build (localhost allowed) at the analyzed pages and viewports and scores it: pixel diff (pixelmatch), layout structure and design tokens. Returns per-page scores, the worst areas mapped to reference sections, and reference/build/diff images of the worst area.",
      inputSchema: {
        analysis_id: z.string(),
        base_url: z.string().url().describe("Where your build runs, e.g. http://localhost:3000"),
        pages: z.array(z.string()).optional(),
        viewports: z.array(viewport).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    safe((args, onProgress) => exclusive(() => compareReport(args, onProgress))),
  );

  server.registerPrompt(
    "clone_site",
    {
      title: "Rebuild a site's structure and look, autonomously",
      description:
        "One-shot workflow: analyze, brief, scaffold, build section by section, compare and iterate until the build matches.",
      argsSchema: {
        url: z.string().describe("Public URL to study"),
        product_name: z.string().describe("Your product's name"),
        stack: z.string().optional().describe("Default: Next.js + Tailwind + TypeScript"),
        out_dir: z.string().optional().describe("Where to create the project"),
        pages: z.string().optional().describe("Comma-separated paths, e.g. /,/pricing"),
        fidelity: z.string().optional().describe("close (default) or original"),
      },
    },
    (args) => ({ messages: [{ role: "user", content: { type: "text", text: cloneWorkflow(args) } }] }),
  );
}
