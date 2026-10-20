# sitebrief audit (2026-10-20)

Baseline: `pnpm check` clean, `pnpm build` clean, `pnpm test` 30/30 passing in 22 s, `pnpm audit` reports no known vulnerabilities. Everything below was found by reading all of `src/` and `test/` and verifying the suspicious spots with small probes.

## High

### 1. SSRF guard bypass through IPv4-mapped IPv6 literals
- Where: `src/guard.ts:20-24` (`isPrivateV6`), used by `assertPublicUrl` and by the request router in `src/browser.ts:59`.
- What: the WHATWG URL parser serializes `http://[::ffff:127.0.0.1]/` as `[::ffff:7f00:1]`. `isPrivateV6` only handles the dotted `::ffff:1.2.3.4` form, so the hex form is treated as public. NAT64 (`64:ff9b::7f00:1`) is not handled either.
- Proof: from the same browser context `analyze_site` uses, `page.goto("http://[::ffff:127.0.0.1]:PORT/")` returned 200 with the body of a loopback server, while `http://127.0.0.1:PORT/` was correctly blocked (`ERR_BLOCKED_BY_CLIENT`). Also reachable this way: `169.254.169.254` as `[::ffff:a9fe:a9fe]`.
- Fix: in `isPrivateV6`, when the address starts with `::ffff:` and the rest has no dot, convert the two hex groups to dotted IPv4 before calling `isPrivateV4`; treat `64:ff9b::/96` the same way. Add these URLs to `test/guard.test.ts`. Note that the dotted shorthand forms (`127.1`, `0x7f.1`, `2130706433`) are already refused.

## Medium

### 2. DNS rebinding and redirect gap
- Where: `src/guard.ts:56-62` resolves DNS once; `src/browser.ts:52-66` only checks host names, never resolved IPs.
- What: Chromium resolves the name again at navigation time, so a name that rebinds to a private IP, or a redirect / sub-resource to a public name that resolves privately, is fetched. `detectBlock` only notices a cross-origin redirect after the request has already been made.
- Fix: make the route handler async, resolve non-literal host names with a per-run cached `dns.lookup`, and abort when any address is private.

### 3. Progress notifications can crash the process
- Where: `src/tools/index.ts:22` (`void extra.sendNotification(...)`).
- What: the SDK's `notification()` throws `Not connected` (`protocol.js:819`) once the client disconnects. During a 2-minute analysis that becomes an unhandled rejection, which exits Node 22 by default.
- Fix: `.catch(() => {})` on the notification promise.

### 4. `color(display-p3 …)` produces `#NaN…` tokens
- Where: `src/analyze/color.ts:37-38`.
- What: the regex makes the `srgb` prefix optional, so `color(display-p3 0.5 0.2 0.1)` parses `display-p3` as the red channel. Verified: result `#NaN8033`. Chromium reports computed colors authored in P3 or rec2020 this way, so the value leaks into `tokens.colors.*`, the brief's CSS variables and `compare_site` scoring.
- Fix: capture the color space and return `null` unless it is `srgb`, or return `null` when any channel is `NaN`.

### 5. Spacing base grid can never be 8
- Where: `src/analyze/tokens.ts:92`.
- What: `[4, 8, 5, 6].find(...)` tests 4 first, and every multiple of 8 is a multiple of 4, so a pure 8 px grid reports `base_guess: 4` (verified). `generateDesign` (`src/prompt/originality.ts:120`) therefore always emits a 4 px unit.
- Fix: test the larger grid first: `[8, 4, 6, 5]`.

## Low

