#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { runCli, VERSION } from "./cli.js";
import { pruneOld } from "./store.js";
import { registerAll } from "./tools/index.js";

export function createServer(): McpServer {
  const server = new McpServer({ name: "sitebrief", version: VERSION });
  registerAll(server);
  return server;
}

const isMain = (() => {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();
if (isMain && !runCli(process.argv.slice(2))) {
  void pruneOld().catch(() => {});
  await createServer().connect(new StdioServerTransport());
}
