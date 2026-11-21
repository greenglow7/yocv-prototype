# YoCV: six-minute live demonstration

## Preparation

1. Put `YOVOUCH_SIM=1` in `.env`. The simulators and the `/demo` pages need it, and a gateway secret turns them off.
2. Run `node scripts/seed-demo.js`. It publishes Thandi's card and adds her three customer vouches with sample numbers.
3. Run `npm start` and open `http://127.0.0.1:4173`. Note the mode label in the header: **Live AI · <model>** or **Sample mode**. Say which one you are in.
4. Open a second tab on `http://127.0.0.1:4173/demo/cv-rejected`, the prepared refused suggestion.
5. Keep these `.env` lines ready for the live-model switch. The first choice is Claude: it needs only a key, and `effort` is set low for the 20 s deadline. It has not been run live on the build laptop, so rehearse it as described below. The banner then reads **Live AI · claude-haiku-5-5**.

```
MODEL_PROVIDER=anthropic
ANTHROPIC_API_KEY=<key>
ANTHROPIC_MODEL=claude-haiku-5-5
```

   The alternative is the Ollama switch, from the local model block in `.env.example`, with `ollama serve` running and the model pulled. The Ollama beat is unverified on the build laptop: the only model run there, `qwen3.5:9b`, timed out at the adapter's fixed 20 s (testing log rows 8 and 9), and `qwen2.5:3b-instruct` was never pulled. The model must answer inside 20 s, so it needs an instruct model with no reasoning pass. Rehearse whichever configuration you use before the demo: start the server with its lines, open the app, run one entry through **Continue to review** (or `POST /api/cv/review` once) and keep the server up only if the banner reads **Live AI** and a line comes back. If it does not, drop the beat and show a saved evidence record instead: the `json_object` and `json_schema` runs of Thandi's entry under `reports/2026-11-19-task-20-live-runs/`, which name the provider and the model.

```
MODEL_PROVIDER=openai
OPENAI_BASE_URL=http://localhost:11434/v1
OPENAI_API_KEY=ollama
OPENAI_MODEL=qwen2.5:3b-instruct
OPENAI_STRUCTURED_OUTPUT=json_object
```

6. Keep a clone of Yoma's public code open on `src/web/src/pages/yoid/index.tsx`, and this repository's `integration/yoma/README.md` beside it.

## 0:00 to 0:45: Thandi's Yoma record

**Do:** pick **Thandi Mokoena**, a fictional sample account. Show her Yoma record. Tick two completions, **Hair Styling: Blow-Dry, Cut, and Colour Like a Pro** and **Customer Care Skills and Telephone Etiquette**, and their two credentials. Choose **Hairdresser**.

**Say:** "This is a sample account. The CV is built from what Yoma records: completed opportunities and the credentials in the wallet. Nothing in the record can be edited here."

## 0:45 to 1:45: Her work in her own words

**Do:** answer the six questions for **Braiding at home** in Khayelitsha. What she did: *I braid hair at home for women in my street, mostly box braids and cornrows.* For whom: **customers**. How often: **a few times a week**, since March 2025. The number: **about 40 customers a week**. What was better: *Most of them come back every month.* Who could confirm it: **a vouch on my YoCard**. Click **Continue to review**.

**Say:** "Her name, her phone and her town never go to the model. Names in her answers are masked before the call."

## 1:45 to 2:45: The bullet next to her words, and the refused one

**Do:** on Review, show the model's bullet next to her answer, with **about 40 customers a week** highlighted. Switch to the `/demo/cv-rejected` tab: a suggestion that tried **over 50** customers a week, refused as `invented_number`, and the template wording shown instead.

**Say:** "Every line is checked against her own words. A number she did not give is refused, and the refusal is recorded. The refused example is prepared, not a live call, and it runs through the same checks."

## 2:45 to 3:30: Skills and their evidence

**Do:** show the skills list. Point at **Confirmed from Yoma** on Customer Service, from her completion. Point at the hairdressing skill carrying **Vouched by a customer, confirmed by them, not by Yoma**, from her YoCard vouches.

**Say:** "Each skill names its evidence. A skill is never confirmed on the strength of her own words. Nothing here says Yoma verified anything."

## 3:30 to 4:30: The profile line, the CV and the evidence record

**Do:** accept the lines and the skills, then accept the profile line. Click **Continue to your CV** and **Print or save as PDF**. Then **Download evidence record (HTML)** and open it.

**Say:** "Nothing reaches the CV without an Accept. The sample account carries one small footer line on the paper. The evidence record keeps her answers, every suggestion, every refusal and the model that wrote them."

## 4:30 to 5:30: The same entry on a live model

