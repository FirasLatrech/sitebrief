import { TARGET_SCORE } from "../tools/compare-report.js";

export interface CloneArgs {
  url: string;
  product_name: string;
  stack?: string;
  out_dir?: string;
  pages?: string;
  fidelity?: string;
}

const DEFAULT_STACK = "Next.js (latest, App Router) + Tailwind CSS (latest) + TypeScript";

/** The end-to-end instructions the host agent follows when the user runs the clone_site prompt. */
export function cloneWorkflow(args: CloneArgs): string {
  const stack = args.stack?.trim() || DEFAULT_STACK;
  const out = args.out_dir?.trim() || `./${args.product_name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const fidelity = args.fidelity === "original" ? "original" : "close";
  const pages = args.pages
    ?.split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const pagesJson = pages?.length ? `, "pages": ${JSON.stringify(pages)}` : "";
  return `Rebuild the structure and look of ${args.url} as a new product called "${args.product_name}", working on your own until it matches. Do every step without asking me, unless a step fails twice.

Rules that always apply: write all code yourself; never copy the site's HTML, CSS, JS, logos, brand name, text, photos, illustrations or custom icons. Use "${args.product_name}" and newly written copy everywhere. Fidelity is "${fidelity}": ${fidelity === "close" ? "reuse the site's colors, spacing, type scale, its font if open-licensed, and its icon library if it is an open one" : "keep structure and behavior, with a new palette and font"}.

1. Analyze. Call \`analyze_site\` with {"url": "${args.url}"${pagesJson}}. If it reports a block or login wall in limitations, stop and tell me.
2. Brief. Call \`build_prompt\` with {"analysis_id": <id>, "product_name": "${args.product_name}", "stack": "${stack}", "fidelity": "${fidelity}"}. Treat the returned Markdown as the spec.
3. Scaffold in \`${out}\` with ${stack}. Use the official generator (for Next.js: \`create-next-app@latest\` with TypeScript, Tailwind, App Router, src dir) and read the framework's bundled docs (e.g. node_modules/next/dist/docs) before writing framework code. Put the brief's Design system tokens in the global CSS theme and load the font with the framework's font loader.
4. Look before you build. Call \`get_sections\` (desktop, then mobile) page by page, a few sections at a time, and study each image: layout, alignment, spacing, sizes, colors, radii, shadows.
5. Build section by section, top to bottom: header, each section, footer. Fill every image slot from the brief's "Images and media" section at its size and aspect ratio, with images you own, licensed stock or generated originals (never the site's files). Small components, content in data files, server components unless state is needed. Implement the Behaviors (menus, dialogs, tabs, forms with validation and mocked submit) and the mobile layout.
6. Run it. Start the dev server, then call \`compare_site\` with {"analysis_id": <id>, "base_url": "http://localhost:<port>"}. Read the attached reference/build/diff images and the notes.
7. Iterate. Fix the worst areas first (missing regions, wrong layout mode, heights, colors, font), then compare again. Repeat until the overall match is at least ${Math.round(TARGET_SCORE * 100)}% or 6 rounds pass without improvement.
8. Finish. Run the production build and the linter and fix every error. Then report: final scores per page and viewport, what still differs and why (e.g. their photos and video are not reused), and how to run the project.`;
}
