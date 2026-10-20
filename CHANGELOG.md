# Changelog

## 1.0.0 (2026-10-20)

First public release.

- Tools: `analyze_site`, `build_prompt` (original and close fidelity), `get_sections`, `compare_site`.
- Prompt: `clone_site`, an end-to-end workflow that analyzes, briefs, scaffolds, builds and iterates until the build matches.
- Analysis: layout outline, stacked sections with crops, components with hover/focus states, per-page design tokens (rgb, oklab, oklch and sRGB `color()`), icon library, image slots, safe click-through, tech hints, sensitive-page detection.
- Compare: pixelmatch diff by band, landmark structure, tokens and image-slot coverage, with reference / build / diff images of the worst area.
- Safety: public URLs only; private, IPv4-mapped, NAT64 and 6to4 addresses refused; names that resolve to private addresses blocked in the browser; no downloads of images, fonts or media; no form submission; no clicks on purchase, delete, send or sign-out controls.
- Operations: `sitebrief setup` installs Chromium; one browser job at a time; progress notifications; analyses older than `SITEBRIEF_KEEP_DAYS` (default 30) pruned at startup.