**Do:** only if the rehearsal in Preparation step 5 passed: stop the server, add the Claude lines to `.env` so `MODEL_PROVIDER` is `anthropic`, and run `npm start` again. Repeat the one entry. Show the banner, **Live AI · claude-haiku-5-5**, and the evidence record naming provider `anthropic` and the model. With the Ollama alternative instead, `MODEL_PROVIDER` is `openai`, the banner reads **Live AI · <the model you pulled>** and the evidence record names provider `openai-compatible` and the local model. Otherwise open a saved evidence record from `reports/2026-11-19-task-20-live-runs/` and say it was recorded earlier, on this laptop, with the deadline raised.

**Say:** "The model sits behind one interface. Azure, Claude, any OpenAI-compatible server or a model on this laptop. The checks do not change."

## 5:30 to 6:00: Where it goes in Yoma

**Do:** open `integration/yoma/README.md` on the tile line, beside Yoma's dashboard code in `src/web/src/pages/yoid/index.tsx`, where the CV tile is a static note that says it is coming soon.

**Say:** "The integration pack follows Yoma's own patterns. It shows where this CV replaces the coming soon tile. Not operated by Yoma or UNICEF."

If the model call fails live (the app shows `provider_timeout` or "The server did not answer in time"): take the Claude or Ollama lines out of `.env`, restart in sample mode, say which mode the label shows, and show a saved evidence record from `reports/` for the live beat. The checks are the same in both modes.

---

# YoCard — three-minute live demonstration

Before presenting: `npm start`, open `http://127.0.0.1:4173/card.html`. Have a second phone or a second browser window ready for the customer view.

## 0:00–0:25 — Why a card

**Show:** the YoCard connect screen.

**Say:** "About 96 percent of employed young people in sub-Saharan Africa work informally. They find customers on WhatsApp, not with CVs. So we pivoted: YoCard turns what a worker already has on Yoma into a card a customer can check. The hard constraint we found in Yoma's code is that there is no third-party verification endpoint today, so this card never says 'verified by Yoma'. It says what Yoma's account recorded and when."

## 0:25–0:55 — Connect and describe

**Do:** pick **Thandi Mokoena** (fictional), click **Read this account**. Point at Yo-ID, phone confirmed "(not an ID check)", three completions. Click **Continue to describe your work**, keep **Hairdresser**, paste: *I do braids, cornrows and relaxing in Khayelitsha, R150 to R400. Monday to Saturday, 8am to 6pm. I come to your home. Mobile money accepted. I speak isiXhosa and English.* Click **Write the draft**.

**Say:** "Only that message goes to the AI. Her name and phone never do."

## 0:55–1:35 — Two blocks, two meanings

**Do:** on the review screen, point to the first block, **Confirmed from Yoma** (green left border): each completion shows the organisation, the date, and what the organisation checked (file upload or automatic), with a link to the live yoma.world page. Point to the second block, **Stated by Thandi, not checked**, with the parsed services and prices. Turn on the WhatsApp button and read the "Who can see this" line.

**Say:** "The first block is rendered from data; the model never touches it. The plain-language lines each cite the record they come from, and any line that cannot cite one is dropped. The second block is her own words. Prices must appear in her message; the block cannot claim certifications or name organisations."

## 1:35–2:10 — Publish and share

**Do:** click **Continue to publish**, read the consent list, tick, **Publish the card**. Show the card image, the QR, the code. Click **Share on WhatsApp** or **Open the public page** on the second device.

**Say:** "The record is signed by YoCard so a customer can tell it was not edited after publishing. Not signed by Yoma; we are explicit about that. The QR is generated in our code and scans with any camera."

## 2:10–2:40 — The customer's view

**Do:** on the public page, point to "Read from Thandi's Yoma account on <date>", tap **Check now**, show the green signals and the timestamp, tap a completion to land on yoma.world, show the masked number and the WhatsApp button, and the "Never pay before the work is done" line.

**Say:** "No app, no login, under 40 KB, works with JavaScript off. The customer can re-check, open the real programme page, and message only the number Yoma confirmed."

## 2:40–3:00 — What is real and what is next

**Say:** "Real: the live Yoma opportunity data, the signature, the QR, the grounding checks. Sample: the accounts, because reading a real account needs a Yoma-issued sign-in client. Next: that client, a Yoma-side consented card endpoint so the signature is Yoma's, and the didx:me presentation flow once production moves to SD-JWT."

## Short answers

- **Is this verified by Yoma?** No. It is a consented read of account data, labelled with the time it was read, plus links to live Yoma pages. The signature is ours.
- **Can a scammer copy the card?** The image proves nothing and says so. The page is on our domain, the WhatsApp button goes only to the confirmed number, and the code on the image must match the page. Real protection needs hosting under yoma.world.
- **What about minors?** Adults only, from the self-declared date of birth; a policy line, not a control. Flagged for UNICEF safeguarding review.
- **What happens with no completions?** The card still shows Yo-ID and confirmed phone, and the page links to opportunities for the trade on Yoma.

