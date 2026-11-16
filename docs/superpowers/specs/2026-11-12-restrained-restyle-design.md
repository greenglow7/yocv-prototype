# Restrained restyle: YoCV and YoCard

> Superseded on 2026-11-15 by [the Yoma family look](2026-11-15-yoma-family-look-design.md), which reverses the "not Yoma-branded" anti-goal below on the owner's decision; the honesty labels, flows and copy it fixed still stand.

Date: 2026-11-12. Status: draft for approval (builder check applied).

## Intent

The two pages (`index.html` YoCV, `card.html` YoCard) read as an AI-generated template: uppercase eyebrow labels, fragment headlines, arrow glyphs, a tilted mock-up, two Google fonts in fourteen weights, about a hundred hex colours, nested tinted cards and pastel pills. Reviewers at UNICEF and GenU should judge the product and the Yoma integration, not the generator. The restyle removes those tells and leaves the flow, the honesty labels, the accessibility work and the public card page's structure intact.

Research behind this (saved in the session scratchpad, summarised here): published commentary on AI-made sites, an audit of the current CSS and copy, Yoma's own brand (purple #41204b, green #387f6a, Nunito and Open Sans, pill buttons, white cards without borders), and civic references (GOV.UK, SAYouth.mobi, gov.za, UNICEF, Stripe docs).

## Goals

- A reviewer who has seen a hundred v0 and Lovable pages does not place this one among them.
- One visual system shared by the app pages and the public card page: same purple, same tag colours, same button shape.
- Faster on a cheap Android phone: no web font download, no blur, no shadows, 16 px body text.
- Every heading states the task; every button says what happens next.

## Non-goals and anti-goals

- No change to the five-step CV flow, the four-step card flow, the step gating, the confirm dialogs, the stale-draft guard, the server, the tests of server behaviour, or the SVG card's two-block layout and QR.
- No new features, no new screens, no dark mode.
- Anti-goal: looking like a page inside yoma.world. Yoma's fonts, pill buttons and card style are not adopted. The fixed string "Not operated by Yoma or UNICEF" must remain visibly true.
- Anti-goal: looking unfinished. Flat is fine; bare is not. Headings, rules and spacing must still read as decided.

## Constraints

- Buildless, dependency-free. No font files, no icon library. System font stack only.
- All fixed strings in `server/card/render.js` (the STRINGS block) and their mirror in `card.js` keep their exact wording. The mode labels "Live AI · <model>", "Sample mode" and "Sample mode (offline)" keep their wording (the interpunct inside the live label stays, as it is a separator between two values, not decoration).
- Accessibility stays or improves: skip link, `aria-pressed`, `aria-current="step"`, `role="progressbar"`, `role="status"`, live regions, h1 focus on step change, focus snapshot and restore, 44 px targets, 16 px inputs on phones, visible 3 px focus ring, `prefers-reduced-motion`, print stylesheet, noscript notice, public page working without JavaScript.
- Tests in `tests/` that assert strings on the public page and SVG must still pass. Tests do not assert app page markup, so the templates in `app.js` and `card.js` may change freely.
- 360 px and 375 px viewports: no horizontal overflow.

## Approaches considered

1. Yoma-native: adopt Yoma's palette, fonts and pills. Rejected: implies endorsement, contradicts the fixed strings, costs two web fonts, and Yoma's own pills and "unlock your future" copy sit close to the template look.
2. Civic utility: GOV.UK style, single 680 px column, black text, square buttons, no cards. Fastest and closest to the public page, but a student deliverable in this style risks reading as unfinished without framing.
3. Restrained product (chosen): keep the sidebar and content grid, delete the decorative asides, eyebrows, glyphs and mock-up, replace the ad-hoc CSS with a small token sheet, adopt civic-utility rules for buttons, tags, links and copy.

## Design

### Tokens (`styles.css` `:root`, reused by `card.css`; `render.js` inlines the same values)

Colours, eight in total:

