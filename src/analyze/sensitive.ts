import type { Page } from "playwright";

export interface SensitiveResult {
  sensitive: boolean;
  reasons: string[];
}

/** Flags pages with password fields, payment fields or known payment iframes. */
export function readSensitive(page: Page): Promise<SensitiveResult> {
  return page.evaluate(() => {
    const reasons: string[] = [];
    // Hidden elements don't count: Stripe.js injects invisible iframes on every page, sites keep hidden login modals.
    const shown = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width >= 20 && r.height >= 10 && getComputedStyle(el).visibility !== "hidden";
    };
    if ([...document.querySelectorAll('input[type="password"]')].some(shown)) reasons.push("password field");
    const PAY = /cc-number|cc-csc|cc-exp|card.?number|cardnumber|\bcvc\b|\bcvv\b|security.?code|\biban\b/i;
    for (const el of document.querySelectorAll("input, select")) {
      if (!shown(el)) continue;
      const hint = ["autocomplete", "name", "id", "placeholder", "aria-label"]
        .map((a) => el.getAttribute(a) ?? "")
        .join(" ");
      if (PAY.test(hint)) {
        reasons.push("payment field");
        break;
      }
    }
    const PAY_FRAME = /js\.stripe\.com|paypal\.com|braintreegateway|adyen|checkout\.com|squareup|klarna/i;
    if ([...document.querySelectorAll("iframe")].some((f) => shown(f) && PAY_FRAME.test(f.src)))
      reasons.push("payment iframe");
    return { sensitive: reasons.length > 0, reasons };
  });
}
