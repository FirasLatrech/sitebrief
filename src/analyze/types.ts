import type { ViewportName } from "../browser.js";
import type { Component } from "./components.js";
import type { IconReport } from "./icons.js";
import type { ImageSlot } from "./images.js";
import type { Interactions } from "./interactions.js";
import type { Region } from "./layout.js";
import type { Section } from "./sections.js";
import type { TechReport } from "./tech.js";
import type { Tokens } from "./tokens.js";

export interface AnalyzeInput {
  url: string;
  pages?: string[];
  viewports?: ViewportName[];
}

export interface PageReport {
  path: string;
  sensitive: boolean;
  sensitive_reasons: string[];
  /** This page's own tokens (first analyzed viewport), so pages with different themes can be compared separately. */
  tokens: Tokens | null;
  views: { viewport: ViewportName; layout: Region[]; screenshot: string; sections: Section[]; images: ImageSlot[] }[];
}

export interface Analysis {
  analysis_id: string;
  url: string;
  created_at: string;
  pages: PageReport[];
  tokens: Tokens | null;
  components: (Component & { page: string })[];
  interactions: (Interactions & { page: string; viewport: ViewportName })[];
  tech: TechReport | null;
  icons: IconReport;
  sensitive_pages: string[];
  screenshots: string[];
  limitations: string[];
}
