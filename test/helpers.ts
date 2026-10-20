import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize } from "node:path";

export const FIXTURES = join(import.meta.dirname, "fixtures");
const TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
};

/** Serves test/fixtures on a random local port; /api/* answers with JSON. */
export async function serveFixtures(): Promise<{
  url: string;
  close: () => Promise<void>;
}> {
  const server: Server = createServer(async (req, res) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    if (path.startsWith("/api/")) {
      res.writeHead(200, { "content-type": "application/json" }).end("{}");
      return;
    }
    try {
      const body = await readFile(join(FIXTURES, normalize(path).replace(/^(\.\.[/\\])+/, "")));
      res
        .writeHead(200, {
          "content-type": TYPES[extname(path)] ?? "text/plain",
        })
        .end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((r) => server.close(() => r())),
  };
}
