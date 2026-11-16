# Yoma family look: design

Date: 2026-11-15. Supersedes the visual sections of `2026-11-12-restrained-restyle-design.md`; that spec's copy rules, honesty labels, fixed strings and accessibility rules still apply.

## Intent

YoCV and YoCard should look like features that belong inside the Yoma app, so that reviewers at UNICEF and GenU see them as a proposal for Yoma rather than a stand-alone student site. The 12 November restyle deliberately avoided Yoma's design language; the owner reversed that decision on 15 November ("Yoma family look"). The product stays honestly framed: "A Yoma concept" in the header, "Not operated by Yoma or UNICEF" in the YoCard footer and on the public page, and cards signed by YoCard. Yoma's logo is not used anywhere.

## Goals

- Adopt Yoma's palette, type, button and card shapes as they appear on yoma.world on 15 November 2026 (values read from the site's own `--color-*` variables and computed styles).
- Keep every honesty label, fixed string, flow step, dialog, keyboard path, 44 px target, 14 px text floor and AA contrast from the current build.
- Keep the CV paper legible as a document and the public card page usable without JavaScript and on 360 px phones.

## Non-goals and anti-goals

- No Yoma logo, favicon or mascot. The YoCV and YoCard wordmarks stay plain text.
- No marketing patterns from yoma.world's landing page: no uppercase letter-spaced eyebrows ("WELCOME TO YOMA"), no "unlock your future" copy, no map background, no emoji in titles.
- No build step, bundler or npm dependency. Web fonts load from Google Fonts with a system fallback; when offline the pages still render in the system stack.
- Nothing that lets a page claim to be Yoma: the strings "A Yoma concept", "Not operated by Yoma or UNICEF", "Cards are signed by YoCard, not by Yoma" and "Sample mode" remain visible and unchanged.

## Yoma's visual language (observed 2026-11-15)

| Element | On yoma.world |
|---|---|
| Colours | purple `#41204b`, purple-shade `#54365d`, purple-tint `#e7d4ed`, green `#387f6a`, green-light `#e6f5f3`, orange `#f9ab3e`, orange-light `#fdeed8`, pink `#fe4d57`, black `#020304`, gray-dark `#545859`, gray `#dce0e5`, gray-light `#f3f6fa`, white |
| Type | Nunito 600/700 for headings (h1 36 px / 43 px), Open Sans 400/600 for body at 16 px / 24 px |
| Page | app pages on `#f3f6fa`; white header; purple hero band with white heading and one orange word |
| Cards | white, 16 px radius, no border, no shadow, 16 px padding |
| Buttons | full pills; purple solid or green solid with white text; green 1 px outline secondary; Nunito or Open Sans 600 |
| Inputs | rounded, no visible border on tinted ground |

## Approaches considered

1. **Yoma family look (chosen).** Replace the token sheet with Yoma's values, load Nunito and Open Sans, switch buttons to pills and sections to borderless 16 px cards, add a purple page band with the step title. Reads as a page inside Yoma; the honesty strings carry the "not Yoma" message.
2. **Yoma accents only.** Keep the current square, bordered layout and only swap the fonts and button shape. Cheaper, but the result sits between two systems and reads as neither.
3. **Restrained product (the 12 November build).** Rejected by the owner on 15 November.

## Design

### Tokens (`styles.css` `:root`; `card.css` reuses them; `render.js` inlines the same values)

