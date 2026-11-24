# YoCV integration pack for Yoma

This folder mirrors paths in the Yoma monorepo. Each file sits where it would land in Yoma. Nothing here is copied from Yoma's code. The files follow its layout, naming and patterns only. Nothing here has been compiled or run against Yoma. See `LICENSE-NOTE.md` for the licence.

Owners are named by role: the API owner and the web owner on the Yoma team.

The paths and line numbers cited here were read at the Yoma master commit `1e7c9fc`.

## API side

### What the pack adds

| Yoma path | What it is |
| --- | --- |
| `src/api/src/domain/Yoma.Core.Domain/LanguageModel/Interfaces/ILanguageModelClient.cs`, `ILanguageModelClientFactory.cs` | One chat completion with structured output, behind an interface. |
| `src/api/src/domain/Yoma.Core.Domain/LanguageModel/Models/` | `LanguageModelRequest`, `LanguageModelMessage`, `LanguageModelResponse`, one model per file. |
| `src/api/src/domain/Yoma.Core.Domain/CV/Interfaces/ICVService.cs` | `Draft(CVDraftRequest)` and `Get()`. |
| `src/api/src/domain/Yoma.Core.Domain/CV/Models/` | The interview entry, bullet, check result, skill level, skill, learning item, evidence record, draft request and draft. |
| `src/api/src/domain/Yoma.Core.Domain/CV/Services/CVService.cs` | The assembly, the masking and the checks from YoCV spec sections 6 and 7, ported to C#. |
| `src/api/src/domain/Yoma.Core.Domain/CV/Data/verbs.json` | The opening verbs, an embedded resource. |
| `src/api/src/infrastructure/Yoma.Core.Infrastructure.LanguageModel/` | The new third-party integration project: options, client, factory, template fallback, health check and `Startup.cs`. |
| `src/api/src/application/Yoma.Core.Api/Controllers/CVController.cs` | `POST api/v3/cv/draft` and `GET api/v3/cv`. |
| `src/api/src/application/Yoma.Core.Api/appsettings.section.json` | The settings section to merge into `appsettings.json`. Placeholder values only. |
| `src/api/src/test/Yoma.Core.Test/CV/CVServiceTests.cs` | No invented number, no inflation, and the level rules, against a fake client. |

### Where the CV reads from

`CVService` assembles the record from existing domain services only. It adds no table and saves nothing.

- `IUserProfileService.Get()` gives the person's first name, surname, display name, city and region. They are used only to mask those words in the interview answers. They never go to the model and are not returned.
- `IUserProfileService.GetSkills(type)` with `UserSkillType.Verified` gives skills recorded on Yoma. With `UserSkillType.SelfAttested` it gives self-stated skills.
- `IMyOpportunityService.Search` with `Action.Verification` and `VerificationStatus.Completed` gives completed opportunities. The service reads `OpportunityTitle`, `OrganizationName`, `DateCompleted` and `Skills` only.
- `ISSIWalletService.SearchUserCredentials`, then `ISSIWalletService.GetUserCredentialById` for each item. Search items are `SSICredentialInfo`, whose `Attributes` are `[JsonIgnore]`, so `Opportunity_Skills` is read from the detail only, through its `ItemsDisplay`. `ValueDisplay` is never parsed, because a skill name can hold a comma. Only credentials with `Status == Issued` are kept.
- A credential links to its completion by its top-level `Title`. Its issuer is its top-level `Issuer`. Both are system properties that Yoma lifts out of `Attributes`. A linked credential is listed in place of its completion, so one piece of learning is listed once and supports a skill once.
- `ISkillService.GetByNameOrNull` checks each skill the model proposes. The prototype uses a role skill menu instead. Whether Yoma wants role menus is a question for the API owner.

### Skill levels

`CVSkillLevel` holds four levels, strongest first. A skill shows the strongest source's level and label. Every source is listed in the record.

| Level | Source | Label |
| --- | --- | --- |
| `RecordedOnYoma` | A verified Yoma skill, a completed opportunity or an issued credential | `Confirmed from Yoma` |
| `Vouched` | A vouch on the person's YoCard | Set by the vouch |
| `ShownInWork` | A skill seen in an interview answer, with a quote that passes the quote check | `From your own account` |
| `SelfStated` | A Yoma self-attested skill | `Self-stated` |

One credential, one completion, one vouch and one interview entry each count once. Volume never promotes a skill. YoCard vouches live in the YoCV prototype, not in Yoma, so `Vouched` has no source inside Yoma until vouches are hosted there.

### The checks

`CVService.CheckBullet(string text, CVInterviewEntry entry, string role)` runs on every sentence before the person sees it. It uses the same reason codes as `server/cv/validate.js` in the prototype: `invented_number`, `hedge_dropped`, `contact_detail`, `invented_name`, `overstated`, `weak_opening`, `length`, `not_one_sentence` and `exclamation`. An overload takes a `CVBullet` and adds the quote check, `quote_not_found`. The string overload is the one for the person's own edit, which has no quote.

