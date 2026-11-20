# YoCV iteration: a credential-first, professional CV with a swappable model, and the Yoma integration pack

Date: 2026-11-19. Status: revised after a builder check and a fact check; awaiting the owner's approval. Written after a read of the public Yoma monorepo (didx-xyz/yoma, commit 1e7c9fc, 2026-11-18), a review of YoCard and YoVouch against the fifth-prototype brief, and a research pass on CV formats, RapidPro and PathFinder.

Marks: **(owner's call)** was decided by the owner in the chat; **(our call)** is a decision made here that the owner can overturn while reading; **(owner to decide)** is open and listed in section 14.

## 1. Intent and the why

The Yoma team's feedback on YoCV says three things. Non-formal credentials are Yoma's main value: the team heard privately that bundling micro-credentials and linking them toward formal ones is the point. The CV must look professional and come from a template, and it must make a person's own words stronger without making them untrue. And the work should merge with Yoma's own codebase and sit beside their WhatsApp sandbox and YoID mobile prototype rather than stand apart. The team also asked to see, by the end, how an LLM plugs into the Yoma codebase with the model swappable, so it could run on a locally hosted instance. (The sandbox and the mobile prototype are known only from the team's words; nothing public describes them.)

Today YoCV starts from a story, carries one representative sample credential as a footnote, and prints "Demonstration record" under the CV. It has a good grounding layer (every claim must quote the person, no invented numbers, no credential assertions, skills only from Yoma's taxonomy) and a provider layer that already speaks Azure OpenAI and any OpenAI-compatible endpoint. This iteration keeps that layer and rebuilds what sits around it.

## 2. Goals, non-goals, anti-goals

Goals:

1. A CV that starts from the person's Yoma record (completed opportunities, the skills they carry, the credentials in the wallet) and adds the informal work the person describes.
2. An interview built on the XYZ idea (what you did, for whom, how often and for how long, a number you stand behind, what got better, who could confirm it) whose answers the model turns into professional sentences.
3. One professional template: one column, one page, standard headings, system font, with the fields the research found employers in South Africa, Kenya and Nigeria do not want left out by default and the optional ones available.
4. A written and enforced methodology for how evidence combines into a skill line, with rules against double counting and against inflation.
5. The model behind one interface with two working configurations, Azure OpenAI and a self-hosted OpenAI-compatible endpoint (Ollama or vLLM), switched by one configuration variable and demonstrated live with both when a key and a local model are available.
6. An integration pack that shows, in Yoma's own patterns and file layout, where this plugs into their API and web app, written so it can be opened as a pull request on their repository.
7. One JSON endpoint a RapidPro flow can call from a `call_webhook` node, returning a draft the person must still confirm.

Non-goals: a WhatsApp bot of our own; Yoma sign-in or Keycloak; a claim that any micro-credential equals a diploma, degree or trade test; compiling or running Yoma's .NET and Next.js code end to end here (a compile of the C# client is a stretch, section 9); any change to YoCard or YoVouch behaviour (a shared adapter improvement in section 8 is allowed because it changes no output).

Anti-goals, which would make this a failure even if it worked: a CV sentence containing a number, employer, date or outcome the person did not give; a skill shown as confirmed on the strength of the person's own words; a credential described as a qualification; a page the person could not print and hand to a shop owner with a straight face; any wording that reads as issued or verified by Yoma; a fictional sample account printed as if it were a real person's record.

## 3. Constraints

- Buildless HTML, CSS and JavaScript; Node 20 built-ins only; no npm packages; tests first; the suite stays green.
- Honesty strings. The sample or live mode label stays in the app chrome and in the evidence record. "Not operated by Yoma or UNICEF" is added to the YoCV footer and About dialog, which today say "Independent student prototype" and "No UNICEF or Yoma endorsement is implied"; the YoCard wording is reused. The phrase "verified by Yoma" never appears anywhere (existing rule, `server/card/draft.js` and the honesty test helper). The CV paper **(owner's call)** carries one small footer line in sample mode, `Sample account: fictional, for demonstration`, and no footer at all when the record was read from a real account with a token; the mode label and the full notice stay in the app and the evidence record.
- Privacy: name, email, phone and town never go to the model. The free-text interview answers can contain a person's or a business's name or a place, so before the model call capitalised words that are not sentence-initial, not the role and not in the verb list are replaced by `[name]` placeholders and restored after, the same technique YoVouch uses for translation. What goes: the role, the masked answers, the credential and opportunity titles.
- No real Yoma account: the person's record comes from the sample account source YoCard uses (`server/card/account.js`, personas in `server/card/personas.json`) for completions and skills, with the `YOMA_ACCESS_TOKEN` path left open. Wallet credentials do not exist in that source today; section 5 adds per-persona sample credentials on Yoma's wallet model.
- The Yoma repository is GPL-3.0 and read only. Nothing is copied from it. The files written for the integration pack follow its patterns; `integration/yoma/LICENSE-NOTE.md` says they are offered under GPL-3.0 for contribution to Yoma while this repository as a whole stays MIT.
- Yoma's rules for contributions (their `AGENTS.md`): new third-party integrations get their own `Yoma.Core.Infrastructure.<Name>` project; controllers in Api, logic in Domain, external services behind Infrastructure interfaces; ask before adding dependencies; agents ask before commit, push or PR; `helm/`, CI and secrets are not touched. Real people's names are not written into docs here; the pack names the API owner and the web owner by role.

## 4. Approaches considered

1. **Reference service here plus a Yoma integration pack.** Rebuild YoCV in this repo, keep the swappable provider here and demonstrate it with Azure and a local model, and write the Yoma-side integration as source files and a `docs/work` epic in their templates. Everything demonstrable runs here. **Picked (owner's call).**
2. **Implement inside a Yoma fork.** Highest fidelity, but running it needs .NET 10, PostgreSQL, Keycloak and their private settings; it could be compiled and unit-tested here, never shown end to end.
3. **RapidPro first.** YoCV as a webhook only, the WhatsApp flow as the interface. Fits the sandbox but drops the professional CV page and designs against a flow nobody here has seen.

Approach 1 includes one endpoint shaped for approach 3 (section 8) and, as a stretch, the compiled client from approach 2 (section 9).

## 5. The flow

Four steps replace the current five. The old story flow (the sample story button, the landing preview, `POST /api/generate` and its role-only skill menu) is replaced, not kept beside the new one **(owner's call)**; its routes and tests go. The offline browser fallback is carried over: with the server unreachable, the interview, the template wording and the checks run in the browser from `core.js`, labelled sample mode (offline), as today. The live Yoma learning-opportunities list stays on the CV step.

**Step 1, Your Yoma record.** Pick a sample account (the same picker YoCard uses; a real account when a token is set). Then choose the target role **(our call)**: the list is the three existing YoCV roles plus the trades YoCard already knows (hairdresser, tailor, general labourer, driver, nail technician and the rest of `data/vouch-chips.json`), each with a skill menu in `data/role-skills.json` checked against Yoma's taxonomy the way the three existing ones were. The page shows what Yoma holds under the heading `Confirmed from Yoma`: completed opportunities with their organisation, the skills each carries, the credentials in the wallet (title, issuer, date), and self-attested skills if any. The person ticks what to include. Nothing here is editable.

Per-persona sample credentials **(our call)**: `server/card/personas.json` gains a `credentials` array per persona, built on Yoma's wallet model (`SSICredentialBase` with `attributes`, and skills in `itemsDisplay`, never parsed from `valueDisplay`), one per completed opportunity, issuer set to the opportunity's organisation, never to Yoma. `data/sample-credential.json` is retired. Token mode reads the wallet through Yoma's search endpoint when SSI is enabled for that environment, and shows "Wallet not available" otherwise.

**Step 2, Your work.** Up to three entries. Each entry opens with a title line (the work in two or three words, such as "Braiding at home" or "Family shop") and a place (town or area, optional), then the interview, one question per screen on a phone, one card on a desktop:

1. What did you do? (free text, 20 to 400 characters; the person's words are the source quote)
2. For whom, or where? (chips: customers, a family business, a household, a community group, an employer; plus optional free text)
3. How often, and for how long? (chips: daily, a few times a week, weekly, now and then; start and end month)
4. A number you can stand behind (optional): a count, a unit chip (customers a day, customers a week, items, people, trips, rand or shillings a week) and a hedge chip (exactly, about, at least)
5. What was better because of you? (free text, optional)
6. Who could confirm this? (chips: no one, a person I can name, a Yoma completion, a vouch on my YoCard). "A Yoma completion" opens a picker of the completions ticked in Step 1 and links the entry to one; the link is recorded and shown in the record. It never changes a skill's level (section 6).

Contact details (phone, email, town) and an optional Education line are collected once at the end of Step 2 in a short form, prefilled from the account where the record has them (the sample personas carry phone and city, never email). They are stored for the template only and never sent to the model.

**Step 3, Review.** For each entry the model (or the template in sample mode) proposes one to two bullets. The card shows the person's own answer and the proposed sentence side by side, with the number highlighted and the hedge kept ("about 40 customers a week"). Buttons: Accept, Edit, Leave out. The profile line (section 10) is proposed here too and needs its own Accept. Below the entries, the proposed skills (section 6) with their evidence label. The person can add a skill from the role's menu by hand; it then carries the `Self-stated` label. Nothing reaches the CV without an Accept.

**Step 4, Your CV.** The template (section 10), Print or save as PDF, Download text, Download evidence record (HTML and JSON). The record names the generation mode, every source quote, every rejected suggestion, the label and all sources of every skill, and the linked completion of each entry.

## 6. The evidence methodology for skills

This is the written answer to "how do we combine skills from informal work without overstating". It is enforced in code (`server/cv/skills.js`, new) and tested.

Sources, from strongest to weakest. Labels reuse the wording the repo already has; none says "verified by Yoma".

| Level | Source | Where it comes from | Label on the CV and in the record |
| --- | --- | --- | --- |
| S1 | Recorded on Yoma | A skill on a completed, verified opportunity or in a wallet credential (Yoma's `UserSkillType.Verified`; credential `itemsDisplay`) | `Confirmed from Yoma` |
| S2 | Vouched | A chip on a live, shown YoVouch line on this person's YoCard that maps to a Yoma skill (6.2) | `Vouched by a customer, confirmed by them, not by Yoma` or `Vouched by another worker, confirmed by them, not by Yoma`; a referral line reads `Referred by <organisation>, confirmed by them, not by Yoma` |
| S3 | Shown in your work | A skill the model proposed from an interview answer, with a quote from that answer that passes the quote check | `From your own account` |
| S4 | Self-stated | A skill the person added by hand, or a Yoma self-attested skill | `Self-stated` |

Rules:

1. A skill appears on the CV only with at least one source. The label shown is the strongest source. All sources are listed in the record.
2. The skills list is the union of all evidence, not a role filter: a Yoma-recorded skill outside the role menu (Cosmetics on a retail CV) still appears, because Yoma recorded it. Model-proposed and hand-added skills must be on the role's menu.
3. No double counting: one credential supports a skill once, however many attributes repeat it; one vouch counts once per vouch id; one interview entry supports a skill once.
4. No promotion by volume: three S3 sources do not make an S2. Only a Yoma record or a vouch moves a skill up.
5. No inflation words. `certified`, `qualified`, `licensed`, `verified`, `expert`, `proficient`, `professional`, `advanced` are refused in any bullet, skill or profile line the model or the person writes; the existing `noBannedClaims` list already refuses most of them and stays shared and unchanged. A credential or completion title that contains such a word is printed as a title in the `Confirmed from Yoma` section, which is the only place it can appear. `managed`, `led`, `ran`, `owned`, `supervised`, `trained` are refused unless the person's own answer contains the word or a form of it. These two lists live in a new `server/cv/validate.js` (`INFLATION`, `ROLE_UPGRADE`), so the shared validators that YoCard and YoVouch use are not touched.
6. A credential is listed as what it is, a completed learning opportunity or an issued credential, with the issuer and month. It is never called a qualification. **(our call)** The link toward formal qualifications stops at the skill: each credential lists the Yoma skills it carries, and the skills section shows which are recorded on Yoma. A mapping from micro-credentials to national frameworks or trade tests is not built, because Yoma publishes none and inventing one would be the exact overstatement the team warned against. Section 14 lists it as a question for Yoma.
7. The CV prints skills in one list, strongest first, each followed by its label in plain text in parentheses, so an employer can read it and a parser keeps it.

6.2 Vouch chips to skills **(our call, only when the account has a published card)**: a new `data/chip-skills.json` maps each chip in `data/vouch-chips.json` to zero or more Yoma skill names (for Braids, the taxonomy's hairdressing skill; for Paving, the construction labour skill; a chip with no sensible Yoma skill maps to none and contributes nothing). A vouch contributes a skill only when it is live and not hidden, and only for the newest live card published from the same account (sample persona id, or user id in token mode). Organisation referrals contribute with the referral label. YoCV reads the card and vouch stores read-only through the existing store modules; it never writes to them.

## 7. Making words stronger without inventing

The model receives, per entry, the title, the six fields (names masked, section 3) and the target role, and returns structured output: one or two bullets, each with `text`, `usedNumbers` (every number it wrote, digits or words) and `sourceFields` (which fields it drew on). The system prompt states the rules below and gives two examples. The template provider builds the same shape deterministically: it keeps the person's "what" clause as written after dropping a leading "I" or "I was", prefixes it with the matching verb from the verb list when the clause has none, then adds `for <whom>` when chosen, `<frequency> from <start month> to <end month>` from the chips and months, `, <hedge> <number> <unit>` when a number exists, and `; <outcome>` when one exists. A template sentence longer than 180 characters drops the outcome first, then the frequency, and is never shown over the limit.

Checks on every bullet and on the profile line, before the person sees it, in `server/cv/validate.js`:

1. Numbers. Every number in `text`, whether digits or an English number word from zero to one hundred and the tens to one thousand, appears in the interview fields or is a month or year the person chose. The person's own hedge is kept before it. Reasons `invented_number`, `hedge_dropped`.
2. Names and places. Every capitalised word in `text` that is not sentence-initial, not the role and not a month appears in the fields. Because names were masked on the way in, a placeholder that comes back is restored; a new proper noun is refused. Reason `invented_name`.
3. No inflation and no role upgrade (section 6, rule 5). The shared `noBannedClaims` runs too. Reason `overstated`.
4. The bullet starts with a verb from `data/verbs.json` (about 120 plain action verbs: served, sold, cared for, repaired, delivered, kept, counted, cleaned, taught, organised, braided, drove, built) or with a verb that appears in the person's own answer. Reason `weak_opening` when it starts with "Responsible for", "Helped with", "Duties included" or a noun.
5. The source quote the model cites is in the fields (`quoteInSource`, shared, unchanged). Reason `quote_not_found`.
6. Length 40 to 180 characters, one sentence, no exclamation mark. A new check; the shared `lengthOk` stays fixed at 1 to 180 for YoVouch.
7. Duplicates across bullets (`dedupe`, shared, unchanged).

A rejected bullet is listed in the record with its reason. When every bullet for an entry is rejected, the template version is shown instead, labelled `template wording`.

Numbers on the page: the CV prints the person's hedge and number as given ("about 40 customers a week"). The record prints `stated by <first name>, not checked` after each number the person typed. **(our call)** The CV does not print "not checked" next to numbers, because no employer's CV does; the record does.

The demo's rejected suggestion (section 11) is a prepared fixture through the same path, labelled `Prepared example. Not a live call.` like the YoVouch beat 3 page, because a live model will not produce an error on cue.

## 8. The model behind one interface, and the webhook

The provider layer stays: `server/providers/index.js` picks `azure-openai`, `openai-compatible` or `local`. Changes:

- A selector **(our call)**: `MODEL_PROVIDER=azure | openai | local` in `.env`. When set, it wins; when empty, today's order applies (Azure if its three values are set, else OpenAI-compatible if its key is set, else local). This is what makes the live switch a one-line change without blanking the Azure block.
- A capability flag **(our call)** on the OpenAI-compatible adapter, `OPENAI_STRUCTURED_OUTPUT=json_schema | json_object`, default `json_schema`. With `json_object` the adapter puts the schema in the prompt, asks for a JSON object, and validates the result with the same schema check. It applies to every call through that adapter, so YoCard drafts and transcription also work against a local endpoint; their output and copy do not change. Which local servers honour `json_schema` is unverified, which is why the flag exists.
- A CV bullet prompt and schema in `server/providers/schema.js` beside the existing claims schema; the YoCard draft prompt is untouched.
- The startup banner prints provider and model name.
- `.env.example` gains a commented local block: `MODEL_PROVIDER=openai`, `OPENAI_BASE_URL=http://localhost:11434/v1`, `OPENAI_API_KEY=ollama`, `OPENAI_MODEL=<a small instruct model>`, `OPENAI_STRUCTURED_OUTPUT=json_object`. The README shows the two configurations side by side.
- The live smoke test gains a CV bullet case that runs against whichever provider is configured and prints the provider and model.

Demonstration: the same interview answers through Azure OpenAI (if the owner obtains a key) and through Ollama on the laptop, with both evidence records side by side showing the same checks applied. Without an Azure key, the Ollama run plus the unit-tested Azure adapter is what is shown, and the README says so.

The webhook **(our call)**: `POST /api/cv/draft` takes `{role, entries:[{title, what, forWhom, frequency, months, number:{value, unit, hedge}, outcome}], lang}` and returns `{draft:true, bullets:[{entryIndex, text, checks}], skills:[{name, yomaSkill, level:'S3'}], rejected:[...], generation:{mode, provider, model}, notice}` where `notice` is `Draft. Nothing is saved until the person confirms it.` It carries no account, so it returns S3 skills only. Step 3 in the web app calls the same internal function through its own session route, not this endpoint. The endpoint is mounted only when `YOCV_SERVICE_SECRET` is set and requires it in `x-yocv-service-secret`, following the YoVouch gateway pattern. A RapidPro flow would collect the answers into results, call it from a `call_webhook` node, and show each bullet with `@webhook.json.bullets.0.text` in a `send_msg`, then ask the person to reply 1 to accept or 2 to change, so the read-back rule holds in the flow too. A flow definition skeleton with those nodes goes in `integration/rapidpro/yocv-draft-flow.json`, marked untested against a RapidPro instance.

## 9. The Yoma integration pack

A folder `integration/yoma/` in this repo mirrors the paths in the Yoma monorepo, so each file says where it would land. Contents:

- `README.md`: the integration map with Yoma paths: the YoID dashboard tile at `src/web/src/pages/yoid/index.tsx` lines 370 to 381 (a static `DetailDisclosure` reading "A CV built from your Yo-ID — coming soon", which has no link prop, so the change is to render a link in its place, described in words, not as a diff); the domain services the CV assembles from (`IUserProfileService.Get()` and `GetSkills(type)`, `IMyOpportunityService.Search`, `ISSIWalletService.SearchUserCredentials`); the pattern projects copied (`Yoma.Core.Infrastructure.Emsi` for client and factory, `Yoma.Core.Infrastructure.DidxMe` for validated options, `Yoma.Core.Infrastructure.Zlto` for the health check); the environment gate (`AppSettings.<X>EnabledEnvironments` and a filter like `SSIEnabledFilter`); the per-user lock (`[UserActionLock]`); caching (`IDistributedCacheService`); the web client pattern (`src/web/src/api/services/credentials.ts`); the 45 second client timeout that needs an override; and the PII that must be stripped before prompting (`MyOpportunityInfo.UserEmail`, `UserPhoneNumer`, `UserDisplayName`; `UserProfile.DateOfBirth`, `PhoneNumber`, `Coordinates`).
- `src/api/src/domain/Yoma.Core.Domain/LanguageModel/Interfaces/ILanguageModelClient.cs` and `ILanguageModelClientFactory.cs`; `Models/LanguageModelRequest.cs`, `LanguageModelResponse.cs`; `src/api/src/domain/Yoma.Core.Domain/CV/Interfaces/ICVService.cs` and `Models/` for the interview entry, bullet, skill level and evidence record; `Services/CVService.cs` holding the assembly and the checks from sections 6 and 7 ported to C#.
- `src/api/src/infrastructure/Yoma.Core.Infrastructure.LanguageModel/`: `Startup.cs` (options bound from section `LanguageModel` with `ValidateOnStart`, as DidxMe does, and one rule relaxed when the environment is not enabled; `AddScoped<ILanguageModelClientFactory, OpenAICompatibleClientFactory>()`; a health check tagged `llm`), `Models/LanguageModelOptions.cs` (`Provider`, `BaseUrl`, `ApiKey`, `AuthHeaderName`, `Model`, `RequestTimeoutSeconds`, `MaxOutputTokens`, `Temperature`, `StructuredOutput`), `Client/OpenAICompatibleClient.cs` (Flurl, `POST {BaseUrl}/chat/completions`, `api-key` header for Azure's `/openai/v1/` path or `Authorization: Bearer` otherwise), `Client/OpenAICompatibleClientFactory.cs`, `HealthCheck.cs` against `GET {BaseUrl}/models`, and a template fallback used when the environment is not enabled, as `EmsiClient` falls back to embedded data.
- `src/api/src/application/Yoma.Core.Api/Controllers/CVController.cs`: `POST api/v3/cv/draft` and `GET api/v3/cv` under the `yoma_core_api` policy and `Role_User`, with `[UserActionLock]`; and the `appsettings.json` section with placeholder values only.
- `src/api/src/test/Yoma.Core.Test/CV/CVServiceTests.cs`: the no-invented-number, no-inflation and level rules against a fake client.
- `src/web/src/api/services/cv.ts`, `src/web/src/pages/yoid/cv/[[...query]].tsx` (the four steps on the YoID layout, gated by `NEXT_PUBLIC_CV_ENABLED`), and a note on replacing the dashboard tile.
- `docs/work/active/<EPIC>-yoid-cv-builder/README.md` and `<EPIC>-yoid-cv-builder/<TICKET>-cv-draft-service/feature.md` with a first `handoffs/` note, on Yoma's own templates and folder shape (feature files live in a ticket sub-folder; the Linear ids are placeholders until the team issues them), naming the API owner and the web owner by role, and stating what needs them: a dependency decision (none needed with Flurl), the sops secret per environment, the environment flag values, and the runtime provider switch, which is new to a codebase whose SSI provider switch is compile time.
- `LICENSE-NOTE.md` as in section 3.

Stretch **(our call)**: if `mise` installs .NET 10 cleanly on the laptop, compile `Yoma.Core.Infrastructure.LanguageModel` and run `CVServiceTests` against a fake client, and say in the README that the compile passed. If it does not, every C# file says at the top that it was written to the repository's patterns and not compiled. No Yoma service is run either way.

## 10. The template

One column, A4 and Letter, one page for up to three entries. System font stack (Arial, Helvetica, Liberation Sans). Sections in order: name; contact line (phone, email, town); a two-line profile; Experience, newest first, with the entry title, place and months, and the accepted bullets; Skills, as plain text with the label in parentheses; Learning recorded on Yoma, listing each included credential and completed opportunity with issuer and month; Education, optional; "References available on request".

Left out by default and available as optional fields for the markets that ask: photo, date of birth, ID number, state of origin. Never collected: marital status, religion.

The profile line is built by the template from accepted material only: the target role, the two strongest skills by level, and the longest entry's months ("Retail assistant with customer service recorded on Yoma and 14 months on a family market stall"). It passes the same checks as a bullet and needs its own Accept in Step 3.

Rules: no tables for content, no text boxes, no two-column layout, headings as real headings, 11 point body, 1.3 line height, print margins 18 mm, nothing in the print header or footer area except the one sample-mode line from section 3. The downloads: print to PDF through the browser, a text version with the same section order, the evidence record as HTML and JSON. DOCX is the last stretch item **(owner's call)**: a DOCX is a zip of XML and Node has no zip writer, so it needs a small store-only zip writer in the repo; it is attempted after everything else and dropped without harm if time runs out.

## 11. What leaves the device, real versus simulated, and demo

Leaves the device: in live mode, the role, the masked interview fields per entry and the credential and opportunity titles go to the configured model; never the name, contact details, town or the unmasked names in the answers. Yoma is called as today. In sample mode nothing leaves except the Yoma lookups.

Real: the checks, the methodology, the template, the provider switch, the Yoma skill lookup, the opportunity data on completions, the vouch read from the card and vouch stores. Simulated or sample: the person's account and its credentials (sample personas unless a token is set), the vouches themselves in the demo (seeded with sample numbers through the simulators), the prepared rejected suggestion, any Azure run until a key exists. The README table gains these rows and loses the old YoCV rows that no longer apply.

Demo, six minutes: pick Thandi, show her Yoma record and tick two completions and their credentials; choose Hairdresser; answer the six questions for her braiding at home with "about 40 customers a week"; show the model's bullet next to her words with the number highlighted, and the prepared example of a suggestion that tried "over 50" and was refused; show the skills list with `Confirmed from Yoma` on Customer Service and the hairdressing skill carrying `Vouched by a customer, confirmed by them, not by Yoma`; accept the profile line; print the CV; open the evidence record; change `MODEL_PROVIDER` to `openai` with the Ollama block, restart, repeat the one entry and show the banner and the record naming the local model; open `integration/yoma/README.md` on the tile line in Yoma's dashboard code.

## 12. Copy

Step titles: `Your Yoma record`, `Your work`, `Review`, `Your CV`. Interview questions as in section 5. Labels: `Confirmed from Yoma`, `Vouched by a customer, confirmed by them, not by Yoma`, `Vouched by another worker, confirmed by them, not by Yoma`, `Referred by <organisation>, confirmed by them, not by Yoma`, `From your own account`, `Self-stated`, `template wording`, `stated by <first name>, not checked`, `Prepared example. Not a live call.`, `Draft. Nothing is saved until the person confirms it.` Review buttons: `Accept`, `Edit`, `Leave out`. Rejection reasons as in section 7. CV section heading `Learning recorded on Yoma`. CV footer in sample mode: `Sample account: fictional, for demonstration`; none otherwise. App footer gains `Not operated by Yoma or UNICEF.` The remaining strings are the builder's, kept in `data/yocv-copy.json` so a translation task can find them.

## 13. What is left to the builder

The exact verb list, the chip-to-skill mapping for each trade and the skill menus for the new roles (each name checked against Yoma's taxonomy as the existing ones were), the per-field character limits, the number-word table, the print stylesheet details, the structure of `integration/yoma/` tests, the zip writer if DOCX is reached, and the order of tasks, all within the rules above.

## 14. Open questions

The owner settled the three that were theirs on 2026-11-19: the sample-mode footer line (section 3), replacing the old flow (section 5) and DOCX as the last stretch item (section 10).

For the Yoma team: the YoID mobile wireframes (not public; the web YoID dashboard is the merge point until they arrive); what PathFinder is (nothing public from Yoma matches the name; Yoma's docs describe "Pathways"); an export of the RapidPro sandbox flow so the webhook shape can be checked against it; whether a runtime provider switch is acceptable to the API owner, given the SSI provider is switched at compile time; Azure OpenAI access for the live run; and whether Yoma or SAQA holds any mapping from micro-credentials to formal qualifications that section 6 rule 6 could use.
