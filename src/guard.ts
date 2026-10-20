import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const allowLocal = () => process.env.SITEBRIEF_ALLOW_LOCAL === "1";

function isPrivateV4(ip: string): boolean {
  const [a, b, c] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

/** Expands any IPv6 text form (::, embedded dotted IPv4, zone ids) to 8 groups, or null if invalid. */
function expandV6(ip: string): number[] | null {
  let v = ip.toLowerCase().split("%")[0];
  const dotted = v.match(/^(.*:)(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (dotted) {
    const [a, b, c, d] = dotted.slice(2).map(Number);
    v = `${dotted[1]}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = v.split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const fill = v.includes("::") ? 8 - h.length - t.length : 0;
  if (fill < 0) return null;
  const groups = [...h, ...new Array(fill).fill("0"), ...t].map((g) => Number.parseInt(g, 16));
  return groups.length === 8 && groups.every((n) => n >= 0 && n <= 0xffff) ? groups : null;
}

function isPrivateV6(ip: string): boolean {
  const g = expandV6(ip);
  if (!g) return true; // Unparseable: refuse.
  const v4 = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  const zeros = (from: number, to: number) => g.slice(from, to).every((n) => n === 0);
  if (zeros(0, 6)) return g[6] === 0 || isPrivateV4(v4(g[6], g[7])); // ::, ::1, IPv4-compatible
  if (zeros(0, 5) && g[5] === 0xffff) return isPrivateV4(v4(g[6], g[7])); // IPv4-mapped (dotted or hex)
  if (g[0] === 0x64 && g[1] === 0xff9b && zeros(2, 6)) return isPrivateV4(v4(g[6], g[7])); // NAT64
  if (g[0] === 0x2002) return isPrivateV4(v4(g[1], g[2])); // 6to4
  return (g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xff00) === 0xff00;
}

/** Resolves a host name and reports whether any address is private. */
export async function resolvesPrivate(host: string): Promise<boolean> {
  try {
    const addrs = await lookup(host, { all: true });
    return addrs.some((a) => isPrivateAddress(a.address));
  } catch {
    return false; // Unresolvable names fail in the browser anyway.
  }
}

export function isPrivateAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isPrivateV4(ip);
  if (family === 6) return isPrivateV6(ip);
  return false;
}

/** Fast check without DNS: localhost names and private IP literals. */
export function isLocalHostname(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return h === "localhost" || h.endsWith(".localhost") || isPrivateAddress(h);
}

/** Throws unless the URL is public http(s). Resolves DNS so names pointing at private IPs are refused too. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid URL: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Only http(s) URLs are allowed, got ${url.protocol}`);
  }
  if (url.username || url.password) throw new Error("URLs with credentials are not allowed");
  if (allowLocal()) return url;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isLocalHostname(host)) {
    throw new Error(`Refusing local/private address ${host} (set SITEBRIEF_ALLOW_LOCAL=1 for tests)`);
  }
  if (!isIP(host)) {
    const addrs = await lookup(host, { all: true }).catch(() => {
      throw new Error(`Cannot resolve ${host}`);
    });
    if (addrs.some((a) => isPrivateAddress(a.address))) {
      throw new Error(`Refusing ${host}: it resolves to a private address`);
    }
  }
  return url;
}
