import type { Analysis } from "../analyze/index.js";
import { behaviorsSection, buildPlan, techSection } from "./behavior.js";
import { closeDesign, type Fidelity } from "./fidelity.js";
import { imagesSection } from "./images.js";
import { type Brand, type DesignSystem, generateDesign, ORIGINALITY_RULES } from "./originality.js";
import { pagesSection, productSummary } from "./structure.js";
import { componentsSection, designSection } from "./system.js";

export interface BuildPromptInput {
  analysis_id: string;
  product_name: string;
  stack?: string;
  brand?: Brand;
  notes?: string;
  fidelity?: Fidelity;
}

export const CLOSE_NOTE = `Fidelity: close. At the team's request, the Design system above reuses the analyzed site's color values, spacing and type scale, and its font only when that font is open-licensed. Everything else in the rules still applies: no logos, brand names, copy, photos, illustrations or custom icons from the analyzed site.`;

/** The token set a brief uses; build_prompt saves it so compare_site can check the build against it. */
export const pickDesign = (a: Analysis, input: BuildPromptInput): DesignSystem =>
  input.fidelity === "close"
    ? closeDesign(a.analysis_id, a.tokens, input.brand)
    : generateDesign(a.analysis_id, a.tokens, input.brand);

export const DEFAULT_STACK = "React + Vite + plain CSS";

/** Turns an analysis into the Markdown build prompt for the next agent. */
export function renderPrompt(analysis: Analysis, input: BuildPromptInput): string {
  const stack = input.stack?.trim() || DEFAULT_STACK;
  const product = input.product_name.trim();
  // Sensitive pages contribute nothing but the fixed sentence in "Pages and layout".
  const hidden = new Set(analysis.sensitive_pages);
  const a: Analysis = {
    ...analysis,
    components: analysis.components.filter((c) => !hidden.has(c.page)),
    interactions: analysis.interactions.filter((i) => !hidden.has(i.page)),
  };
  const fidelity = input.fidelity ?? "original";
  const design = pickDesign(analysis, input);
  const shots = analysis.pages.filter((p) => !p.sensitive).flatMap((p) => p.views.map((v) => v.screenshot));
  return [
    `# Build prompt: ${product}`,
    "",
    `You are building **${product}** with **${stack}**. This brief describes structure and behavior learned from an existing website. ` +
      "Build an original product with its own code, brand, copy and assets. Read the originality rules at the end before you start.",
    ...(shots.length
      ? [
          "",
          "Reference screenshots (to look at for layout only; never ship, trace or crop them):",
          ...shots.map((s) => `- ${s}`),
          "",
          `Per-section reference images: call the \`get_sections\` tool with analysis_id \`${analysis.analysis_id}\`. Check your build with \`compare_site\`.`,
        ]
      : []),
    "",
    productSummary(a, product, input.notes),
    "",
    pagesSection(a),
    "",
    componentsSection(a),
    "",
    designSection(a, design, fidelity),
    "",
    imagesSection(a),
    "",
    behaviorsSection(a),
    "",
    techSection(a, stack),
    "",
    buildPlan(a, stack, product),
    "",
    ORIGINALITY_RULES,
    ...(fidelity === "close" ? ["", CLOSE_NOTE] : []),
    "",
  ]
    .join("\n")
    .replaceAll(new URL(analysis.url).hostname.replace(/^www\./, ""), "the analyzed site's domain");
}
