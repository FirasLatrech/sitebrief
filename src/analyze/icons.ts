import type { Page } from "playwright";

export interface IconReport {
  /** Open icon libraries recognized by their markup, e.g. "Lucide". */
  libraries: string[];
  /** Inline <svg> elements that look like icons (small and square-ish) with no known library. */
  custom_svg_icons: number;
}

/** Detects which icon set a page uses. Only the library name is recorded, never icon artwork. */
export function readIcons(page: Page): Promise<IconReport> {
  return page.evaluate(() => {
    const LIBS: [string, string][] = [
      ["Lucide", "svg.lucide, [class*='lucide-']"],
      ["Feather", "svg.feather"],
      ["Tabler Icons", "svg.icon-tabler, i.ti, [class^='ti-'], [class*=' ti-']"],
      ["Material Symbols", "[class*='material-symbols'], .material-icons, .material-icons-outlined"],
      ["Font Awesome (Free)", "svg.svg-inline--fa, i.fa, i.fas, i.far, i.fab, i.fa-solid, i.fa-regular, i.fa-brands"],
      ["Bootstrap Icons", "i.bi, [class^='bi-'], [class*=' bi-']"],
      ["Remix Icon", "[class^='ri-'], [class*=' ri-']"],
      ["Phosphor", "i.ph, [class^='ph-'], [class*=' ph-']"],
      ["Ionicons", "ion-icon"],
      ["Heroicons (guess)", "svg[data-slot='icon']"],
    ];
    const libraries = LIBS.filter(([, sel]) => document.querySelector(sel)).map(([name]) => name);
    let custom = 0;
    for (const svg of document.querySelectorAll("svg")) {
      const r = svg.getBoundingClientRect();
      if (r.width < 8 || r.width > 64 || Math.abs(r.width - r.height) > 8) continue;
      if (LIBS.some(([, sel]) => svg.matches(sel))) continue;
      custom++;
    }
    return { libraries, custom_svg_icons: custom };
  });
}
