# Build prompt: Orbitly

You are building **Orbitly** with **React + Vite + Tailwind**. This brief describes structure and behavior learned from an existing website. Build an original product with its own code, brand, copy and assets. Read the originality rules at the end before you start.

Reference screenshots (to look at for layout only; never ship, trace or crop them):
- ~/.sitebrief/20261020085307-98967e9c/landing-html-desktop.png
- ~/.sitebrief/20261020085307-98967e9c/landing-html-mobile.png

Per-section reference images: call the `get_sections` tool with analysis_id `20261020085307-98967e9c`. Check your build with `compare_site`.

## Product summary

Orbitly is presented through a content-led site: a top navigation, stacked full-width sections and a footer. It groups its offering into repeated cards, including priced plan or product cards. Visitors act through 1 form(s) (input:email). It has account and/or payment screens, which you will design independently.

Direction from the team: A planning tool for small teams; keep the hero, feature grid and pricing layout

## Pages and layout

### `/landing.html`

Desktop:
- **header**: flex row; 1440×73px; contains 1×strong, 1×nav
  - **nav**: flex row, gap 24px; 358×40px; contains 4×a
- **main**: block; 1440×1558px; contains 3×section, 1×div, 1×form
  - **section**: block; 1440×891px; contains 1×h1, 1×p, 1×button, 1×img
  - **section**: grid, 3 column(s), gap 32px; 1440×230px; contains 3×article
    - **article**: block; 437×134px; contains 1×h3, 1×p
    - **article**: block; 437×134px; contains 1×h3, 1×p
    - **article**: block; 437×134px; contains 1×h3, 1×p
  - **section**: grid, 3 column(s), gap 32px; 1440×310px; contains 3×div
  - **form**: block; 1440×39px; contains 1×label, 1×button
- **footer**: flex row, gap 16px; 1440×88px; contains 1×svg, 2×a, 2×span

Mobile:
- **header**: flex row; 390×72px; contains 1×strong, 1×button
- **main**: block; 390×2226px; contains 3×section, 1×div, 1×form
  - **section**: block; 390×767px; contains 1×h1, 1×p, 1×button, 1×img
  - **section**: grid, 1 column(s), gap 24px; 390×546px; contains 3×article
    - **article**: block; 326×134px; contains 1×h3, 1×p
    - **article**: block; 326×134px; contains 1×h3, 1×p
    - **article**: block; 326×134px; contains 1×h3, 1×p
  - **section**: grid, 1 column(s), gap 24px; 390×786px; contains 3×div
    - **div**: block; 326×214px; contains 1×h3, 1×div, 1×p, 1×a
    - **div**: block; 326×214px; contains 1×h3, 1×div, 1×p, 1×a
    - **div**: block; 326×214px; contains 1×h3, 1×div, 1×p, 1×a
  - **form**: block; 390×39px; contains 1×label, 1×button
- **footer**: flex row, gap 16px; 390×112px; contains 1×svg, 2×a, 2×span

Responsive behavior:
- **section** changes from grid, 3 column(s), gap 32px on desktop to grid, 1 column(s), gap 24px on mobile.
- **section** changes from grid, 3 column(s), gap 32px on desktop to grid, 1 column(s), gap 24px on mobile.
- **nav** is hidden or collapsed on mobile.
- On mobile only, a button opens nav (390×264, overlay) (navigation drawer pattern).

### `/checkout.html`

Design your own checkout flow using a provider of your choice; do not imitate the analyzed site's screens.

Breakpoints observed: max-width 768px, min-width 1200px. Use a similar number of breakpoints.

## Components

### Button
- Purpose: triggers the main actions; seen 5× on /landing.html.
- Structure: inline container about 99×43px with text only; text roles: action.
- States: default, hover (changes backgroundColor), focus (changes boxShadow), focus-visible, disabled where it applies.
- Props: label, variant, onClick | href, disabled, loading, ctaLabel + onAction.

### Nav item
- Purpose: moves between top-level sections; seen 4× on /landing.html.
- Structure: block container about 77×40px with text only; text roles: action.
- States: default, hover (changes color, borderColor), focus (changes outlineStyle), focus-visible, disabled where it applies.
- Props: label, href, active, icon?, ctaLabel + onAction.

### Card
- Purpose: presents one item (feature, plan, product, post) in a framed block; seen 3× on /landing.html.
- Structure: block container about 437×134px with h3,p; text roles: title, body.
- States: default, hover (changes transform), focus-visible, disabled where it applies.
- Props: title, description.

### Card 2
- Purpose: presents one item (feature, plan, product, post) in a framed block; seen 3× on /landing.html.
- Structure: block container about 437×214px with h3,div,p,a; text roles: title, price, body, action.
- States: default, hover (changes transform), focus-visible, disabled where it applies.
- Props: title, price, description, ctaLabel + onAction.

## Design system

Observed structure: 8 color roles (background, surface, text, muted, primary, border, danger, success), 5 font sizes, 2 weights, 9 spacing steps on a ~4px grid, 2 radii, 1 shadow level(s), 1 transition duration(s).

