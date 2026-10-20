import type { ImageRole, ImageSlot } from "../analyze/images.js";
import type { Analysis } from "../analyze/index.js";

const HOW: Record<ImageRole, string> = {
  "hero media":
    "full-bleed photo or muted looping video behind the hero; object-fit cover, dark overlay for text contrast, a poster image for the video",
  background: "decorative background image; object-fit cover",
  "logo strip":
    "row of customer logos: use your own customers (with their permission) or clearly fictional placeholder marks; never logos of companies that have not agreed",
  "site logo": "your product's own logo",
  avatar: "round portrait: your real users (with consent) or generated people; never people from the analyzed site",
  "card image": "image at the top or background of each card; same aspect ratio across the set",
  media: "illustrative product image or screenshot of your own product next to the text",
  video: "inline product video or demo of your own product",
};

const line = (s: ImageSlot) =>
  `- **${s.role}**${s.count > 1 ? ` ×${s.count}` : ""}: ${s.box.w}×${s.estimated ? "≈" : ""}${s.box.h}px (${s.aspect}${s.rounded ? ", round" : ""}, fit ${s.fit})` +
  `${s.section !== null ? `, reference section #${s.section}` : ""}, at y=${s.box.y}. ${HOW[s.role]}.`;

/** Lists every image slot so the builder fills each one with an image it owns, at the right size. */
export function imagesSection(a: Analysis): string {
  const out = [
    "## Images and media",
    "",
    "Fill every slot below. Never use the analyzed site's image, video or logo files. Use images you own, licensed stock, or newly generated originals that match each slot's role, framing, aspect ratio and mood (see the section reference images). Use the framework's image component with explicit width and height so nothing shifts while loading.",
  ];
  for (const p of a.pages.filter((x) => !x.sensitive)) {
    for (const v of p.views) {
      const slots = v.images ?? [];
      if (!slots.length) continue;
      out.push("", `### \`${p.path}\` (${v.viewport})`, ...slots.map(line));
    }
  }
  if (out.length === 3) out.push("", "No image slots were detected.");
  return out.join("\n");
}