---

# YoVouch: ten-minute demonstration for a Yoma audience

Six beats, two phones and a laptop on the same Wi-Fi (spec section 14). Say the mode out loud at the start: sample mode or live model.

## Preparation

1. On the laptop, set `HOST=0.0.0.0`, `YOCARD_PUBLIC_URL` to the laptop's LAN address (for example `http://192.168.1.20:4173`) and `YOVOUCH_SIM=1`. Leave `YOVOUCH_GATEWAY_SECRET` unset, or the simulator routes are not mounted.
2. Run `node scripts/seed-demo.js`. It prints the `/my` link of every prepared card (Thandi, Sipho, Bongani, Amara, Ayo, Bola, Chidi) and the id of the inbox reply. Keep that output open.
3. Run `npm start`.
4. Five minutes before beat 2, run `node scripts/seed-demo.js --old-code`. It writes `data/cards/demo-old-code.svg`, Thandi's QR three steps back, captioned with the time it was made. This run seeds a fresh set of cards and its `demo.json` replaces the first one, so use the `/my` links this run prints from here on. Open the SVG on the laptop. It is never served by the app. A code can live 180 seconds, so the screenshot must be at least three minutes old when it is scanned.
5. Open these tabs: `/demo/inbox`, `/thread.html`, `/demo/phone`, `/demo/ivr`, `/demo/beat3`, Thandi's `/my` link on the worker phone, and the README ladder.

Fallbacks: if the microphone fails, use the typed path and say so. If there is no model key, the pages say `Sample mode: template extraction, no model call`; say it too.

## Beat 1: the employer's side first (two minutes)

**Do:** open `/demo/inbox`. Show the contractor's post and the forty "I'm interested" replies: two with an ID photo, one asking for transport money. Scroll to the one six-line reply. Open its card link on a phone. Show the vouched tier and play the clip.

**Say:** "A vouch on a card nobody forwards does nothing. This reply is what put it in front of the contractor."

## Beat 2: the rotating code (two minutes)

**Do:** on the worker phone, open Thandi's `/my` page and let the audience see the code change. On the customer phone, scan it, answer 18 or older, tap the chips, type a few words, then bind a phone: text `YES <session code>` from `/demo/phone`. Read the line back and publish. Reload the card page: the new chips line shows with its label and no words yet. On the worker phone, tap `Show words and clip`. Reload the card page: the words appear.

**Say:** "The number label says exactly what happened. The words appeared only after Thandi read them."

**Do:** scan the prepared old-code screenshot: `This code is older than 3 minutes`. Scan the live code twice: `This code was already used.`

## Beat 3: the grounding validator (one and a half minutes)

**Do:** in `/thread.html`, as Thandi, in template mode, type "I did braids for 10 years, I can start Monday." Line 2 reads `Experience: braids for 10 years (stated by Thandi, not checked)` and line 4 `Available: I can start Monday (stated by Thandi)`.

**Say:** "The worker's own number is theirs, and the label says nobody checked it."

**Do:** with a live model, type "I am a certified braider, I worked for Alison, I can start Monday." Line 2 comes back `not stated`, with `asserts_credential` and `organisation_name` in the rejected list. Then open `/demo/beat3`: the prepared output where the model added "5 years", refused as `invented_number`. It is labelled as a prepared example, not a live call.

**Say:** "Nothing the worker did not say, and nothing Yoma did not record, reaches the employer. What the worker did say reaches it labelled as theirs."

## Beat 4: the feature-phone path (two minutes)

**Do:** in `/demo/phone`, as Sipho, text `CODE`. The reply gives his card number and a spoken code. As the customer, text `VOUCH <card number> <code>`, then the answers `1 1 2 1`, a name, then `YES`. Show the new line with `code matched by SMS`. Then open `/demo/ivr` and answer one question on the keypad.

**Say:** "No data, no smartphone. Every screen here says `Simulated SMS. No message was sent.` or `Simulated call-back`."

## Beat 5: honesty and the graph (one and a half minutes)

**Do:** show the fine print under the tier and the limits statement. Show a reciprocal pair with `Vouched for each other`, and Bola's card from the prepared triangle with `Part of a group that vouched for each other`. Withdraw a vouch from the customer phone. Open `/v/<id>.json` and verify it against the JWKS, with `sub` equal to the vouch id. Close on the README ladder with the three new rows.

**Say:** "Signed by YoCard, not by Yoma."

## Beat 6: what is real and what is not (one minute)

**Do:** put the real-versus-simulated table from the README on screen and read it aloud.

**Say:** "Real: the code, the validation, the signatures, the checks, the page and the reply. Simulated: WhatsApp, SMS, the call and the phone binding, and the labels say so on every demo line. The organisation is fictional, Sample Skills Trust, with a demo key. In sample mode the model is simulated too."