`Inflation`, `RoleUpgrade`, `InflationStems` and `RoleUpgradeForms` are C# 12 collection expressions equal to the lists in the prototype's `cv-rules.js`. A test in this repository compares them. The verbs come from the embedded `CV/Data/verbs.json`, which the same test compares with `VERBS`.

When every model bullet for an entry is refused, the service shows its template sentence, built from the person's own words and checked the same way.

### What never reaches the model

The prompt holds the role, the masked interview answers and the credential and opportunity titles. Nothing else. `CVService` never passes a `UserProfile`, a `MyOpportunityInfo` or a credential attribute to the client. These fields never reach it:

- From `MyOpportunityInfo`: `UserEmail`, `UserPhoneNumer` (Yoma's spelling), `UserDisplayName`, `Username`, and the location fields `City` and `Region`.
- From `UserProfile`: `DateOfBirth`, `PhoneNumber`, `Coordinates`, `Email`, `FirstName`, `Surname`, `DisplayName`, `Username`, `City` and `Region`.
- From credential attributes: `MyOpportunity_UserDisplayName`, `MyOpportunity_Location`, `MyOpportunity_UserDateOfBirth` (kept on credentials issued on an older schema version) and the YoID `User_*` attributes. Only `Opportunity_Skills` is read.

The interview answers can hold a person's or a shop's name, a place, a phone number or an email. Before the call, capitalised words that are not sentence-initial, not the role and not a listed verb become `[name1]`, `[name2]` and so on. So do the person's own name and town from the profile, in any case, and the request's `KnownWords`: the place typed for each entry and the town on the contact line, so a typed place that differs from the profile city is masked even as the first word of a sentence. `KnownWords` are used for masking only and never go into the prompt. Phone numbers and emails become `[contact1]` and are never restored. Names are restored after the call. A placeholder the model invents is refused as `invented_name`.

Frequency, the number, its unit and its hedge pass to the model unmasked, so `CVService` holds them to fixed values before the call, as the prototype's route does. `Frequency`, `NumberUnit` and `NumberHedge` must be one of `FrequencyChips`, `UnitChips` and `HedgeChips`, which a test here compares with the chips in `cv-copy.js`. `NumberValue` must be a whole number from 0 to 100000 as digits, and needs a unit and a hedge. Any other value is a validation error naming the field, such as `Entries[0].Frequency`, and nothing is sent.

### The language model project

`Yoma.Core.Infrastructure.LanguageModel` follows three existing projects:

- `Yoma.Core.Infrastructure.Emsi` for the client and factory, and for the fallback. `EmsiClient` falls back to an embedded payload where the source is not enabled. `OpenAICompatibleClientFactory` returns `TemplateClient` in the same case. It proposes nothing, so the template sentence is shown and no call leaves the API.
- `Yoma.Core.Infrastructure.DidxMe` for validated options: `AddOptions`, `Bind`, `Validate` and `ValidateOnStart`. One rule is relaxed where the model is not enabled: `BaseUrl`, `ApiKey` and `Model` are then not required.
- `Yoma.Core.Infrastructure.Zlto` for the health check. `HealthCheck` calls `GET {BaseUrl}/models` and is tagged `llm`.

`OpenAICompatibleClient` uses Flurl. It sends `POST {BaseUrl}/chat/completions`. On Azure's `/openai/v1/` path it sends the key in an `api-key` header; elsewhere it sends `Authorization: Bearer`. `AuthHeaderName` overrides both. `StructuredOutput` picks `json_schema` (the default) or `json_object`, for servers that do not honour `json_schema`. With `json_object` the schema goes in the prompt and the same checks run on the result.

The prototype also carries an Anthropic Messages API adapter (`server/providers/anthropic.js`) behind the same interface, which shows that a second wire format fits without a change to the service; the pack keeps the OpenAI-compatible client because it also covers Azure and local servers.

`LanguageModelOptions` holds `Provider`, `BaseUrl`, `ApiKey`, `AuthHeaderName`, `Model`, `RequestTimeoutSeconds`, `MaxOutputTokens`, `Temperature` and `StructuredOutput`, bound from the section `LanguageModel`.

### The controller

`CVController` is written the way Yoma's controllers are. The class carries `[Route($"api/{Common.Constants.Api_Version}/cv")]` and `[Authorize(Policy = Common.Constants.Authorization_Policy)]`, so the literals `v3` and `yoma_core_api` stay in `Common/Constants.cs`. Each action carries `Role_User`. `UserActionLockAttribute` targets methods only, so `[UserActionLock]` sits on the `POST draft` action and not on the `GET`.

### The gates

Yoma gates a provider per environment with `AppSettings.<X>EnabledEnvironments`. The pack adds `LanguageModelEnabledEnvironments`, set to `Local` in `appsettings.section.json`.

`SSIEnabledFilter` is a `TypeFilter` on `SSIController` only. It does not guard other controllers, so `CVService` checks `_appSettings.SSIEnabledEnvironmentsAsEnum.HasFlag(_environmentProvider.Environment)` itself, through `IEnvironmentProvider`, as `SSIEnabledFilter` does. When SSI is off, or the wallet answers with an error, the record says `Wallet not available` and the rest of the CV still builds.

### What to add by hand

The pack cannot edit existing Yoma files, so these changes are described in words.

- In `src/api/src/domain/Yoma.Core.Domain/Startup.cs`, register `ICVService` with `CVService` inside `ConfigureServices_DomainServices`, beside the other domain services.
- In `src/api/src/domain/Yoma.Core.Domain/Yoma.Core.Domain.csproj`, add `CV\Data\verbs.json` as an `EmbeddedResource`. Its resource name is then `Yoma.Core.Domain.CV.Data.verbs.json`.
- In `src/api/src/domain/Yoma.Core.Domain/Core/Models/AppSettings.cs`, add `LanguageModelEnabledEnvironments` and `LanguageModelEnabledEnvironmentsAsEnum`, written like `SSIEnabledEnvironments`.
- In `src/api/src/application/Yoma.Core.Api/Startup.cs`:
  - add `services.ConfigureServices_LanguageModelProvider(_configuration)` beside the other `ConfigureServices_<Name>Provider(_configuration)` calls;
  - add `services.ConfigureServices_InfrastructureLanguageModelProvider()` beside the other `ConfigureServices_Infrastructure<Name>Provider()` calls;
  - add `endpoints.MapLanguageModelProviderHealthEndpoints(Constants.Api_Version)` beside the other `Map<Name>ProviderHealthEndpoints` calls.
- In `src/api/src/application/Yoma.Core.Api/Yoma.Core.Api.csproj`, add a `ProjectReference` to `Yoma.Core.Infrastructure.LanguageModel.csproj`, as it has for `Yoma.Core.Infrastructure.Zlto`.
- Merge `appsettings.section.json` into `appsettings.json`. Keep the placeholders there. The key goes in sops.

### Decisions that need the API owner

1. Naming. Yoma names an external-service domain area `<Thing>Provider`, with `I<Thing>ProviderClient` and `I<Thing>ProviderClientFactory`. Examples are `LaborMarketProvider/Interfaces/ILaborMarketProviderClientFactory.cs`, `BlobProvider` and `ShortLinkProvider`. The pack keeps the names the YoCV spec fixed before this convention was checked: `LanguageModel/Interfaces/ILanguageModelClient.cs`. The Yoma-style alternative is `LanguageModelProvider/Interfaces/ILanguageModelProviderClient.cs` and `ILanguageModelProviderClientFactory.cs`. Renaming is the API owner's call.
2. Dependencies. None is needed. Flurl and Newtonsoft are already in the domain project.
3. Secrets. The API key needs a sops secret per environment.
4. Environment flags. Which environments get `LanguageModelEnabledEnvironments`. The pack sets `Local` only.
5. The provider switch. The model provider is chosen at runtime by `LanguageModel.BaseUrl` and its header. This is new to a codebase whose SSI provider switch is compile time.
6. Caching. `CVService` reads the record fresh on every call. A short per-user cache through `IDistributedCacheService` would save the wallet reads on `POST draft`. The cost is a stale record after a credential is revoked.
7. Timeouts. The web client aborts most calls at about 45 seconds. A draft makes one model call per entry, in turn. The web owner needs a per-request timeout override for `POST draft`, as Yoma already has for other slow calls. `RequestTimeoutSeconds` defaults to 30 in the section.
8. Role skill menus. See "Where the CV reads from".

### Small departures from the spec, for the owners to confirm

- `CVInterviewEntry` holds the months and the number as flat fields (`MonthStart`, `MonthEnd`, `NumberValue`, `NumberUnit`, `NumberHedge`), so each model stays in its own file. The prototype's webhook nests them.
- `CVLearningItem` is one extra model file, for the completions and credentials in the record.
- `CheckBullet` has a second overload that takes a `CVBullet`, so the quote check can run while the pinned signature stays as given.
- The profile line check from the prototype is not ported. The pack drafts bullets and skills only.
- `CVDraftRequest` carries two lists beside the entries: `KnownWords` (mask only, above) and `IncludeTitles`, the Step 1 ticks. `GET api/v3/cv` returns the full picker. `POST draft` prompts with the ticked learning only and gives only its skills the `Confirmed from Yoma` label, as the prototype's review does; a title not in the record is a validation error. Both lists are bounded in `Validate`.

## Web side

### What the pack adds

| Yoma path | What it is |
| --- | --- |
| `src/web/src/api/models/cv.ts` | The request and response types, camel case, as `CVController` returns them. `CVSkillLevel` is an enum whose name is on the wire. |
| `src/web/src/api/services/cv.ts` | `getCV()` and `draftCV(request)`, written like `src/web/src/api/services/credentials.ts` with its types in `src/web/src/api/models/credential.ts`. |
| `src/web/src/pages/yoid/cv/[[...query]].tsx` | The four steps, Your Yoma record, Your work, Review and Your CV, on the YoID layout. |

### The gate

The page is gated the way `src/web/src/pages/yoid/passport/[[...query]].tsx` is. `getServerSideProps` reads `env.NEXT_PUBLIC_CV_ENABLED?.toLowerCase() == "true"`, with `env` imported from `process`, so the flag is a string there. When the flag is off it returns `props: { cv_enabled }` and the page shows a `CV Unavailable` view, as the passport shows `Passport Unavailable`. It does not answer 404.

The pack cannot edit `src/web/src/env.mjs`, where Yoma declares its flags. Add `NEXT_PUBLIC_CV_ENABLED` there beside `NEXT_PUBLIC_PASSPORT_ENABLED`, in both places that flag appears: as a `z.boolean()` in the client schema, and read from `process.env` with the same lower case comparison to `"true"`. The declaration is what makes the flag a known, validated setting.

### The dashboard tile

In `src/web/src/pages/yoid/index.tsx`, lines 370 to 381 hold the CV tile. It is a static `DetailDisclosure` with the note that a CV built from your Yo-ID is coming soon. `DetailDisclosure` has no link prop, so it cannot simply be pointed at the page. The change, in words:

- Keep the `<div className="lg:col-span-2">` wrapper, so the tile keeps its place and its grid span.
- In place of the `DetailDisclosure` inside it, render a link to `/yoid/cv` with the same icon, tone and title, and a note that says what the CV builder does.
- Render the link only when the flag is true. The dashboard already reads `NEXT_PUBLIC_PASSPORT_ENABLED` this way: its `getServerSideProps` (lines 83 to 85) turns the string from `process` into `passport_enabled` and passes it as a prop. Read `NEXT_PUBLIC_CV_ENABLED` beside it into a `cv_enabled` prop. When it is false, keep today's static tile.

The standalone prototype now renders the same YoID structure around its CV: the greeting band with the tab pills, the Overview cards with the CV card spanning both columns, and the CV as a tab beside Wallet, Passport, Opportunities and Skills, in the place `/yoid/cv` takes here. So the two can be compared side by side: open the prototype's `index.html` next to this page. The pack's page is unchanged; the prototype's shell is plain HTML in `index.html` and `yoid.js`, not a file for Yoma's repository.

### The client timeout

Yoma's client aborts a call after 45 seconds. That is `SLOW_NETWORK_ABORT_TIMEOUT = 45000` in `src/web/src/lib/constants.ts`, applied as the instance `timeout` in `src/web/src/lib/axiosClient.ts`. The same file already overrides it per request for CSV uploads, with `CSV_UPLOAD_TIMEOUT`. A CV draft makes one model call per entry, in turn, so it needs the same kind of override. `draftCV` passes `{ timeout: CV_DRAFT_TIMEOUT }`, three minutes, on its own request. The interceptor leaves a per-request timeout alone for any URL that is not a CSV upload, so no change to `axiosClient.ts` is needed. The web owner may prefer to add the draft URL beside the CSV check instead.

### Small departures, for the web owner to confirm

- The role is a plain text field. Yoma has no role skill menus (see the API side).
- Edit in Review is shown but turned off. An edit must pass `CVService.CheckBullet` before it reaches the CV, and the API has no endpoint for that check yet. The feature doc lists it as a task. Until then the person can Accept or Leave out each line.
- The evidence record downloads as JSON only. The prototype also writes an HTML copy.
- The contact details are prefilled from `userProfileAtom` and never sent to the API, except the town's words, which go in `knownWords` so the API can mask them.
- The page sends `includeTitles` from the Step 1 ticks. Step 1 shows the record's full skill picker; from the draft on, the Review shows the draft's skills, which respect the ticks.

## The work epic

`docs/work/active/YOM-XXXX-yoid-cv-builder/` follows Yoma's `docs/work` shape: the epic `README.md`, a feature folder `YOM-YYYY-cv-draft-service/` with `feature.md`, and a first note in `handoffs/`. `YOM-XXXX` and `YOM-YYYY` are placeholders until the team issues the Linear ids. Rename both folders then. The placeholders are not `<EPIC>` and `<TICKET>`, because `<` and `>` are not valid in Windows file names. The docs take their headings from Yoma's templates and name the owners by role only.
