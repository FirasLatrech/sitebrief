import { readFile, writeFile } from "node:fs/promises";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

export const BAND = 900;

export interface Band {
  y0: number;
  y1: number;
  /** Share of pixels that differ, 0..1. */
  mismatch: number;
}

export interface PixelResult {
  similarity: number;
  width: number;
  height: { reference: number; candidate: number };
  bands: Band[];
  diff_file: string;
}

/** Pixel diff over the shared height, band by band (rows are contiguous, so bands are plain subarrays). */
export async function comparePixels(
  referencePng: string,
  candidatePng: Buffer,
  diffFile: string,
): Promise<PixelResult> {
  // Pages that overflow horizontally produce wider screenshots; compare the shared width.
  const refFull = PNG.sync.read(await readFile(referencePng));
  const candFull = PNG.sync.read(candidatePng);
  const w = Math.min(refFull.width, candFull.width);
  const ref = toWidth(refFull, w);
  const cand = toWidth(candFull, w);
  const h = Math.min(ref.height, cand.height);
  const diff = new PNG({ width: w, height: h });
  const bands: Band[] = [];
  let total = 0;
  for (let y0 = 0; y0 < h; y0 += BAND) {
    const y1 = Math.min(h, y0 + BAND);
    const [a, b] = [y0 * w * 4, y1 * w * 4];
    const n = pixelmatch(ref.data.subarray(a, b), cand.data.subarray(a, b), diff.data.subarray(a, b), w, y1 - y0, {
      threshold: 0.15,
    });
    total += n;
    bands.push({ y0, y1, mismatch: n / (w * (y1 - y0)) });
  }
  await writeFile(diffFile, PNG.sync.write(diff));
  // Height difference counts as mismatch: a page twice as long is not "similar" just because its top matches.
  const heightPenalty = h / Math.max(ref.height, cand.height);
  return {
    similarity: (1 - total / (w * h)) * heightPenalty,
    width: w,
    height: { reference: ref.height, candidate: cand.height },
    bands,
    diff_file: diffFile,
  };
}

function toWidth(img: PNG, w: number): PNG {
  if (img.width === w) return img;
  const out = new PNG({ width: w, height: img.height });
  for (let y = 0; y < img.height; y++) img.data.copy(out.data, y * w * 4, y * img.width * 4, (y * img.width + w) * 4);
  return out;
}

/** Crops rows [y0, y1) of a PNG file (left `width` px) and returns it as base64 PNG. */
export async function cropBase64(file: string, y0: number, y1: number, width?: number): Promise<string> {
  const full = PNG.sync.read(await readFile(file));
  const src = toWidth(full, Math.min(width ?? full.width, full.width));
  const out = new PNG({ width: src.width, height: y1 - y0 });
  src.data.copy(out.data, 0, y0 * src.width * 4, y1 * src.width * 4);
  return PNG.sync.write(out).toString("base64");
}
