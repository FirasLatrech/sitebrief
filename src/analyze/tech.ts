import type { Page } from "playwright";
import type { SkippedAsset } from "../browser.js";

/** Runs before page scripts: counts RTCPeerConnection / WebTransport creation without changing behavior. */
export const TECH_INIT_SCRIPT = `(() => {
  const w = window; w.__sb = { rtc: 0, webtransport: 0 };
  for (const [name, key] of [["RTCPeerConnection", "rtc"], ["webkitRTCPeerConnection", "rtc"], ["WebTransport", "webtransport"]]) {
    const Orig = w[name]; if (typeof Orig !== "function") continue;
    w[name] = new Proxy(Orig, { construct(t, a, n) { w.__sb[key]++; return Reflect.construct(t, a, n); } });
  }
})();`;

const KNOWN_HOSTS: [RegExp, string][] = [
  [/google-analytics|googletagmanager|gtag/, "analytics (Google)"],
  [/segment\.(com|io)|cdn\.segment/, "analytics (Segment)"],
  [/plausible|posthog|mixpanel|amplitude|heap(analytics)?|hotjar|clarity\.ms/, "analytics / product analytics"],
  [/sentry|datadog|newrelic|bugsnag/, "error monitoring"],
  [/intercom|crisp\.chat|drift|zendesk|zdassets|tawk|livechat|hubspot/, "chat / support widget"],
  [/youtube|ytimg|vimeo|wistia|jwplayer|jwpcdn|mux\.com|brightcove|videojs/, "video player / SDK"],
  [/livekit|agora|twilio|daily\.co|vonage|opentok|100ms|jitsi/, "real-time video SDK"],
  [/stripe|paypal|braintree|adyen|checkout\.com|squareup/, "payments"],
  [/recaptcha|hcaptcha|challenges\.cloudflare/, "bot protection"],
  [/fonts\.googleapis|typekit|use\.typekit/, "web fonts service"],
];

export interface TechCollector {
  apis: Set<string>;
  graphql: Set<string>;
  websockets: Set<string>;
  media: Set<string>;
  scriptHosts: Set<string>;
}

export function newCollector(): TechCollector {
  return {
    apis: new Set(),
    graphql: new Set(),
    websockets: new Set(),
    media: new Set(),
    scriptHosts: new Set(),
  };
}

/** Normalizes ids out of a path: /api/users/123 -> /api/users/:id */
const normPath = (p: string) => p.replace(/\/(\d+|[0-9a-f]{8,}|[0-9a-f-]{36})(?=\/|$)/gi, "/:id").slice(0, 120);

/** Passively records the page's own traffic. Call before navigating. */
export function observeNetwork(page: Page, c: TechCollector): void {
  page.on("request", (req) => {
    let u: URL;
    try {
      u = new URL(req.url());
    } catch {
      return;
    }
    const type = req.resourceType();
    if (/\.(m3u8|mpd)(\?|$)/i.test(u.pathname))
      c.media.add(`${u.pathname.endsWith(".mpd") ? "DASH" : "HLS"} from ${u.host}`);
    if (type === "script" && u.origin !== new URL(page.url() || u.origin).origin) c.scriptHosts.add(u.host);
    if (type === "xhr" || type === "fetch") {
      const isGql = /graphql/i.test(u.pathname) || /"query"\s*:/.test(req.postData() ?? "");
      (isGql ? c.graphql : c.apis).add(`${req.method()} ${u.host}${normPath(u.pathname)}`);
    }
  });
  page.on("websocket", (ws) => {
    try {
      const u = new URL(ws.url());
      c.websockets.add(`${u.protocol}//${u.host}${normPath(u.pathname)}`);
    } catch {}
  });
}

export interface TechReport {
  frameworks: string[];
  script_services: { host: string; guess: string }[];
  rest_endpoints: string[];
  graphql_endpoints: string[];
  websockets: string[];
  media: string[];
  webrtc: boolean;
  webtransport: boolean;
  skipped_assets: {
    images: number;
    fonts: number;
    media: number;
    examples: string[];
  };
  note: string;
}

export async function readTech(page: Page, c: TechCollector, skipped: SkippedAsset[]): Promise<TechReport> {
  const hints = await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown> & {
      __sb?: { rtc: number; webtransport: number };
    };
    const has = (sel: string) => document.querySelector(sel) !== null;
    const f: string[] = [];
    if (has("#__NEXT_DATA__") || w.next || has('script[src*="/_next/"]')) f.push("Next.js (observed)");
    if (has("#__nuxt") || w.__NUXT__) f.push("Nuxt (observed)");
    if (has("[data-reactroot]") || has("#root") || w.__REACT_DEVTOOLS_GLOBAL_HOOK__) f.push("React (guess)");
    if (has("[ng-version]")) f.push("Angular (observed)");
    if ([...document.querySelectorAll("*")].some((e) => [...e.attributes].some((a) => a.name.startsWith("data-v-"))))
      f.push("Vue (observed: data-v-* attributes)");
    if (document.querySelector('[class*="svelte-"]')) f.push("Svelte (observed: svelte-* classes)");
    if (has("astro-island")) f.push("Astro (observed)");
    return {
      frameworks: f,
      rtc: (w.__sb?.rtc ?? 0) > 0,
      wt: (w.__sb?.webtransport ?? 0) > 0,
    };
  });
  const media = [...c.media];
  for (const s of skipped)
    if (s.type === "media" && /\.(mp4|webm|mov)(\?|$)/i.test(s.url))
      media.push(`progressive video file (${new URL(s.url).host})`);
  const count = (t: string) => skipped.filter((s) => s.type === t).length;
  return {
    frameworks: hints.frameworks,
    script_services: [...c.scriptHosts].map((host) => ({
      host,
      guess: KNOWN_HOSTS.find(([re]) => re.test(host))?.[1] ?? "unknown third-party script",
    })),
    rest_endpoints: [...c.apis].slice(0, 30),
    graphql_endpoints: [...c.graphql].slice(0, 10),
    websockets: [...c.websockets].slice(0, 10),
    media: [...new Set(media)].slice(0, 10),
    webrtc: hints.rtc,
    webtransport: hints.wt,
    skipped_assets: {
      images: count("image"),
      fonts: count("font"),
      media: count("media"),
      examples: skipped.slice(0, 10).map((s) => `${s.type}: ${s.url}`),
    },
    note: "Framework entries say (observed) or (guess); service labels are guesses from the host name.",
  };
}
