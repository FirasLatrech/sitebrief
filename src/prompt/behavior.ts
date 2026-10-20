import type { Analysis } from "../analyze/index.js";

export function behaviorsSection(a: Analysis): string {
  const out = ["## Behaviors"];
  for (const i of a.interactions) {
    const lines: string[] = [];
    for (const c of i.click_through) {
      if (c.opened === "nothing detected" || c.opened.startsWith("click failed")) continue;
      lines.push(
        `- A ${c.trigger} opens ${c.opened}; it closes with ${c.closed_by === "reload" ? "an explicit close control" : c.closed_by}. Trap focus while open and return focus to the trigger on close.`,
      );
    }
    for (const f of i.forms.filter((f, k) => i.forms.findIndex((g) => g.fields.join() === f.fields.join()) === k)) {
      lines.push(
        `- A form with ${f.fields.join(", ") || "no visible fields"}: design inline validation, a pending state on submit, and success and error messages.`,
      );
    }
    if (lines.length) out.push("", `\`${i.page}\` (${i.viewport}):`, ...lines);
  }
  const kinds = new Set(a.components.map((c) => c.kind));
  const data = ["card", "list row", "table row"].filter((k) => kinds.has(k));
  out.push(
    "",
    "States to design for every data view:",
    `- Loading: skeletons shaped like the ${data.join(" / ") || "content blocks"}.`,
    "- Empty: a short explanation and one primary action.",
    "- Error: a message with a retry action; never a blank area.",
    "- Hover and keyboard focus-visible on every interactive element; respect prefers-reduced-motion.",
  );
  return out.join("\n");
}

export function techSection(a: Analysis, stack: string): string {
  const t = a.tech;
  const out = ["## Technical notes", ""];
  if (!t) return [...out, "No technical observations were collected."].join("\n");
  const add = (tag: "observed" | "inferred", text: string) => out.push(`- (${tag}) ${text}`);
  for (const f of t.frameworks)
    add(
      f.includes("guess") ? "inferred" : "observed",
      `Original built with ${f.replace(/ \((observed|guess)\)/, "")}. Irrelevant to you: build with ${stack}.`,
    );
  if (t.rest_endpoints.length)
    add(
      "observed",
      `${t.rest_endpoints.length} JSON API call(s) during load, e.g. ${t.rest_endpoints
        .slice(0, 3)
        .map((e) => `\`${e.replace(/^(\S+) [^/]+/, "$1 ")}\``)
        .join(", ")}. Design your own API; mock it first.`,
    );
  if (t.graphql_endpoints.length)
    add("observed", "GraphQL is used for data. A typed REST or GraphQL layer of your choice works.");
  if (t.websockets.length)
    add(
      "observed",
      "A WebSocket stays open: plan a real-time channel (e.g. WebSocket server or a hosted pub/sub) for live updates.",
    );
  for (const m of t.media)
    add(
      "observed",
      `Video delivery: ${m}. Suggest hls.js or the native <video> element with your own streaming provider.`,
    );
  if (t.webrtc)
    add(
      "observed",
      "The page creates RTCPeerConnection objects: live audio/video is peer or SFU based. Consider LiveKit or another WebRTC SFU.",
    );
  if (t.webtransport) add("observed", "WebTransport sessions are opened; treat as low-latency streaming transport.");
  for (const g of new Set(t.script_services.map((s) => s.guess)))
    if (g !== "unknown third-party script")
      add("inferred", `${g} loaded from a third party; pick your own equivalent if needed.`);
  if (out.length === 2)
    add("observed", "No notable APIs, real-time channels or media were seen on the analyzed pages.");
  if (a.limitations.length) out.push("", "Analysis limitations:", ...a.limitations.map((l) => `- ${l}`));
  return out.join("\n");
}

export function buildPlan(a: Analysis, stack: string, product: string): string {
  const steps: [string, string][] = [
    [
      `Scaffold ${product} with ${stack}; add the design tokens as CSS variables and a base stylesheet.`,
      "App runs locally; a token preview page shows colors, type scale and spacing.",
    ],
    [
      "Build the layout shell for each page (regions from the outline, no content yet).",
      "Regions match the outline at 1440px and 390px with no horizontal scroll.",
    ],
    [
      "Build the components with placeholder copy and all listed states.",
      "Each component renders every state (hover, focus-visible, disabled, loading).",
    ],
    [
      "Compose pages from components with newly written copy.",
      "Pages read top to bottom like the outline; no text or asset from the analyzed site.",
    ],
    [
      "Add behaviors: menus, dialogs, forms with validation (mocked submit).",
      "Keyboard-only use works; Escape closes overlays; forms show error and success states.",
    ],
    [
      "Add empty, loading and error states for data views, behind a mock API.",
      "Toggling the mock between empty/slow/failing shows the right state.",
    ],
  ];
  if (a.tech?.websockets.length || a.tech?.media.length || a.tech?.webrtc) {
    steps.push([
      "Integrate the real-time or media layer from the technical notes.",
      "A local demo stream or socket updates the UI without reload.",
    ]);
  }
  if (a.sensitive_pages.length) {
    steps.push([
      "Design your own authentication / checkout flow using a provider of your choice; do not imitate the analyzed site's screens.",
      "Flow works end to end in the provider's test mode.",
    ]);
  }
  steps.push([
    "Polish responsive behavior and accessibility.",
    "Lighthouse accessibility ≥ 95; layout holds at every breakpoint.",
  ]);
  return ["## Build plan", "", ...steps.map(([s, c], i) => `${i + 1}. ${s}\n   - Done when: ${c}`)].join("\n");
}
