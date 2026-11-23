# How Yoma's web app looks: a reference for the YoID shell

Date: 2026-11-22. Source: a read of the public Yoma monorepo's web app (Next.js, Tailwind v4, daisyUI) and the live site. Nothing here is copied code; these are measurements, colours and wording a designer needs to recreate the look in plain HTML and CSS. The GPL repository stays read-only (AGENTS.md).

## The frame

- Body background white; the page area `#f3f6fa` (gray-light), full height, content centred in a 1280 px column with 16 px side padding.
- Body text Open Sans 16 px / 1.5. Nunito, weight 800 to 900, for navigation links, drawer rows, buttons, breadcrumbs, section and list headings, empty-state titles and dialog headings. Headings use tight letter spacing in Yoma; this repo's restyle rules forbid `letter-spacing`, so weight and size carry it.
- Type scale: 12, 14, 16, 20, 24, 30, 36, 42 px. Components also use 13 and 15 px. This repo keeps a 14 px floor on screen.
- Shadow for content cards (`shadow-custom`): `0 2px 15px -3px rgba(0,0,0,.07), 0 10px 20px -2px rgba(0,0,0,.04)`.
- Radii: section disclosure cards 18 px; content cards, empty states and icon squares 12 px; action buttons inside cards 8 px; pills, chips and primary buttons fully round; type chips 4 px.

## Colours

- Purple `#41204b`: top bar, hero band, user-drawer banner, primary. Purple-soft `#c3a2cd` for the hero sub-line; purple-tint `#e7d4ed` for the Passport icon square.
- Green `#387f6a`: every text link, current and hovered pills, primary buttons in dialogs, info icons. Green-light `#e6f5f3`: skill chips, Verified and Completed badges.
- Orange `#f9ab3e`: the first name in the greeting, the time-of-day icon, the Opportunities rings. Orange-light `#fdeed8`: the Wallet icon square; yellow `#d48414` its icon.
- Blue-light `#edf6fd` and blue-dark `#2487c5`: the Opportunities icon square.
- Grays: gray-light `#f3f6fa` page and selected rows; gray `#dce0e5` hairline borders; gray-dark `#545859` secondary text; black `#020304` titles.
- Credential type colours: Learning `#007cb4`, YoID Identity `#a3195b`, Job `#cc473d`, Impact Action `#23836a`, Event `#391350`, Entrepreneurship `#a66700`, Default `#5a6675`.

## Top bar

Fixed, 80 px tall, purple, a light shadow. Left: a hamburger (32 px, white) that opens a left drawer; then the logo at 85 px wide (white on purple). Centre, from 640 px up: Nunito semibold white links, 16 px side padding: Home, About Us, Opportunities, Marketplace, Refer a friend. Right: a language switcher, then a 44 px round avatar with a white outline (a photo, or initials in white on a colour hashed from the name). Signed out, a round "Login" button in the theme colour replaces the avatar.

Left drawer: white, 20 rem wide, rounded right corners; header with the dark logo and a round close button; rows 44 px tall, Nunito 15 px semibold, 20 px icon, the current row on gray-light; sections separated by hairlines; a small footer at the bottom.

User menu drawer (from the right, 22 rem, gray-light): a purple band with a faint world map, an 80 px avatar with a 2 px white outline, the name in white semibold, "Verified" with a green check when applicable, two white pills Profile and Settings; below, the same section cards as the Overview, then a small full-width Sign out.

## The YoID area

Hero band: full width, purple, padding 16 px sides, 80 px top (96 from 768 px) to clear the bar, 16 px bottom; a faint world map at 10% opacity. Inside, centred: an h1 in white, 24 px (30 from 768 px), semibold, starting with an orange time-of-day icon and reading "Good morning, Thandi" with the first name in orange and no exclamation mark; beside it a 20 px info button "What is Yo-ID?". Under it one soft lilac 14 px line such as "Open Passport to see your credentials" or "Find a new opportunity".

Tabs under the greeting: pills in a row, centred, scrolling sideways on phones. Pill: inline-flex, fully round, 1 px border, 12 px side padding, 12 px semibold text (14 px here), a 16 px icon, min height 36 px. Idle: white, black text, gray border; hover: green fill, white text. Current: green fill and border, white text. Order and wording: Overview (/yoid, "Your wallet, passport, skills and opportunities in one place."), Wallet (/yoid/wallet, "ZLTO you earn by completing opportunities — spend it in the marketplace."), Passport (/yoid/passport, "Verified credentials for every opportunity you complete."), Opportunities (/yoid/opportunities/completed, "What you've completed, submitted, had declined or saved for later."), Skills (/yoid/skills, "Skills you've earned by completing opportunities."). The site shows them with emoji in front: 💳 Overview, 💸 Wallet, 🌐 Passport, 🏆 Opportunities, ⚡ Skills.

Content area: the 1280 px column, 16 px padding, cards stacked with 16 px gaps on the gray-light page.

Signed out, the YoID page shows one white card: a life-ring icon in a tinted circle, "Welcome Back!", "This content is just a click away." / "Please login to continue your journey with Yoma.", and a round green Login button.

## Overview (dashboard)

A grid: one column on phones, two from 1024 px, 12 px gap. Order: Wallet, Passport, Opportunities, Skills, then a CV row spanning both columns.

Section card: white, 1 px gray border, 18 px radius, no shadow; hover border darker. Header row: 20 px side padding, 18 px top and bottom; a 40 px icon square with 12 px radius in a tint (Wallet gold: orange-light with a yellow icon; Passport lilac; Opportunities blue; Skills green; CV gray with a gray-dark icon), a 15 px extra-bold black title optionally followed by " · {count}" in gray-dark normal weight, a gray-dark 14 px preview at most two lines when closed, a 13 px note when open, and a 16 px chevron on the right that turns 90° when open. The body indents under the title from 768 px (74 px left padding).

