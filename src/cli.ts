import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

export const VERSION: string = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

const HELP = `sitebrief ${VERSION}: MCP server that turns a website into a build brief.

Usage:
  sitebrief            start the MCP server on stdio (what MCP clients run)
  sitebrief setup      download the headless Chromium it needs (run once)
  sitebrief --version
  sitebrief --help

Environment:
  SITEBRIEF_HOME       where analyses are stored (default ~/.sitebrief)
  SITEBRIEF_KEEP_DAYS  delete analyses older than this many days at startup (default 30, 0 = keep all)
`;

/** Handles non-server commands. Returns true when it handled one (the caller should not start the server). */
export function runCli(args: string[]): boolean {
  const cmd = args[0];
  if (cmd === "--version" || cmd === "-v") {
    process.stdout.write(`${VERSION}\n`);
    return true;
  }
  if (cmd === "--help" || cmd === "-h") {
    process.stdout.write(HELP);
    return true;
  }
  if (cmd === "setup") {
    // Playwright's own installer, from the playwright version sitebrief depends on.
    const cli = join(dirname(createRequire(import.meta.url).resolve("playwright/package.json")), "cli.js");
    const res = spawnSync(process.execPath, [cli, "install", "chromium"], { stdio: "inherit" });
    process.exitCode = res.status ?? 1;
    return true;
  }
  if (cmd) {
    process.stderr.write(`Unknown command "${cmd}".\n\n${HELP}`);
    process.exitCode = 2;
    return true;
  }
  return false;
}
