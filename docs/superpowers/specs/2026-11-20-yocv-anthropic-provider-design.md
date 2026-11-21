# YoCV: a Claude provider behind the same interface

Date: 2026-11-20. Status: approved by the owner in chat ("Yes, build it") after the design below was described. Small change to the provider layer of spec `2026-11-19-yocv-credential-cv-design.md` section 8.

## Intent and the why

The six-minute demo has one live-model beat. The only local model on the build laptop times out at the adapter's fixed 20 s, and there is no Azure key. The owner asked to run that beat on Claude instead. The provider layer speaks only the OpenAI chat-completions wire format, so a Claude key has nothing to attach to. This change adds a fourth adapter, `anthropic`, so the same entry runs through Claude with the same checks, and the banner and the evidence record name the provider and the model as they do for the others.

## Goals, non-goals, anti-goals

Goals: `MODEL_PROVIDER=anthropic` with `ANTHROPIC_API_KEY` runs the CV review and the YoCard draft pipeline on Claude; nothing else in the app changes; the live smoke test and the README cover it.

Non-goals: streaming; tool use; a Claude client in the Yoma integration pack (the pack's C# client stays OpenAI-compatible, and its README gains one sentence saying the prototype shows a second wire format behind the same interface); the voice-note transcription path (Azure or OpenAI-compatible only, unchanged).

Anti-goals: an npm package (AGENTS.md rule 1); the key reaching the browser, the logs or an error message; a sampling parameter that the current API version rejects; a line on the CV that the checks did not pass, in any mode.

## Constraints

- Node 20 built-ins only: the adapter uses `fetch`, as the other two do, through the shared transport in `server/providers/openai-compatible.js` (`callChatCompletions`: timeout, one retry, status mapping), so retry and error mapping still exist once.
- Messages API, `POST {ANTHROPIC_BASE_URL}/v1/messages`, headers `x-api-key`, `anthropic-version: 2026-10-21`, `content-type: application/json`, `user-agent: YoCV-prototype`. On that API version `temperature`, `top_p` and `top_k` return 400, so the adapter sends none of them; the `temperature` argument of `complete()` is accepted and ignored.
- Structured output through `output_config.format = {type:'json_schema', schema}`. The repo's schemas already satisfy the documented limits (objects with `additionalProperties:false` and `required`, arrays, strings, enums; no length or numeric constraints). `output_config.effort` is `low`: the task is a one-line rewrite, and the 20 s deadline rules out long reasoning. Thinking is left at the model's default (always on for the current models) and its tokens count toward `max_tokens`, so the adapter sends `max_tokens: 4096` regardless of the caller's `maxTokens`.
- Refusal safeguards: `anthropic-beta: server-side-fallback-2026-07-01` with `fallbacks: 'default'`, the documented default for current Claude models. A final `stop_reason` of `refusal` maps to `provider_bad_output` with the content-filter message, not retryable, as Azure's filter does. `max_tokens` as the stop reason, a non-text first block or non-JSON text map to `provider_bad_output`, retryable.
- Errors: 401 and 403 are `provider_auth`; 429 is `provider_rate_limited` with one retry; 500 to 504 and 529 (`overloaded_error`) are `provider_error` with one retry. 529 is added to the shared retry set; that is a widening only, no other adapter sees a 529 today.
- Chat shape: the callers pass OpenAI-style `messages` with `system` and `user` roles. The adapter joins every `system` message into the top-level `system` string, in order, separated by a blank line, and sends the rest as `messages` with their roles unchanged.
- Configuration: `ANTHROPIC_API_KEY` (required for the provider), `ANTHROPIC_MODEL` (default `claude-opus-5-5`; `claude-haiku-5-5` is the cheap option the README names for a demo), `ANTHROPIC_BASE_URL` (default `https://api.anthropic.com`). `MODEL_PROVIDER` accepts `anthropic`; set, it wins and the server refuses to start without the key. Empty, the order becomes Azure if its three values are set, else Anthropic if its key is set, else OpenAI-compatible if its key is set, else local. The config object gains `anthropic:{apiKey,model,baseUrl}|null` beside `azure` and `openai`.
- The provider object has the same surface as the chat providers: `name:'anthropic'`, `model`, `complete({schemaName,schema,messages,maxTokens,temperature},{signal,check})` and `cvBullets(input,{signal})`, checked against the CV schema with `matchesSchema` as the others are. `schemaName` is validated but not sent: the Messages API has no field for it.
- Honesty strings and privacy are unchanged: the masked answers and the role go to the model, never the name, phone, email or town; the key stays in the config object and no error message embeds a response body.

## Approaches considered

1. **A fourth adapter on the Messages API (picked).** One file beside the three adapters, the shared transport reused, the config selector widened. Costs one new module and its tests.
2. **Point the OpenAI-compatible adapter at Anthropic's compatibility endpoint.** Configuration only, but it runs the prototype through a compatibility shim whose structured-output support is not documented for the strict `json_schema` mode the adapter relies on, and the Anthropic skill in use here rules such shims out for new code. Rejected.
3. **The official SDK.** An npm package, which AGENTS.md rule 1 forbids. Rejected.

## What is decided

- File `server/providers/anthropic.js` exporting `createAnthropicProvider(anthropicConfig, deps)`, `toAnthropicBody` (pure, for tests) and `messageToJson` (pure, for tests). `createProvider` in `index.js` dispatches `'anthropic'`.
- `.env.example` gains an Anthropic block after the Azure block; the README's side-by-side table gains a third column and the environment table three rows; the "Model adapters" line, the real-versus-simulated row and the live-test paragraph name Anthropic; `presentation/demo-script.md` offers the Claude configuration as the first choice for the local-model beat, with Ollama as the alternative; `docs/testing-log.md` gets a row for the live run only if one is made.
- `tests/live.test.cjs` skips with a message that names the three key variables.

## What is left to the builder

Exact test names; the wording of the README sentences inside the constraints above; whether the body builder lives in one function or two.
