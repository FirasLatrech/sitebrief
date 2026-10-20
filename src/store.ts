import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const ID_RE = /^[a-z0-9-]{8,64}$/;

export const storeRoot = () => process.env.SITEBRIEF_HOME ?? join(homedir(), ".sitebrief");

export function newAnalysisId(): string {
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  return `${stamp}-${randomBytes(4).toString("hex")}`;
}

export function analysisDir(id: string): string {
  if (!ID_RE.test(id)) throw new Error(`Invalid analysis_id: ${id}`);
  return join(storeRoot(), id);
}

export async function ensureDir(id: string): Promise<string> {
  const dir = analysisDir(id);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function saveFile(id: string, name: string, data: string): Promise<string> {
  const path = join(await ensureDir(id), name);
  await writeFile(path, data);
  return path;
}

export async function loadAnalysis<T>(id: string): Promise<T> {
  const raw = await readFile(join(analysisDir(id), "analysis.json"), "utf8").catch(() => {
    throw new Error(`No analysis found for ${id}; run analyze_site first`);
  });
  return JSON.parse(raw) as T;
}

/** Deletes analyses older than SITEBRIEF_KEEP_DAYS (default 30; 0 keeps everything). */
export async function pruneOld(days = Number(process.env.SITEBRIEF_KEEP_DAYS ?? 30)): Promise<number> {
  if (!(days > 0)) return 0;
  const root = storeRoot();
  const cutoff = Date.now() - days * 86_400_000;
  let removed = 0;
  for (const name of await readdir(root).catch(() => [] as string[])) {
    if (!ID_RE.test(name)) continue;
    const dir = join(root, name);
    if ((await stat(dir)).mtimeMs < cutoff) {
      await rm(dir, { recursive: true, force: true });
      removed++;
    }
  }
  return removed;
}