| Token | Value | Use |
| --- | --- | --- |
| `--ink` | `#1f1a22` | text, input borders |
| `--muted` | `#5d5566` | secondary text, 7:1 on white |
| `--line` | `#d9d5dc` | rules, card borders |
| `--page` | `#f6f5f3` | page background |
| `--panel` | `#ffffff` | panels, inputs, sidebar |
| `--accent` | `#41204b` | primary buttons, links, active step, focus ring |
| `--recorded` | `#2b6a57` on tint `#e6f5f3` (darkened from Yoma's `#387f6a` after the build: the lighter green measured 4.24:1 on the tint, under AA for 14 px text) | "Recorded by Yoma" tags and the confirmed tier only |
| `--awaiting` | `#8a5a00` on tint `#fff2d6` | "Awaiting verification" tag |
| `--stated` | `--muted` on tint `#f1f0f2` | "Self-reported" / "Stated by you" tags and the stated tier |
| `--error` | `#b3261e` | error text and border |

Tints are their own tokens (`--recorded-tint`, `--awaiting-tint`, `--stated-tint`), so the sheet defines twelve custom properties for ten hues plus white. The focus ring uses `--accent`; the primary hover shade `#2f1537` is the only untokenised hex. No alpha-hex overlays except the dialog backdrop (`rgba(31,26,34,.5)`, no blur).

Vocabulary rule: a token name never appears on screen. The words users see are the existing honesty labels. In YoCV the green tag text stays `C.labels.verified` ("Issuer-recorded achievement · representative Yoma sample", asserted by tests and written into the evidence record), the amber tag stays "Document awaiting verification", the grey tag stays "Self-reported". In YoCard the green tier keeps its fixed name "Confirmed from Yoma" on the app page and the public page alike; `--recorded` is only the CSS name for that colour. `core.js` is not touched.

Type: `font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` everywhere, same stack as `render.js`. Weights 400, 600, 700 only. Letter-spacing 0 everywhere; `text-transform` nowhere. Sizes: 14 px (meta, tags, footnotes), 16 px (body, inputs, buttons), 18 px (h3), 24 px (h2), 32 px (h1; 28 px under 640 px). Line heights 1.5 body, 1.25 headings. Nothing under 14 px on screen; the print stylesheet may keep 11 px.

Radii: 4 px (inputs, buttons, tags, cards), 8 px (dialog), 50 % (step numbers only). Borders 1 px `--line`; inputs 2 px `--ink`. No box shadows. Spacing scale 4, 8, 12, 16, 24, 32, 48 px; no other values. Transitions: none except the existing reduced-motion-safe focus and the toast.

### Layout

- Header: 64 px, `--panel`, 1 px bottom rule. Left: wordmark "YoCV" or "YoCard" as plain text, 20 px, 700, `--accent`, no icon mark, followed by "A Yoma concept" as 14 px muted text (hidden under 640 px); this framing line stays because it says what the thing is not. Right: the mode label as plain 14 px muted text, no pill, no dot (keeps `id="mode-pill"` and `role="status"`), then one text link ("About this demo" / "Need a CV?"), underlined, 44 px tall target. Favicon: replace the icon SVG with a plain letter "Y" on `--accent`.
- Sidebar (≥ 960 px): keep the 232 px rail, `--panel`, right rule. Title "Steps" 14 px 600. Step buttons: number in a 24 px circle (digits 1 to 5, not zero-padded; a completed step shows the digit with the circle filled `--accent` and white text; active step bold with `--accent` text), label 16 px. Remove the sidebar blurb, the heart and tick symbols and the lock icon; keep "Your draft stays in this session." as a 14 px sentence at the bottom. Under 960 px the rail becomes the existing horizontal row, 28 px circles.
- Content: single column, max-width 680 px, left-aligned, 24 px padding (16 px on phones). The `content-grid` with its `aside` is removed; help copy that matters becomes one paragraph under the heading or a `<details>` block labelled "Why this matters".
- Below each form: a footer row with the primary button right and the back link left, separated from the form by a 1 px rule.

### Components

- Headings: one `h1` per screen, sentence case, no full stop, no `<br>`, no eyebrow above. Optional one-sentence lead paragraph in 16 px `--muted`.
- Step indicator in content: a 14 px muted line "Step 2 of 5" above the h1 (replaces the "STEP 02 / …" eyebrow). Section headings inside a step are `h2` 24 px or `h3` 18 px in sentence case; no `.section-kicker`.
- Primary button: `--accent` background, white 16 px 600 text, 44 px, 4 px radius, no icon, hover darkens to `#2f1537`. Secondary: white, 1 px `--ink` border. Tertiary: underlined link in `--accent`. One primary per screen, with two stated exceptions: the small "Accept" on each claim card, and the YoCard connect step, where "Read this account" becomes secondary once an account has been read and "Continue to describe your work" is the primary.
- Back: an underlined link "Back", no arrow.
- Tags (GOV.UK pattern): 14 px 400, sentence case, 2 px 6 px padding, 4 px radius, tint background with the matching dark text; adjectives only: "Recorded by Yoma", "Self-reported", "Awaiting verification", "Not on your CV", "AI-suggested", "Template suggestion", "Live from Yoma", "From Yoma (cached)". Never a bare glyph.
- Choice lists (roles, personas, example chips): a vertical list of 44 px rows with a 1 px rule between, a radio-style 20 px circle at the left, label 16 px, description 14 px muted. Selected row: `--accent` 2 px left border and filled circle. No pastel icons, no per-item colours. Example chips become three secondary buttons in a row, wrapping on phones. Trades (thirteen of them) use the same row style in a two-column grid at every width from 360 px up, so the list stays under about 320 px tall above the message box.
- Claim cards: white, 1 px `--line`, 4 px radius, 16 px padding, 1 px rules between sections inside; the source quote is a `<blockquote>` with a 2 px left `--line` border, not a tinted box. Actions: "Accept" (primary small), "Edit" (secondary), "Leave out" (tertiary); 36 px tall, text only. Decision state is a tag, not a glyph: "Accepted", "Edited and accepted", "Not on your CV".
- Evidence sources: a plain list (`<ul>`) of three rows separated by 1 px rules, each opening with a 16 px 600 title and its tag. Every control and honesty statement in today's three cards survives inside its row: the quoted experience text; the credential's full disclaimer verbatim ("…not issued by Yoma and does not prove workplace proficiency.") and the "Include this sample achievement" checkbox; the file picker (dashed 1 px border, 4 px radius), "Use a synthetic reference letter", "Remove document" and the document-statement textarea. Only the decorative icons, tinted squares and inline styles go.
- Notices and errors: a left 4 px border (`--accent` for notices, `--error` for errors) on `--panel`, no icon, no sparkle.
- Dialog: 8 px radius, 1 px border, 32 px padding, plain backdrop. Content rewritten as "About this demo", two h3s "What works now" and "What is sample data", bullet lists instead of the 60-word sentence, then "Proposed Yoma integration" and the fine print. Keep the didx-xyz/yoma link, no arrow.
- Landing: the tilted mock-up, floating note, avatar row and trust triad are deleted. In their place, under the role list, a 1 px bordered preview of the real `.cv-paper`, static and unrotated, titled "Example of the result" (h3) and carrying the tag "Sample" with the line "Amina's sample story, Retail assistant". It is generated at render time by running the local rules in `core.js` on the Amina example so it never drifts from the template pipeline; it does not change with the role picked. On phones it sits below the form.
- CV paper: white, 1 px border, 32 px padding, headings 18 px 700 sentence case ("Experience", "Skills", "Learning and achievements"), 1 px rules between sections, 16 px body, footnote 14 px.
- Evidence record and opportunities: keep structure; opportunity items become list rows with a 1 px rule, title 16 px 600, meta 14 px, organisation logo at 32 px with a 1 px border, link text "Open on Yoma (yoma.world)" underlined.
- YoCard tiers: "Recorded by Yoma" section has a 4 px left `--recorded` border and `--recorded` tint on the heading row only; "Stated by you, not checked" has a 4 px left `--line` border. Evidence rows and confirm lines are list items with rules, not white sub-cards. The account summary becomes a two-column definition list (`<dl>`), not stat tiles. Consent box: 1 px border, no tint.
- Result screen: card image in a 1 px border; link and code in a `<dl>`; buttons stacked, one primary ("Share on WhatsApp"), others secondary; owner secret in a plain `<code>` block with a 1 px border.
- Public card page (`render.js`): the markup and section order stay; the inline CSS adopts the token values (`--accent` `#41204b`, `--ok` becomes `--recorded` `#2b6a57`, `--line` `#d9d5dc`, `--bg` `#f6f5f3`, `--ink` `#1f1a22`, `--stated` tint `#f1f0f2`), `h2` to 18 px 700 sentence case, section radius 4 px, pill buttons to 4 px radius with the WhatsApp button in `--accent` (WhatsApp is named in its label, so it needs no brand green), `.chip` to the tag pattern, bullets "●" in check results to a 14 px text list. SVG: header band `#41204b`, section labels in sentence case 700, tint rects `rx=8` using the recorded and stated tints, otherwise unchanged.

### Copy rules

Cut: ↗, →, ←, ✓, ×, ◷, ○ in text; uppercase labels; "STEP 0N /"; "Let's"; "your X, your Y"; "next chapter", "next opportunity", "journey"; triads and two-beat fragments; full stops and line breaks in headings; zero-padded numbers; interpunct chains in sentences (keep "·" only between two values, as in "Live AI · gpt-4.1-mini" and "Hairdresser · Khayelitsha").

Write: one heading per screen stating the task, sentence case, at most 65 characters, not a question; button label = verb + object naming what happens next; status as adjectives; sentences of at most 25 words.

Replacements (the builder applies the same rules to any string not listed):

| Current | New |
| --- | --- |
| "YOUR EXPERIENCE COUNTS" / "You have experience.<br>Let's put it on paper." | "Build a first CV from work you have already done" |
| "Tell us what you did." | "Describe one thing you did" |
| "Give your story context." | "Add supporting evidence" (lead: "Optional. You can build the CV from your own description alone.") |
| "STEP 04 / YOUR CLAIMS, YOUR CALL" / "Does this sound like you?" | "Check each sentence before it goes on your CV" |
| "Your experience, on paper." | "Your CV is ready to save" |
| "Build my CV →" / "Add supporting evidence →" / "Create my draft →" / "Preview my CV →" | "Continue to your experience" / "Continue to evidence" / "Write the draft" / "Preview the CV" |
| "Try Amina's story ↗" | "Load Amina's sample story" |
| "Make a work card customers can check ↗" | "Make a work card instead" |
| "Experience 01 · AI-suggested" | "Experience 1" with tag "AI-suggested" |
| "✓ Accept claim" / "× Excluded from CV" / "✓ Accepted by you" | "Accept" / "Not on your CV" / "Accepted" |
| "← Back to evidence" | "Back" |
| "Strengthen this CV on Yoma" | "Learning opportunities on Yoma for this role" |
| "A LOOK BEHIND THE DEMO" / "Useful wording.<br>Transparent sources." | "About this demo" |
| "Made for your next opportunity." (footer) | removed. YoCV footer reads "Independent student prototype. Sample data where labelled." YoCard footer keeps both of its sentences, as sentences: "Student prototype. Not operated by Yoma or UNICEF." and "Sample accounts are fictional. Cards are signed by YoCard, not by Yoma." |
| "Green is what Yoma recorded… Grey is what you say about yourself." (card review lead) | "The first block is what Yoma recorded, with a link to each record. The second is what you say about yourself, which nobody has checked." |
| "What Yoma already knows about you." | "Read your Yoma account" |
| "Tell customers what you do." | "Describe your work in one message" |
| "Two blocks. Two meanings." | "What Yoma recorded, and what you added yourself" |
| "Make it public." | "Choose what the card shows, then publish" |
| "Share it. Print it. Show it." | "Your card is public" (lead: "Share the link, print the code, or show the image.") |
| "Read this account →" / "Describe my work →" / "Draft my card →" / "Choose how to publish →" / "Publish my card →" | "Read this account" / "Continue to describe your work" / "Write the draft" / "Continue to publish" / "Publish the card" |
| "Open on Yoma ↗" / "Open the public page ↗" / "Lightcast ↗" | "Open on Yoma (yoma.world)" / "Open the public page" / "Lightcast skill entry" |
| "YoCard — A work card customers can check" (title) | "YoCard: a work card customers can check" |
| "YoCV — Your experience counts" (title) | "YoCV: a first CV from real experience" |

Toasts keep their meaning in plain sentences: "Amina's sample story is loaded. Choose a role, then continue." "Example loaded. Change it to match what you did." "Account read. Nothing is public yet." "Your card is published."

### What must not change

Listed under Constraints, plus: `generationLabel` and `generationSummary` wording in `app.js`; the privacy note; the CV footnote; the evidence record and its rejected-before-review list; the consent list text in `card.js` including "It never says verified by Yoma"; the "What this card proves, and what it does not" list; the empty-card nudge to Yoma opportunities; masked phone; WhatsApp off by default; the owner secret and withdraw.

## Documentation in scope

`presentation/demo-script.md`, `README.md` and `docs/testing-log.md` name buttons and the header pill; update every renamed label and the "green block / grey block" directions in the same change.

## Left to the builder

Exact pixel values inside the stated scales; the order of CSS rules; whether `card.css` keeps its own file or folds into `styles.css` (either, but no duplicated tokens); the wording of strings not in the table, following the copy rules; the print stylesheet details.

## Done when

- Grep finds no `↗`, `→`, `←`, `✓`, `×`, `◷`, `○` in `index.html`, `card.html`, `app.js`, `card.js` outside SVG path data and the SVG card, no `text-transform`, no `letter-spacing`, no `box-shadow` except none, no `@import`, no `font-family` other than the system stack.
- `styles.css` plus `card.css` define the twelve colour custom properties above and use no other hex except the primary hover shade; at most three radii; no font size under 14 px outside `@media print`.
- Both pages pass the Amina journey and the Thandi journey in the browser at 375 px and 1280 px with no horizontal overflow and the three mode labels ("Live AI · <model>", "Sample mode", "Sample mode (offline)") readable without truncation.
- `npm test` passes.
- Fewer than four of these ten audited tells remain on a fresh re-audit: (1) uppercase letter-spaced eyebrow and kicker labels; (2) fragment headlines with full stops, line breaks or "Let's"; (3) arrow, tick and cross glyphs in copy and buttons; (4) the tilted mock-up with skeleton bars and floating note; (5) two Google fonts in fourteen weights with negative tracking and 22 sizes; (6) untokenised CSS with about 100 hex colours, 17 radii and tinted shadows; (7) card-in-card nesting and decorative right-rail asides; (8) icons in pastel shapes, the sparkle icon and the trust triad; (9) pastel pills with status dots; (10) builder fingerprints: zero-padded step numbers, interpunct chains, the rounded-square tick logo.
