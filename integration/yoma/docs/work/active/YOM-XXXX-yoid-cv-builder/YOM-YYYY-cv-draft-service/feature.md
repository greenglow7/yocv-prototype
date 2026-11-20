# Feature: CV draft service

## Meta

- **Feature**: cv-draft-service
- **Epic**: [YOM-XXXX](../README.md)
- **Ticket**: YOM-YYYY (a placeholder until the team issues the Linear id)
- **Owner**: the API owner | the web owner
- **Areas**: both
- **Status**: planning
- **Started**: 2026-11-19

## Problem / Goal

A person needs CV sentences in their own words, made stronger without anything invented. The API drafts them from the interview answers with a language model, checks every sentence, and falls back to a template sentence when a check refuses all of them. The web page walks the person through four steps and prints only what they accepted.

## Out of Scope

- The profile line the YoCV prototype drafts. The pack drafts bullets and skills only.
- Role skill menus. The API checks proposed skills against `ISkillService.GetByNameOrNull` instead.

## Plan

The pack under `integration/yoma/` holds each file at its Yoma path. Its `README.md` lists every file and says, in words, what to add to the existing Yoma files.

- API: `CVController`, `ICVService` and `CVService` in the domain project, and the new `Yoma.Core.Infrastructure.LanguageModel` project for the model client, its options, its health check and its template fallback.
- Web: `src/web/src/api/services/cv.ts`, its types in `src/web/src/api/models/cv.ts`, and the page `src/web/src/pages/yoid/cv/[[...query]].tsx`, gated by `NEXT_PUBLIC_CV_ENABLED`.

What needs each owner:

- **The API owner**
  - The dependency decision: none is needed. The client uses Flurl, which the domain project already has.
  - The sops secret per environment for `LanguageModel.ApiKey`.
  - The environment flag values: which environments get `LanguageModelEnabledEnvironments`. The pack sets `Local` only.
  - The runtime provider switch. The model provider is chosen at runtime by `LanguageModel.BaseUrl` and its auth header. This is new to a codebase whose SSI provider switch is compile time.
  - The naming: keep `LanguageModel` or rename to the `<Thing>Provider` convention.
- **The web owner**
  - Add `NEXT_PUBLIC_CV_ENABLED` to `src/web/src/env.mjs` beside `NEXT_PUBLIC_PASSPORT_ENABLED`.
  - Replace the dashboard tile with a link to `/yoid/cv`, shown only when the flag is true.
  - Confirm the draft timeout in `cv.ts`.

## Tasks

- [ ] Register `ICVService` and the language model provider, as the pack README says.
- [ ] Add `LanguageModelEnabledEnvironments` to `AppSettings`.
- [ ] Merge `appsettings.section.json` and add the sops secret.
- [ ] Add `POST api/v3/cv/check`, which runs the string overload of `CVService.CheckBullet` on the person's own edit, then turn on Edit in Review.
- [ ] Add the flag to `env.mjs` and replace the dashboard tile.
- [ ] Compile both sides and run `CVServiceTests`.

## Decisions

- 2026-11-19: Flat months and number fields on `CVInterviewEntry`, so each model stays in its own file.
- 2026-11-19: Edit stays off in Review until the check endpoint exists, so no unchecked wording reaches the CV.

## Links

- Epic: [YOM-XXXX](../README.md)
- Ticket: YOM-YYYY
- PRs: none yet
- Designs: none
- Related: the pack `README.md`, and the Yoma master commit read, `1e7c9fc`
