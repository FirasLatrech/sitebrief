import type { Page } from "playwright";

export interface Inventory {
  buttons: number;
  links: { internal: number; external: number; in_page: number };
  forms: { fields: string[]; has_submit: boolean }[];
}

export interface ClickResult {
  trigger: string;
  opened: string;
  closed_by: string;
}

export interface Interactions extends Inventory {
  click_through: ClickResult[];
}

const POPUP =
  '[role=dialog],[role=alertdialog],[role=menu],[role=listbox],[role=tooltip],dialog[open],[aria-modal="true"],[popover]';
const MAX_TRIGGERS = 5;

/** Marks safe triggers with data-sb-trigger and returns their descriptions. Never anchors that navigate, never submit buttons. */
function markTriggers(page: Page): Promise<string[]> {
  return page.evaluate((max) => {
    const DANGER =
      /\b(buy|purchase|checkout|pay|order|delete|remove|destroy|send|submit|sign.?out|log.?out|unsubscribe|cancel.?(plan|subscription)|confirm)/i;
    const label = (el: Element) =>
      [el.textContent, el.getAttribute("aria-label"), el.getAttribute("title"), el.id, el.className].join(" ");
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
    };
    const sel =
      "[aria-haspopup]:not([aria-haspopup=false]),[aria-expanded],[aria-controls],[popovertarget],[data-toggle],[data-bs-toggle],summary,[commandfor]";
    const out: string[] = [];
    for (const el of document.querySelectorAll(sel)) {
      if (out.length >= max || !visible(el) || DANGER.test(label(el))) continue;
      if (el.closest("form") && el.tagName === "BUTTON" && (el as HTMLButtonElement).type === "submit") continue;
      if (el.matches("input[type=submit]")) continue;
      const href = el.getAttribute("href");
      if (el.tagName === "A" && href && !href.startsWith("#")) continue;
      el.setAttribute("data-sb-trigger", String(out.length));
      const role = el.getAttribute("role");
      const popup = el.getAttribute("aria-haspopup");
      out.push(`${el.tagName.toLowerCase()}${role ? `[role=${role}]` : ""}${popup ? `[aria-haspopup=${popup}]` : ""}`);
    }
    return out;
  }, MAX_TRIGGERS);
}

function readInventory(page: Page): Promise<Inventory> {
  return page.evaluate(() => {
    const links = { internal: 0, external: 0, in_page: 0 };
    for (const a of document.querySelectorAll("a[href]")) {
      const href = a.getAttribute("href") ?? "";
      if (href.startsWith("#")) links.in_page++;
      else if ((a as HTMLAnchorElement).origin === location.origin) links.internal++;
      else links.external++;
    }
    const forms = [...document.querySelectorAll("form")].slice(0, 10).map((f) => ({
      fields: [...f.querySelectorAll("input,select,textarea")]
        .map((i) => (i.tagName === "INPUT" ? `input:${(i as HTMLInputElement).type}` : i.tagName.toLowerCase()))
        .filter((t) => t !== "input:hidden"),
      has_submit: f.querySelector("[type=submit],button:not([type])") !== null,
    }));
    return {
      buttons: document.querySelectorAll("button,[role=button],input[type=button]").length,
      links,
      forms,
    };
  });
}

/** Lists buttons/links/forms, then clicks each obvious menu/dialog trigger once and records what appears. */
export async function readInteractions(
  page: Page,
  reload: () => Promise<void>,
  clickThrough = true,
): Promise<Interactions> {
  const inventory = await readInventory(page);
  const results: ClickResult[] = [];
  if (!clickThrough) return { ...inventory, click_through: results };
  let triggers = await markTriggers(page);
  for (let i = 0; i < Math.min(triggers.length, MAX_TRIGGERS); i++) {
    const startUrl = page.url();
    const result: ClickResult = {
      trigger: triggers[i],
      opened: "nothing detected",
      closed_by: "n/a",
    };
    try {
      await page.evaluate((sel) => {
        for (const el of document.querySelectorAll(sel)) el.setAttribute("data-sb-was", "1");
      }, POPUP);
      const trig = page.locator(`[data-sb-trigger="${i}"]`);
      await trig.click({ timeout: 2_000 });
      await page.waitForTimeout(400);
      result.opened = await page.evaluate(
        ([sel, idx]) => {
          const t = document.querySelector(`[data-sb-trigger="${idx}"]`);
          const vis = (el: Element) =>
            el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility !== "hidden";
          const ctrl = t?.getAttribute("aria-controls");
          const fresh = [...document.querySelectorAll(sel)].find((el) => vis(el) && !el.hasAttribute("data-sb-was"));
          const target = fresh ?? (ctrl ? document.getElementById(ctrl) : null);
          if (target && vis(target)) {
            const r = target.getBoundingClientRect();
            const role = target.getAttribute("role") ?? target.tagName.toLowerCase();
            const pos = getComputedStyle(target).position;
            return `${role} (${Math.round(r.width)}×${Math.round(r.height)}, ${pos === "fixed" ? "overlay" : "in-flow"})`;
          }
          return t?.getAttribute("aria-expanded") === "true" ? "expanded (aria-expanded=true)" : "nothing detected";
        },
        [POPUP, String(i)] as const,
      );
      if (page.url().split("#")[0] !== startUrl.split("#")[0]) {
        result.opened = "navigated (in-page route change)";
        result.closed_by = "reload";
        await reload();
        triggers = await markTriggers(page);
        continue;
      }
      if (result.opened !== "nothing detected") {
        const isOpen = () =>
          page.evaluate(
            ([sel, idx]) =>
              document.querySelector(`[data-sb-trigger="${idx}"]`)?.getAttribute("aria-expanded") === "true" ||
              [...document.querySelectorAll(sel)].some(
                (el) => !el.hasAttribute("data-sb-was") && el.getBoundingClientRect().width > 0,
              ),
            [POPUP, String(i)] as const,
          );
        await page.keyboard.press("Escape");
        await page.waitForTimeout(250);
        result.closed_by = "Escape";
        if (await isOpen()) {
          result.closed_by = "clicking the trigger again";
          await trig.click({ timeout: 2_000 }).catch(() => {});
          await page.waitForTimeout(250);
        }
        if (await isOpen()) {
          result.closed_by = "reload";
          await reload();
          triggers = await markTriggers(page);
        }
      }
    } catch {
      result.opened = "click failed (covered or not interactable)";
    }
    results.push(result);
  }
  return { ...inventory, click_through: results };
}
