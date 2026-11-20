const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const {INFLATION,INFLATION_STEMS,ROLE_UPGRADE,ROLE_UPGRADE_FORMS,VERBS}=require('../cv-rules.js');

// Plan Task 18: the Yoma integration pack, API side (spec 9). The files mirror Yoma's paths; none is compiled here.
const PACK='integration/yoma/';
const DOMAIN='src/api/src/domain/Yoma.Core.Domain/',INFRA='src/api/src/infrastructure/Yoma.Core.Infrastructure.LanguageModel/',API='src/api/src/application/Yoma.Core.Api/';
const API_FILES=['README.md','LICENSE-NOTE.md',
  ...['Interfaces/ILanguageModelClient.cs','Interfaces/ILanguageModelClientFactory.cs','Models/LanguageModelRequest.cs','Models/LanguageModelMessage.cs','Models/LanguageModelResponse.cs'].map(f=>DOMAIN+'LanguageModel/'+f),
  ...['Interfaces/ICVService.cs',...['CVInterviewEntry','CVBullet','CVCheckResult','CVSkillLevel','CVSkill','CVEvidenceRecord','CVDraftRequest','CVDraft'].map(m=>'Models/'+m+'.cs'),'Services/CVService.cs','Data/verbs.json'].map(f=>DOMAIN+'CV/'+f),
  ...['Yoma.Core.Infrastructure.LanguageModel.csproj','Startup.cs','HealthCheck.cs','Models/LanguageModelOptions.cs','Client/OpenAICompatibleClient.cs','Client/OpenAICompatibleClientFactory.cs','Client/TemplateClient.cs'].map(f=>INFRA+f),
  API+'Controllers/CVController.cs',API+'appsettings.section.json','src/api/src/test/Yoma.Core.Test/CV/CVServiceTests.cs'];