- Wallet preview: "{a} available · {p} pending · {t} total", or "Wallet being set up · {p} pending", or "Your ZLTO rewards". Body: a ledger of label and value rows (Balance, Pending cash out, Available, Pending rewards, Total) with a 16 px coin icon per value; a Cash Out button; links "Open Wallet" and "What is ZLTO?". Empty: "No ZLTO yet" / "Earn ZLTO by completing opportunities, then spend it in the marketplace." Pending wallet copy: "Your wallet is still being set up" / "It usually takes less than 24 hours. Any ZLTO you earn in the meantime is safe and will show here once it is ready."
- Passport: count beside the title; preview like "1 YoID Identity · 3 Learning"; body: white pills with a 10 px coloured dot, label and count; then "Open Passport". Empty: "No credentials yet" / "Complete an opportunity to get a verified credential: proof of what you did."
- Opportunities: preview "{n} completed · {n} pending · {n} declined · {n} saved"; body: four circles (2 by 2 on phones, one row from 640 px, each at most 96 px) with a green fill, a 2 px orange border and an orange/green ring showing the share, a white icon, the count in 14 px semibold and the label at 11 px (14 here); then "Open Opportunities". Empty: "No opportunities yet" / "Save one for later or complete one, and it shows up here."
- Skills: count; preview lists the first three names joined with " · "; body: up to eight chips, green-light with green text, fully round, 12 px side padding, 13 px bold; then "Open Skills". Empty: "No skills yet" / "Each opportunity you complete adds the skills it taught you."
- CV (today): a static row, gray tone, document icon, title "CV", note "A CV built from your Yo-ID — coming soon.", spanning both columns.
- Section links: green, 12 to 14 px, semibold, "Open {Label}" with an arrow icon.

## Tab pages

Each starts with a breadcrumb "Yo-ID › {Tab}" in Nunito bold black, 12 to 16 px, optionally followed by a gray count, and an intro card: white, custom shadow, 12 px radius, 16 px padding, 14 px text, a 20 px green info icon at the left; links inside green, semibold, underlined. Page empty state: a white card, 24 px side and 40 px vertical padding, centred, a 56 px tinted circle with a 28 px icon, an h2 in Nunito 20 px black weight, a gray-dark 14 px line, a green action link with an arrow.

- Passport intro: "Verified credentials for every opportunity you complete. A new credential can take up to 24 hours to appear." Type filter pills "All {n}" then one per type with a coloured dot. Sections per type headed by a Nunito black heading with a 12 px dot, the label and a count, and "See all {n}" at the right. Grid: 1 column below 600 px, 2 from 600, 3 from 900, 4 from 1200, 16 px gap. Credential card: white, custom shadow, 12 px radius; a top band 48 px (80 from 768 px) tinted with the type colour at 10% holding the issuer logo in a white circle (36, then 48 px); body with 12 px padding: a type chip (solid type colour, white, 10 px bold, 4 px radius) and a status pill on the right (Verified green-light/green, Unverified gray-light/gray-dark); title 14 to 16 px semibold, two lines; issuer 12 px semibold; "Issued DD MMM YYYY" 12 px gray-dark; a "View credential" button in the type colour, 40 px tall, 8 px radius. Credential dialog: a header band in the type colour, the issuer logo, the title, a rounded type pill, a gray-light details box with rows Status, Issuer, Artifact Type, Date Issued, Schema Type, and an outline purple Close button.
- Skills intro: "Skills you've earned by completing opportunities. Find opportunities to earn more." Grid 2 columns, 3 from 600, 4 from 900, 12 px gap. Skill tile: white, custom shadow, 12 px radius, 12 px padding; the name 14 to 16 px semibold; a row "Skill issued by N partner(s)" in 12 px gray-dark with overlapping 24 px round organisation logos.
- Wallet: breadcrumb; a two-column grid from 1024 px: a disclosure card "My Wallet" with the note "Your ZLTO balance and what's on its way." and a card "How ZLTO works" ("Earn it, then spend it.") with three green-icon bullets: "Every verified opportunity pays the ZLTO shown on its page.", "Pending rewards arrive within 24 hours.", "Spend it in the marketplace; purchases appear under My Products."; then a "My Products" heading.
- Opportunities: intro "Just completed an opportunity? Add it to your Yo-ID"; sub-tab pills Completed, Pending, Declined, Saved with counts; cards like credential cards with a status badge (Completed green-light/green, Pending yellow, Declined red), optional "Skills developed" chips and a "View opportunity" button in the type colour.

## Footer

White, 16 px padding; a row from 768 px. Left, gray-dark 12 to 14 px: "© 2026 Yoma. All Rights Reserved" and green semibold links Terms of Service, Privacy Policy, help@yoma.world. Right: 24 px gray social icons and the dark logo at 85 px.

## Copy voice

Short, friendly, second person: "No skills yet", "Each opportunity you complete adds the skills it taught you.", "Open Passport", "Find opportunities". The CV is mentioned across the site as a promise: "A CV built from your Yo-ID — coming soon.", "Skills from your completions add up here — and a digital CV is coming soon.", "Once approved, a credential is added to your Yo-ID Passport and the opportunity to your CV."

## Assets

Yoma's logos are WebP and PNG files, the favicon a PNG, the hero decoration a world map and two passport stamps. None of them are used here: this repository draws no Yoma logo, favicon or mascot (family-look spec, 2026-11-15); the wordmark is plain text.