| Token | Value | Use |
|---|---|---|
| `--ink` | `#020304` | body text (Yoma black) |
| `--muted` | `#545859` | meta text, help text (Yoma gray-dark; 7.2:1 on white) |
| `--line` | `#dce0e5` | rules and card dividers only (Yoma gray; 1.3:1 on white, so never a control boundary) |
| `--page` | `#f3f6fa` | page background (Yoma gray-light) |
| `--panel` | `#ffffff` | cards, header |
| `--accent` | `#41204b` | primary buttons, links, band, current step (Yoma purple) |
| `--accent-shade` | `#54365d` | primary hover (Yoma purple-shade) |
| `--accent-tint` | `#e7d4ed` | selected choice, "AI-suggested" tag ground (Yoma purple-tint) |
| `--green` | `#387f6a` | secondary button border and solid "done" step dots (Yoma green; 4.7:1 white on it) |
| `--recorded` | `#2b6a57` | text of green tags, secondary buttons and the public Check now button (Yoma green darkened; `#387f6a` on the tint measured 4.24:1, under AA); tier headings stay `--ink` on the tint |
| `--recorded-tint` | `#e6f5f3` | green tag and tier ground (Yoma green-light) |
| `--orange` | `#f9ab3e` | decorative only: the highlighted word in the band, the awaiting tier's left border (Yoma orange; never text on white) |
| `--awaiting` | `#8a5a00` | text of amber tags (kept: Yoma's yellow `#d48414` is 3.0:1 on white) |
| `--awaiting-tint` | `#fdeed8` | amber tag ground (Yoma orange-light) |
| `--stated-tint` | `#f3f6fa` | grey tag and "stated by you" ground (same as page) |
| `--error` | `#b3261e` | error text (kept; Yoma pink `#fe4d57` is 3.1:1 on white) |
| `--error-tint` | `#ffe9ea` | error notice ground |

Seventeen tokens; no other hex values in the sheets. Vocabulary rule unchanged: token names never appear on screen.

### Type

- `<link rel="preconnect">` to fonts.googleapis.com and fonts.gstatic.com, then one stylesheet link per page: Nunito 700 and 800, Open Sans 400, 600 and 700, `display=swap`. No `@import`.
- Headings `font-family:"Nunito",system-ui,sans-serif`; body `font-family:"Open Sans",system-ui,sans-serif`. If the fonts do not load (offline, open-from-disk), the system stack renders and nothing else changes.
- Scale: h1 32 px / 1.2 Nunito 800 (36 px from 1024 px); h2 22 px Nunito 700; h3 18 px Nunito 700; body 16 px / 1.5; meta and tags 14 px; nothing below 14 px. No letter-spacing, no uppercase.

### Layout

- **Header** (`.topbar`): white, 72 px, no border; a 1 px `--line` rule only when the page is scrolled is not needed; keep it flat. Left: "YoCV" or "YoCard" in Nunito 800 26 px `--accent`, then "A Yoma concept" 14 px `--muted` (hidden under 640 px). Right: the mode label as a pill tag (14 px, `--stated-tint` ground, `--muted` text; "Live AI · model" uses the purple tag, never green, which is reserved for what Yoma recorded) keeping `id="mode-pill"` and `role="status"`, then the "About this demo" / "Need a CV?" control as a green-outline pill button. The header is `min-height:72px`, not a fixed height: under 640 px it wraps to two rows, brand and the About / Need a CV? pill on the first, the mode label pill left-aligned on the second, so nothing overflows at 360 px and the live region keeps its place in the DOM.
- **Page band** (`#page-band`, new): a viewport-wide `--accent` block between the header and `.app-shell` in both HTML files, white text, 32 px vertical padding, its content in the same 1024 px container. `app.js` and `card.js` fill it on every render through a small `setBand(stepText, h1HTML)` helper, and the step `h1` moves out of `#view` into the band; `go()` focuses `#page-band h1` instead of `#view h1`. The band holds the step line ("Step 2 of 5", 14 px, solid white) and the `h1` in white Nunito. On the YoCV landing page only, the h1 highlights "already done" in `--orange` via `<span class="hl">`; YoCard headings have no highlighted phrase, since no existing YoCard h1 carries a suitable one and copy does not change. The skip link still targets `#main`, `aria-busy` stays on `#view`, and under 900 px the order is header, band, step strip, content. The lead paragraph sits directly under the band as the first element in `#view`, outside any card.
- **Shell**: 1024 px container, 24 px gutters (16 px under 640 px). Desktop keeps the two-column grid: a 240 px step card on the left, content on the right. Under 900 px the step card becomes a horizontal strip of numbered circles above the content (existing behaviour, restyled).
- **Step card** (`.sidebar`): a white 16 px-radius card. Each step: a 32 px circle (`--accent` filled with white number for the current step, `--green` filled with a white number for completed steps, `--muted` 2 px outline for upcoming, since `--line` is too light for a state indicator) and the step name in Open Sans 600. `aria-label="Step N of M: name"` stays.
- **Cards** (`.card`, `.form-section` blocks, evidence rows' container, CV paper frame, opportunities list, published screen): white, 16 px radius, no border, no shadow, 24 px padding (16 px under 640 px). Rows inside a card separate with 1 px `--line` rules, not nested cards. On the review step each claim is its own card on the page ground, 16 px apart.
- **Choice list** (roles, trades, sample accounts): the list sits directly on the `--page` ground, never inside another white card, so each option reads as a card (Yoma's opportunity grid pattern). Each option is a white 16 px card with a 2 px transparent border; selected gets a 2 px `--accent` border and `--accent-tint` ground; the radio dot stays, drawn with a 2 px `--muted` ring (`--accent` filled when selected).
- **Buttons**: pills (`border-radius:9999px`), 44 px min height, 0 24 px padding, Open Sans 600 16 px. `.primary`: `--accent` ground, white text, hover `--accent-shade`. `.secondary`: white ground, 1 px `--green` border, `--recorded` text, hover `--recorded-tint`. `.text-button` / `.back-link`: underlined `--accent` text, 44 px target. `.danger` (withdraw): white ground, 1 px `--error` border, `--error` text. Claim actions (Accept / Edit / Leave out) stay 36 px tall pills. No icons, no arrows.
- **Inputs**: white, 1 px `--muted` border (3:1 non-text contrast needs more than `--line` gives), 8 px radius, 48 px tall (textarea 160 px), 16 px text; focus ring unchanged (`outline:3px solid var(--accent);outline-offset:2px`). Checkbox 24 px with `accent-color:var(--accent)`.
- **Tags** (`.tag`): pills, 14 px Open Sans 600, 4 px 12 px padding, tint ground with dark text: green (`--recorded-tint`/`--recorded`) for "Recorded by Yoma", "Issuer-recorded achievement…", "Live from Yoma", "From Yoma (cached)", "Included in CV"; amber for "Awaiting verification", "Document awaiting verification"; grey (`--stated-tint`/`--muted`) for "Self-reported", "Sample", "Not on your CV", "Template suggestion"; purple (`--accent-tint`/`--accent`) for "AI-suggested" and "Live AI · model". Words unchanged.
- **Notices** (`.notice`): `--accent-tint` ground, 16 px radius, no border, `--ink` text; error notices `--error-tint` ground and `--error` text.
- **CV paper** (`#cv-paper`, `#sample-cv`): a white 16 px card with 32 px padding; name in Nunito 800 28 px, role 16 px `--muted`, section headings Nunito 700 18 px with a 1 px `--line` rule beneath; body Open Sans. Print stylesheet keeps black on white, no radius, no band.
- **Evidence record and opportunities**: one card each; opportunity rows with a 40 px organisation logo in a 50 % circle with 1 px `--line` border, title Open Sans 600, meta 14 px `--muted`, link "Open on Yoma (yoma.world)" underlined `--accent`.
- **YoCard tiers**: "Recorded by Yoma" card has a 6 px `--green` left border with a `--recorded-tint` heading row; "Stated by you, not checked" is a white card with a 6 px `--muted` left border (`--line` is too faint to mark a tier). The public page uses the same two treatments, so the tiers stay distinct on the `--page` ground. Account summary `<dl>` unchanged in structure, inside a card.
- **Dialogs**: 16 px radius, no border, a 64 px `--accent` header band carrying the dialog title in white Nunito 700 20 px, 24 px body padding, plain 50 % black backdrop. Close is a white outline pill inside the band.
- **Focus on purple grounds**: the pinned rule `outline:3px solid var(--accent);outline-offset:2px` stays the only base ring; one scoped rule, `#page-band :focus-visible,.dialog-head :focus-visible{outline-color:var(--panel)}`, turns it white where the ground is `--accent`, so focus is visible on the band and in the dialog header (white on purple is 13.7:1).
- **Footer**: 14 px `--muted` sentences, unchanged wording.
- **Public card page (`render.js`)**: inline CSS adopts the same values (`--bg` `#f3f6fa`, `--card` white 16 px radius no border, `--accent` `#41204b`, `--ok` `#2b6a57`, `--line` `#dce0e5`, `--ink` `#020304`, `--grey` `#545859`, `--stated` `#f3f6fa`), the same Google Fonts link with the system fallback, `h1` Nunito 800, `h2` Nunito 700 18 px, buttons as pills 44 px (`.wa` purple solid, "Check now" green outline), `.chip` as the tag pill, the safety notice on `--accent-tint`, and `.stated` becomes the white card with the 6 px `--muted` left border described under YoCard tiers (the `--stated` tint no longer marks the tier). Markup, section order, fixed strings, the no-JavaScript path and the masked phone are unchanged. SVG share image: header band `#41204b`, title in white, section labels Nunito-free (SVG uses the system stack), tint rects `rx="16"`, label "Confirmed from Yoma" in `#2b6a57`.

### Copy

No copy changes except the landing h1s, which gain the `<span class="hl">` highlight on an existing phrase. All strings asserted by tests stay byte-identical.

### Tests

- Rewrite `tests/restyle.test.cjs` to pin this system: the seventeen tokens above and no other hex in either sheet; both HTML pages carry exactly one Google Fonts stylesheet link naming only Nunito and Open Sans with the listed weights; no `@import`, `text-transform`, `letter-spacing` or `box-shadow` other than `none`; radii limited to `8px`, `16px`, `9999px` and `50%`; no `font-size` under 14 px outside print; focus ring, `overflow-wrap:anywhere`, print and reduced-motion rules present; `card.css` defines no tokens; page files still free of glyphs, eyebrows and zero-padded steps.
- `tests/card-render.test.cjs`: keep `--accent:#41204b`, no `text-transform`; replace the `border-radius:999px` assertion with one that `.btn` uses `border-radius:9999px`; SVG `rx="16"`.
- Everything else in `npm test` must pass unchanged.

### Documentation

- README "Design" paragraph: state that the look follows Yoma's design language (Nunito, Open Sans, Yoma purple and green, pill buttons, 16 px cards) by the owner's decision on 15 November 2026, that Yoma's logo is not used, and that the pages fall back to system fonts offline.
- `docs/testing-log.md`: add rows for the restyle check at 360 px, 375 px and 1280 px, contrast of every tag pair, keyboard focus visibility on the purple band, and the offline font fallback.
- The 12 November spec gets a one-line note at the top pointing here.

## Baseline

The plan starts from the current working tree, which already removes the three example buttons from YoCV step 2 (`app.js`, `styles.css`, uncommitted on 15 November). That removal is committed on its own first, so the restyle commits stay readable.

## Constraints

- Node 20+ built-ins only; vanilla HTML/CSS/JS; no bundler.
- All `STRINGS` in `server/card/render.js` and the `card.js` mirror unchanged.
- `core.js` untouched.
- `npm test` green; 360 px and 375 px without horizontal overflow; every text pair at least 4.5:1.

## Builder-check decisions (15 November)

Two fresh readers raised fourteen questions; all were settled in this document rather than put to the owner: viewport-wide band with the h1 moved into it and focus retargeted; highlight on YoCV only; two-row header under 640 px; mode pill purple for live AI; `--muted` for input borders, upcoming step circles and the stated tier's edge; stated tier identical on app and public page; choice lists and claim cards directly on the page ground; a scoped white focus ring on purple; seventeen tokens; working tree as baseline.

## Left to the builder

Exact spacing within the 8 px scale, the order of rules in the sheets, how the band is composed in `stepLine()`, and the print-stylesheet details, provided the tests and the token table hold.