6. **Hash anchors look like navigation.** `src/analyze/interactions.ts:117` compares the full URL, so an `<a href="#menu" aria-expanded>` toggle changes the hash, is recorded as "navigated" and triggers a reload. Compare without the hash.
7. **`safe()` assumes an `Error`.** `src/tools/index.ts:36` yields `text: undefined` for non-Error throws. Use `err instanceof Error ? err.message : String(err)`.
8. **Import-time crash when `argv[1]` is missing.** `src/server.ts:14` calls `realpathSync(process.argv[1])` unguarded; a missing path throws ENOENT before anything runs. Wrap in try or compare resolved paths.
9. **Unbounded loop in font selection.** `src/prompt/originality.ts:113` loops while the candidate font is observed; if all eight `OPEN_FONTS` appear in the site's stacks it never ends. Bound the loop by `OPEN_FONTS.length`.
10. **Icon library false positives.** `src/analyze/icons.ts:16,19,21` use `[class*='ti-']`, `[class*='bi-']`, `[class*='ph-']`, which match `multi-select`, `combi-`, `graph-`. Close-fidelity briefs then recommend the wrong library. Use the `[class^='x-'], [class*=' x-']` pattern already used for Remix Icon.
11. **`0s` durations leak into tokens.** `src/analyze/tokens-collect.ts:74-76`: `transition-duration: 0s, 0.2s` passes the `!== "0s"` check, then `split(",")[0]` adds `0s`, which becomes `--duration-1: 0ms` in close briefs. Filter after the split.
12. **Dead code.** `src/prompt/fidelity.ts:104` repeats the assignment on line 99.
13. **Duplicated constant.** `src/analyze/interactions.ts:38` hard-codes `5` instead of `MAX_TRIGGERS`.
14. **`DANGER` regex lacks word boundaries.** `src/analyze/interactions.ts:27`: `order` matches `border-*` classes, `send` matches `ascend`, so harmless menus are skipped. Safe direction, but it reduces coverage.
15. **Design computed twice per `build_prompt`.** `src/prompt/render.ts:40` and `src/tools/index.ts:87` both call `pickDesign`. Deterministic, so harmless; return it from `renderPrompt` if you want one call.
16. **Comment drift.** `src/analyze/types.ts:21` says page tokens are desktop, but `src/analyze/index.ts:100` reads them from whichever viewport comes first.

## Project hygiene

17. **Not a git repository.** There is no history, no diff to review, nothing to roll back to, and the README tells users to `git clone`. Run `git init` and commit.
18. **Version mismatch.** `package.json` says 0.1.0, `src/server.ts:9` announces 0.2.0 to MCP clients.
19. **Node engine warning on this machine.** `engines` wants `>=22.19`, the machine runs 22.17.1, so every pnpm command warns. Nothing in the code needs 22.19 (`import.meta.dirname` and top-level await work on 22.17). Either relax the engine to `>=22` or upgrade Node.
20. **Stale launch config.** `.claude/launch.json` starts `/Users/firaslatrach/Desktop/castly` on port 3100. sitebrief has no dev server; delete the file.
21. **Packaging.** No `files` field and no `prepare` script, so an install from git has no `dist/`. Add `"files": ["dist"]` and `"prepare": "tsc -p tsconfig.json"` if it will ever be installed as a package.
22. **Tests are not type-checked.** `tsconfig.json` includes only `src`; vitest only transpiles `test/`. A `tsconfig.test.json` with `noEmit` run in `pnpm check` would catch drift.
23. **Tool annotation.** `compare_site` declares `openWorldHint: false` but accepts any public http(s) `base_url`.

## What is in good shape

- Fresh browser context per page and viewport, service workers blocked, images/fonts/media never downloaded, non-GET document navigations aborted, submit buttons and dangerous triggers never clicked.
- Sensitive pages (password and payment fields, payment iframes) are excluded from sections, compare and the brief.
- The originality test checks the brief against the fixture's real hex colors, font and copy, which is the right kind of test for this tool.
- IPv4 shorthand, octal and decimal forms are all normalized and refused; credentials in URLs are refused.

## Resolution (1.0.0)

| # | Status |
| --- | --- |
| 1 | Fixed: full IPv6 parser; IPv4-mapped (hex and dotted), IPv4-compatible, NAT64 and 6to4 forms refused. Tests added. |
| 2 | Fixed: the browser request filter resolves host names (cached per context) and blocks private results. Residual race documented in the README. |
| 3 | Fixed: notification failures are caught. |
| 4 | Fixed: non-sRGB `color()` returns null; any NaN channel is rejected. Test added. |
| 5 | Fixed: 8 px grid tested first. Test added. |
| 6-14, 16 | Fixed as described. |
| 15 | Left as is: deterministic and cheap. |
| 17 | `git init` done; first commit left to the owner. |
| 18-23 | Fixed: version read from package.json, engines `>=22`, stale launch config removed, `files` + `prepare`, `tsconfig.test.json` in `pnpm check`, `compare_site` marked open-world. |
