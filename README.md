# sitebrief

A local MCP server that studies a public web page in a real (headless) browser and gives a coding agent everything it needs to rebuild the site's **structure, layout and look** as a new product: a build prompt, per-section reference images, and a visual comparison loop that scores the new build against the original until it matches.

It never copies the site itself: no HTML/CSS/JS, logos, brand names, copy, photos, illustrations or custom icons.

## One command: `clone_site`

sitebrief ships an MCP prompt that runs the whole job autonomously in your agent:

1. `analyze_site` → 2. `build_prompt` → 3. scaffold (Next.js + Tailwind by default) → 4. `get_sections` to look at each section → 5. build section by section → 6. `compare_site` → 7. fix the worst areas and compare again until the match is ≥ 90% → 8. production build + lint, final report.

In Claude Code, MCP prompts are slash commands:

```text
/mcp__sitebrief__clone_site https://example.com MyProduct
```

Arguments: `url`, `product_name`, optional `stack`, `out_dir`, `pages` (comma-separated, e.g. `/,/pricing`) and `fidelity` (`close` by default in this workflow, or `original`).

## Tools

| Tool | What it does |
| --- | --- |
| `analyze_site` | Layout outline, stacked sections (with JPEG crops), image slots (hero media, logo strips, avatars, card and content images, backgrounds: role, size, aspect and section; files are never downloaded), repeated components with hover/focus diffs, design tokens per site and per page, icon library, safe click-through of menus and dialogs, passive tech hints, sensitive-page detection, full-page screenshots. Sends progress notifications. |
| `build_prompt` | Markdown build prompt. `fidelity: "original"` (default) generates a new palette and font in the same color family; `"close"` reuses the site's colors, spacing, type scale, its font **only if open-licensed**, and its icon library **only if it is an open one**. Saves `brief.md` and `design.json`. |
| `get_sections` | Returns the reference sections as images (a few per call) with an index, so the agent can see what to build. Sensitive pages are excluded. |
| `compare_site` | Screenshots your running build (localhost allowed) at the analyzed pages/viewports and scores it: pixel diff with [pixelmatch](https://github.com/mapbox/pixelmatch), landmark/layout structure, and tokens against the brief's design (per page in close mode). Returns the worst areas mapped to reference sections, plus reference / build / diff images of the worst one. |

## Install

Requires Node.js 22 or newer.

```bash
npx -y sitebrief setup        # one time: downloads the headless Chromium it uses (~100 MB)
```

From source instead:

```bash
git clone <repo> sitebrief && cd sitebrief
pnpm install                  # also builds dist/
node dist/server.js setup
```

## Register it

Claude Code:

```bash
claude mcp add sitebrief -s user -- npx -y sitebrief
```

Cursor (`~/.cursor/mcp.json`):

```json
{ "mcpServers": { "sitebrief": { "command": "npx", "args": ["-y", "sitebrief"] } } }
```

Codex (`~/.codex/config.toml`):

```toml
[mcp_servers.sitebrief]
command = "npx"
args = ["-y", "sitebrief"]
```

From a source checkout, use `node /abs/path/to/sitebrief/dist/server.js` as the command instead.

## CLI

```text
sitebrief            start the MCP server on stdio (what MCP clients run)
sitebrief setup      download the headless Chromium it needs (run once)
sitebrief --version
sitebrief --help
```

## Example calls

```json
{ "tool": "analyze_site", "arguments": { "url": "https://example.com", "pages": ["/", "/pricing"], "viewports": ["desktop", "mobile"] } }
```

Returns `{ analysis_id, pages, tokens, components, interactions, tech, sensitive_pages, screenshots, limitations }`. The JSON and the screenshots are stored in `~/.sitebrief/<analysis_id>/`.

```json
{
  "tool": "build_prompt",
  "arguments": {
    "analysis_id": "20261020072704-c6ec4ed9",
    "product_name": "Orbitly",
    "stack": "React + Vite + Tailwind",
    "brand": { "primary": "#4F46E5", "font": "Inter" },
    "notes": "We are building a webinar tool, keep the stage + chat layout"
  }
}
```

Add `"fidelity": "close"` to reuse the site's own token values. Returns the Markdown prompt (also saved as `~/.sitebrief/<analysis_id>/brief.md`). Sections: Product summary, Pages and layout, Components, Design system, Images and media, Behaviors, Technical notes, Build plan, Originality rules. See [examples/fixture-brief.md](examples/fixture-brief.md) for a full output generated from the test fixtures.

## Originality rules

Every generated prompt ends with these rules:

- Write all code from scratch. Do not fetch, copy or adapt the analyzed site's HTML, CSS, JS, images, icons, logos, illustrations, fonts, or text.
- Use the new product name and brand everywhere. The result must not be mistakable for the analyzed site.
- Use placeholder or newly written copy; use an open icon set (e.g. Lucide) and open fonts.

In close fidelity the brief adds one note: the Design system reuses the analyzed site's color values, spacing and type scale, and its font only when open-licensed; everything else in the rules still applies.

Login and checkout pages appear only as: "Design your own authentication / checkout flow using a provider of your choice; do not imitate the analyzed site's screens."

## Hard limits

- Public http(s) URLs only; localhost and private IPs are refused, including host names that resolve to private IPs. `SITEBRIEF_ALLOW_LOCAL=1` lifts this (tests only).
- Same-origin pages only, max 5 pages, max 2 minutes per analysis, 1 navigation per second.
- Fresh context per page and viewport: no cookies, no login, no CAPTCHA solving, no stealth plugins. Pages that block bots or redirect to a login are reported in `limitations` and the analysis stops.
- Forms are never submitted (non-GET navigations are blocked, submit buttons are never clicked). Triggers that look like buy, pay, delete, send or sign out are never clicked. Sensitive pages get no click-through.
- Images, fonts and media are not downloaded; their URLs and types are recorded only.
- `compare_site` may open localhost (it is meant for your own dev server); `analyze_site` may not.

```json
{ "tool": "get_sections", "arguments": { "analysis_id": "…", "page": "/", "viewport": "desktop", "start": 0, "limit": 4 } }
```

```json
{ "tool": "compare_site", "arguments": { "analysis_id": "…", "base_url": "http://localhost:3000" } }
```

## What is never copied, in any mode

Logos, brand names, copy, photos, video, illustrations, custom SVG icons and proprietary fonts. Those identify the other company; reusing them makes a counterfeit, not a rebuild. Close fidelity reuses only values that are not anyone's identity: colors, spacing, sizes, open-licensed fonts and open icon libraries.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `SITEBRIEF_HOME` | `~/.sitebrief` | Where analyses, screenshots and briefs are stored |
| `SITEBRIEF_KEEP_DAYS` | `30` | Analyses older than this are deleted at startup; `0` keeps everything |
| `SITEBRIEF_ALLOW_LOCAL` | unset | `1` lets `analyze_site` open localhost/private addresses (tests only) |

## Operations

- **One browser job at a time.** Parallel `analyze_site` / `compare_site` calls queue instead of competing for memory.
- **Progress notifications.** Long calls report progress, so clients that reset their timeout on progress (Claude Code does) don't time out.
- **Disk.** Each analysis is a few MB (screenshots and section crops); old ones are pruned per `SITEBRIEF_KEEP_DAYS`.
- **Logging.** Nothing is written to stdout except MCP messages.

## Security notes

- URL guard: http(s) only, no credentials in URLs, private/loopback/link-local/CGNAT/benchmark ranges refused, including IPv4-mapped, IPv4-compatible, NAT64 and 6to4 IPv6 forms. Host names are resolved before the run and again (cached) for every request inside the browser, so redirects and sub-resources to private addresses are blocked.
- Residual risk: Chromium resolves DNS itself, so a rebinding server that flips between sitebrief's lookup and Chromium's within milliseconds could still reach a private address. Run sitebrief where that matters less (your own machine, not a shared server), or behind an egress firewall.
- The browser runs headless with a fresh profile per page, no cookies, no service workers and no downloads.

## Troubleshooting

- **"Chromium is not installed for sitebrief"**: run `npx -y sitebrief setup`.
- **A tool call times out**: your client may have a short timeout; analyses take 30-90 s for 2 pages × 2 viewports. Analyze fewer pages or one viewport.
- **"bot challenge page detected" / "redirected to a login page"**: the site blocks automated visitors or needs a login; sitebrief stops by design.

## Develop

```bash
pnpm build && pnpm test && pnpm check   # check = biome + type-check of src and tests
```

Tests serve `test/fixtures/` on a random local port and never touch the public internet.