test('every API-side file exists at its Yoma path and every C# file carries the header',()=>{
  for(const f of API_FILES)assert.ok(fs.existsSync(path.join(root,PACK,f)),f);
  for(const f of API_FILES.filter(f=>f.endsWith('.cs')))assert.ok(read(PACK+f).startsWith('// Written to the Yoma repository\'s patterns by the YoCV prototype.'),f);
});
test('the C# rule lists and verbs match the JavaScript ones',()=>{
  const cs=read(PACK+'src/api/src/domain/Yoma.Core.Domain/CV/Services/CVService.cs');
  const arr=name=>JSON.parse('['+cs.match(new RegExp(name+'\\s*=\\s*\\[([^\\]]*)\\]'))[1]+']');
  assert.deepEqual(arr('Inflation'),INFLATION); assert.deepEqual(arr('RoleUpgrade'),ROLE_UPGRADE);
  assert.deepEqual(arr('InflationStems'),INFLATION_STEMS);
  for(const [k,forms] of Object.entries(ROLE_UPGRADE_FORMS))for(const f of [k,...forms])assert.ok(cs.includes('"'+f+'"'),f);
  assert.deepEqual(JSON.parse(read(PACK+'src/api/src/domain/Yoma.Core.Domain/CV/Data/verbs.json')),VERBS);
  for(const r of ['invented_number','hedge_dropped','invented_name','overstated','weak_opening','quote_not_found'])assert.ok(cs.includes('"'+r+'"'),r);
});
test('the C# request check holds frequency, unit and hedge to the chips and the number to a whole number, as the route does',()=>{
  const cs=read(PACK+DOMAIN+'CV/Services/CVService.cs'),COPY=require('../cv-copy.js').en;
  const arr=name=>JSON.parse('['+cs.match(new RegExp(name+'\\s*=\\s*\\[([^\\]]*)\\]'))[1]+']');
  assert.deepEqual(arr('FrequencyChips'),COPY.frequencyChips); assert.deepEqual(arr('UnitChips'),COPY.unitChips); assert.deepEqual(arr('HedgeChips'),COPY.hedgeChips);
  assert.match(cs,/Number_Max = 100000;/);
  const validate=cs.slice(cs.indexOf('private static void Validate('),cs.indexOf('private static CVCheckResult CheckText('));
  for(const f of ['Frequency','NumberValue','NumberUnit','NumberHedge'])assert.ok(validate.includes('Entries[{i}].'+f),f);
  const tests=read(PACK+'src/api/src/test/Yoma.Core.Test/CV/CVServiceTests.cs');
  for(const f of ['Frequency','NumberValue'])assert.ok(tests.includes('"Entries[0].'+f+'"'),f);
});
test('the controller, options and settings follow the spec',()=>{
  const ctl=read(PACK+'src/api/src/application/Yoma.Core.Api/Controllers/CVController.cs');
  assert.ok(ctl.includes('api/v3/cv')||ctl.includes('Api_Version}/cv'),'route, literal or Yoma constant form');
  assert.ok(ctl.includes('yoma_core_api')||ctl.includes('Authorization_Policy'),'policy, literal or Yoma constant form');
  for(const s of ['"draft"','Role_User','[UserActionLock]'])assert.ok(ctl.includes(s),s);
  assert.equal(ctl.split('[UserActionLock').length-1,1,'one lock, on the POST action');
  assert.ok(/\[UserActionLock[^\]]*\][\s\S]{0,200}\[HttpPost/.test(ctl)||/\[HttpPost[\s\S]{0,200}\[UserActionLock/.test(ctl),'the lock sits with the POST action');
  const opt=read(PACK+'src/api/src/infrastructure/Yoma.Core.Infrastructure.LanguageModel/Models/LanguageModelOptions.cs');
  for(const p of ['Provider','BaseUrl','ApiKey','AuthHeaderName','Model','RequestTimeoutSeconds','MaxOutputTokens','Temperature','StructuredOutput'])assert.ok(new RegExp('public \\S+ '+p+' \\{').test(opt),p);
  const settings=JSON.parse(read(PACK+'src/api/src/application/Yoma.Core.Api/appsettings.section.json'));
  for(const v of Object.values(settings.LanguageModel))assert.ok(typeof v!=='string'||v===''||/^<.*>$/.test(v),String(v));
});
test('Startup, client, health check and the GET action follow spec 9',()=>{
  const infra=PACK+'src/api/src/infrastructure/Yoma.Core.Infrastructure.LanguageModel/';
  const startup=read(infra+'Startup.cs'),client=read(infra+'Client/OpenAICompatibleClient.cs');
  for(const s of ['ConfigureServices_LanguageModelProvider','ConfigureServices_InfrastructureLanguageModelProvider','MapLanguageModelProviderHealthEndpoints','ValidateOnStart','AddScoped<ILanguageModelClientFactory, OpenAICompatibleClientFactory>()','"llm"'])assert.ok(startup.includes(s),s);
  for(const s of ['chat/completions','api-key','Bearer','json_object','json_schema'])assert.ok(client.includes(s),s);
  assert.ok(read(infra+'HealthCheck.cs').includes('/models'));
  assert.ok(read(PACK+'src/api/src/application/Yoma.Core.Api/Controllers/CVController.cs').includes('[HttpGet'));
});
test('README names the map, the PII and the owners by role; LICENSE-NOTE states both licences',()=>{
  const md=read(PACK+'README.md');
  for(const s of ['IUserProfileService.Get()','GetSkills(type)','IMyOpportunityService.Search','ISSIWalletService.SearchUserCredentials','ISSIWalletService.GetUserCredentialById','MyOpportunity_UserDisplayName','MyOpportunity_Location','Yoma.Core.Infrastructure.Emsi','Yoma.Core.Infrastructure.DidxMe','Yoma.Core.Infrastructure.Zlto','SSIEnabledFilter','[UserActionLock]','IDistributedCacheService','UserEmail','UserPhoneNumer','UserDisplayName','DateOfBirth','PhoneNumber','Coordinates','Email','FirstName','Surname','DisplayName','Username','City','Region','MyOpportunity_UserDateOfBirth','ConfigureServices_LanguageModelProvider','ConfigureServices_InfrastructureLanguageModelProvider','MapLanguageModelProviderHealthEndpoints','ProjectReference','the API owner','the web owner','Flurl','sops','EnabledEnvironments','ConfigureServices_DomainServices','src/api/src/application/Yoma.Core.Api/Startup.cs','ILanguageModelProviderClient'])assert.ok(md.includes(s),s);
  const lic=read(PACK+'LICENSE-NOTE.md'); assert.ok(lic.includes('GPL-3.0')&&lic.includes('MIT'));
  assert.ok(!/verified by Yoma/i.test(md+lic));
});
// Plan Task 19: the web side and the work epic (spec 9).
test('the web files and the epic exist with their headers and placeholders',()=>{
  const page=read(PACK+'src/web/src/pages/yoid/cv/[[...query]].tsx'),svc=read(PACK+'src/web/src/api/services/cv.ts');
  assert.ok(page.includes('NEXT_PUBLIC_CV_ENABLED')&&svc.includes('draftCV')&&svc.includes('getCV'));
  assert.match(page,/env\.NEXT_PUBLIC_CV_ENABLED\?\.toLowerCase\(\) == "true"/);
  assert.ok(page.includes('cv_enabled')&&page.includes('CV Unavailable')&&!page.includes('notFound'),'the passport gate: props and an unavailable view');
  for(const s of [page,svc])assert.ok(s.startsWith('// Written to the Yoma repository\'s patterns by the YoCV prototype.'));
  assert.ok(fs.existsSync(path.join(root,PACK,'src/web/src/api/models/cv.ts'))&&svc.includes("from \"../models/cv\""));
  const epic=PACK+'docs/work/active/YOM-XXXX-yoid-cv-builder/';
  for(const f of ['README.md','YOM-YYYY-cv-draft-service/feature.md','YOM-YYYY-cv-draft-service/handoffs/2026-11-19-a.md'])assert.ok(fs.existsSync(path.join(root,epic,f)),f);
  assert.ok(read(epic+'README.md').includes('the API owner')&&read(epic+'README.md').includes('the web owner'));
  const feature=read(epic+'YOM-YYYY-cv-draft-service/feature.md');
  for(const s of ['Flurl','sops','LanguageModelEnabledEnvironments','runtime provider switch'])assert.ok(feature.includes(s),s);
  assert.match(feature,/^- \*\*Owner\*\*: the API owner \| the web owner$/m,'owners by role only');
  const epicReadme=read(epic+'README.md');
  assert.match(epicReadme,/^- \*\*Owners\*\*: the API owner \(api\) · the web owner \(web\)$/m,'epic owners by role only');
  const handoff=read(epic+'YOM-YYYY-cv-draft-service/handoffs/2026-11-19-a.md');
  assert.match(handoff,/^- \*\*Session by\*\*: the YoCV prototype/m);
  assert.ok(page.includes('import { env } from "process"'),'the page reads the flag as a string, as the passport does');
  const names=[];(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){names.push(e.name);if(e.isDirectory())walk(path.join(d,e.name));}})(path.join(root,PACK));
  assert.ok(!names.some(n=>/[<>:"|?*]/.test(n)),'every pack path is a valid Windows file name');
  const mds=[];(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(e.name.endsWith('.md'))mds.push(p);}})(path.join(root,PACK));
  for(const f of mds)assert.ok(!fs.readFileSync(f,'utf8').includes('—'),'no em dash: '+f);
});
test('README describes the tile change in words, with the path and lines',()=>{
  const md=read(PACK+'README.md');
  for(const s of ['src/web/src/pages/yoid/index.tsx','lines 370 to 381','DetailDisclosure','src/web/src/api/services/credentials.ts','45 second'])assert.ok(md.includes(s),s);
  for(const s of ['SLOW_NETWORK_ABORT_TIMEOUT','src/web/src/lib/axiosClient.ts','CSV_UPLOAD_TIMEOUT','YOM-XXXX','env.mjs','NEXT_PUBLIC_PASSPORT_ENABLED'])assert.ok(md.includes(s),s);
  assert.ok(!md.includes('```diff')&&!/^(\+\+\+|---|@@) /m.test(md),'no diff fence and no diff header lines; Markdown bullets are fine');
});
test('final review 11 and 12: the page sends the words to mask and the Step 1 ticks, and Draft respects both',()=>{
  const req=read(PACK+DOMAIN+'CV/Models/CVDraftRequest.cs'),svc=read(PACK+DOMAIN+'CV/Services/CVService.cs');
  const page=read(PACK+'src/web/src/pages/yoid/cv/[[...query]].tsx'),model=read(PACK+'src/web/src/api/models/cv.ts');
  for(const p of ['KnownWords','IncludeTitles'])assert.ok(req.includes('List<string> '+p+' {'),p);
  assert.ok(model.includes('knownWords: string[]')&&model.includes('includeTitles: string[]'));
  assert.ok(page.includes('knownWords:')&&page.includes('includeTitles:')&&page.includes('contact.town')&&page.includes('e.place'),'the page fills both from the place, the town and the ticks');
  assert.ok(/const skills: CVSkill\[\] = draft \? draft\.skills/.test(page),'after a draft the review shows the draft skills, which respect the ticks');
  const draft=svc.slice(svc.indexOf('public async Task<CVDraft> Draft('),svc.indexOf('public static CVCheckResult CheckBullet('));
  assert.ok(draft.includes('request.KnownWords')&&draft.includes('request.IncludeTitles')&&draft.includes('evidence.RemoveAll'));
  const at=svc.indexOf('private static List<LanguageModelMessage> BuildMessages('),messages=svc.slice(at,svc.indexOf('\n    private static',at+10));
  assert.ok(!/known/i.test(messages),'the mask words never reach the prompt');
  const validate=svc.slice(svc.indexOf('private static void Validate('),svc.indexOf('private static CVCheckResult CheckText('));
  assert.ok(validate.includes('request.KnownWords')&&validate.includes('request.IncludeTitles'),'both lists are bounded');
  const md=read(PACK+'README.md');
  assert.ok(md.includes('`KnownWords`')&&md.includes('`IncludeTitles`')&&!md.includes("So do the person's own name and town, in any case."));
  const tests=read(PACK+'src/api/src/test/Yoma.Core.Test/CV/CVServiceTests.cs');
  assert.ok(tests.includes('KnownWords = [')&&tests.includes('IncludeTitles = ['));
});