Use this original token set (same roles and scale sizes, new values). Do not look up or reuse the analyzed site's colors or fonts.

```css
:root {
  --color-background: #fcfbfa;
  --color-surface: #f4eeec;
  --color-text: #1a130f;
  --color-muted: #70635c;
  --color-primary: #df6120;
  --color-border: #e1dad6;
  --color-danger: #d02530;
  --color-success: #298e55;
  --color-on-primary: #fdfcfc;
  --font-sans: "DM Sans", system-ui, sans-serif;
  --text-1: 12px;
  --text-2: 14px;
  --text-3: 17px;
  --text-4: 21px;
  --text-5: 25px;
  --weight-1: 400;
  --weight-2: 600;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;
  --space-8: 64px;
  --space-9: 96px;
  --radius-1: 3px;
  --radius-2: 6px;
  --duration-1: 120ms;
  --duration-2: 200ms;
  --duration-3: 320ms;
  --ease: cubic-bezier(0.2, 0, 0, 1);
}
```

Font: DM Sans (open license). Icons: Lucide. Check text/background contrast reaches WCAG AA.

## Images and media

Fill every slot below. Never use the analyzed site's image, video or logo files. Use images you own, licensed stock, or newly generated originals that match each slot's role, framing, aspect ratio and mood (see the section reference images). Use the framework's image component with explicit width and height so nothing shifts while loading.

### `/landing.html` (desktop)
- **hero media**: 1200×500px (12:5, fit fill), reference section #1, at y=368. full-bleed photo or muted looping video behind the hero; object-fit cover, dark overlay for text contrast, a poster image for the video.
- **logo strip** ×4: 120×40px (3:1, fit fill), at y=988. row of customer logos: use your own customers (with their permission) or clearly fictional placeholder marks; never logos of companies that have not agreed.

### `/landing.html` (mobile)
- **media**: 326×136px (2.40, fit fill), reference section #1, at y=607. illustrative product image or screenshot of your own product next to the text.
- **logo strip** ×4: 120×40px (3:1, fit fill), at y=863. row of customer logos: use your own customers (with their permission) or clearly fictional placeholder marks; never logos of companies that have not agreed.

## Behaviors

`/landing.html` (desktop):
- A button[aria-haspopup=dialog] opens dialog (235×159, overlay); it closes with Escape. Trap focus while open and return focus to the trigger on close.
- A form with input:email: design inline validation, a pending state on submit, and success and error messages.

`/landing.html` (mobile):
- A button opens nav (390×264, overlay); it closes with Escape. Trap focus while open and return focus to the trigger on close.
- A button[aria-haspopup=dialog] opens dialog (235×159, overlay); it closes with Escape. Trap focus while open and return focus to the trigger on close.
- A form with input:email: design inline validation, a pending state on submit, and success and error messages.

States to design for every data view:
- Loading: skeletons shaped like the card.
- Empty: a short explanation and one primary action.
- Error: a message with a retry action; never a blank area.
- Hover and keyboard focus-visible on every interactive element; respect prefers-reduced-motion.

## Technical notes

- (observed) 1 JSON API call(s) during load, e.g. `GET /api/plans/:id`. Design your own API; mock it first.

Analysis limitations:
- Images, fonts and media were not downloaded, so screenshots show empty boxes where they would be.
- Analyzed anonymously (no cookies, no login); signed-in screens are not covered.

## Build plan

1. Scaffold Orbitly with React + Vite + Tailwind; add the design tokens as CSS variables and a base stylesheet.
   - Done when: App runs locally; a token preview page shows colors, type scale and spacing.
2. Build the layout shell for each page (regions from the outline, no content yet).
   - Done when: Regions match the outline at 1440px and 390px with no horizontal scroll.
3. Build the components with placeholder copy and all listed states.
   - Done when: Each component renders every state (hover, focus-visible, disabled, loading).
4. Compose pages from components with newly written copy.
   - Done when: Pages read top to bottom like the outline; no text or asset from the analyzed site.
5. Add behaviors: menus, dialogs, forms with validation (mocked submit).
   - Done when: Keyboard-only use works; Escape closes overlays; forms show error and success states.
6. Add empty, loading and error states for data views, behind a mock API.
   - Done when: Toggling the mock between empty/slow/failing shows the right state.
7. Design your own authentication / checkout flow using a provider of your choice; do not imitate the analyzed site's screens.
   - Done when: Flow works end to end in the provider's test mode.
8. Polish responsive behavior and accessibility.
   - Done when: Lighthouse accessibility ≥ 95; layout holds at every breakpoint.

## Originality rules

- Write all code from scratch. Do not fetch, copy or adapt the analyzed site's HTML, CSS, JS, images, icons, logos, illustrations, fonts, or text.
- Use the new product name and brand everywhere. The result must not be mistakable for the analyzed site.
- Use placeholder or newly written copy; use an open icon set (e.g. Lucide) and open fonts.
