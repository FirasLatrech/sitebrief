import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { type CompareInput, compareSite } from "../compare/index.js";
import { cropBase64 } from "../compare/pixels.js";

const pct = (n: number) => `${Math.round(n * 100)}%`;
export const TARGET_SCORE = 0.9;

/** Runs compare_site and turns it into an actionable report with the worst area as images. */
export async function compareReport(input: CompareInput, onProgress?: (step: string) => void): Promise<CallToolResult> {
  const scores = await compareSite(input, onProgress);
  if (!scores.length) throw new Error("Nothing to compare: no matching non-sensitive pages/viewports in the analysis");
  const overall = scores.reduce((s, v) => s + v.score, 0) / scores.length;
  const lines = [
    `Overall match: ${pct(overall)} (target ${pct(TARGET_SCORE)}). ${overall >= TARGET_SCORE ? "Target reached." : "Keep iterating on the worst areas below."}`,
    "",
  ];
  for (const v of scores) {
    lines.push(
      `## ${v.page} (${v.viewport}): ${pct(v.score)}  [pixels ${pct(v.pixels)}, structure ${pct(v.structure)}, tokens ${pct(v.tokens)}, images ${pct(v.images)}]`,
      `- Page height: yours ${v.height.candidate}px, reference ${v.height.reference}px`,
      ...v.worst.map(
        (b) =>
          `- y ${b.y0}-${b.y1}: ${pct(b.mismatch)} different${b.sections.length ? ` (reference ${b.sections.join(", ")})` : ""}`,
      ),
      ...v.missing_regions.map((r) => `- Missing or different region: ${r}`),
      ...v.token_notes.map((n) => `- ${n}`),
      ...v.image_notes.map((n) => `- ${n}`),
      `- Diff image: ${v.diff_file}`,
      "",
    );
  }
  const worstView = [...scores].sort((a, b) => a.score - b.score)[0];
  const band = worstView.worst[0];
  const images: CallToolResult["content"] = [];
  if (band) {
    lines.push(
      `Attached: reference, your build and the diff (red = different) for ${worstView.page} ${worstView.viewport}, y ${band.y0}-${band.y1}.`,
    );
    for (const file of [worstView.reference_file, worstView.candidate_file, worstView.diff_file]) {
      const y1 = Math.min(band.y1, Math.min(worstView.height.reference, worstView.height.candidate));
      images.push({ type: "image", mimeType: "image/png", data: await cropBase64(file, band.y0, y1, worstView.width) });
    }
  }
  return { content: [{ type: "text", text: lines.join("\n") }, ...images] };
}
