import { readFile } from "node:fs/promises";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Analysis } from "../analyze/index.js";
import { loadAnalysis } from "../store.js";

export interface GetSectionsInput {
  analysis_id: string;
  page?: string;
  viewport?: "desktop" | "mobile";
  start?: number;
  limit?: number;
}

/** Returns reference section crops as images plus a text index, a few at a time. Sensitive pages are excluded. */
export async function getSections(input: GetSectionsInput): Promise<CallToolResult> {
  const a = await loadAnalysis<Analysis>(input.analysis_id);
  const viewport = input.viewport ?? "desktop";
  const pages = a.pages.filter((p) => !p.sensitive && (!input.page || p.path === input.page));
  if (!pages.length) throw new Error(`No non-sensitive page${input.page ? ` "${input.page}"` : ""} in this analysis`);
  const all = pages.flatMap((p) =>
    (p.views.find((v) => v.viewport === viewport)?.sections ?? []).map((s) => ({ page: p.path, ...s })),
  );
  const start = input.start ?? 0;
  const slice = all.slice(start, start + Math.min(input.limit ?? 4, 6));
  const index = all
    .map(
      (s, i) =>
        `${i === start ? "→ " : "  "}#${i} ${s.page} ${s.name} at y=${s.box.y}, ${s.box.w}×${s.box.h}px${slice.includes(s) ? " (attached)" : ""}`,
    )
    .join("\n");
  const next = start + slice.length < all.length ? `\nCall again with start=${start + slice.length} for more.` : "";
  const images = await Promise.all(
    slice.map(async (s) => ({
      type: "image" as const,
      mimeType: "image/jpeg",
      data: (await readFile(s.file)).toString("base64"),
    })),
  );
  return {
    content: [
      {
        type: "text",
        text: `Reference sections (${viewport}). Use them for layout, spacing and visual weight only; write your own copy and never reuse their images, logos or icons.\n${index}${next}`,
      },
      ...images,
    ],
  };
}
