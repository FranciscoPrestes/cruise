# Cruise through a router (claude-code-router and similar)

This page holds the measurements behind one setting, `routerModels`, which is **off by default**. Plain Claude Code is not affected by anything here.

Behind a router such as claude-code-router, models appear as `<Label> (Login)/<model>`. Cruise steers none of them unless you name them in `routerModels`, and in particular it does **not** steer Anthropic ids behind a router: measured, the cache is lost there when the effort changes, and it is not in plain Claude Code. Plain Claude Code never sees these ids, so nothing changes for it, and the tests pin that. Measured through one CCR gateway, same model, one session per route, a long invented first message, then short ones, effort `medium`, `medium`, `high`, `high`, `medium` (tokens per request):

| Route | Cache read | Cache written | What happened at the change to `high` |
| --- | --- | --- | --- |
| Plain Claude Code, `claude-sonnet-5-5` | 28,471 / 38,462 / 67,364 / 67,521 / 67,611 | 38,871 / 28,927 / 116 / 45 / 43 | the cache kept being read (the first two requests were still warming it) |
| Through CCR, `Anthropic (Login)/claude-sonnet-5-5[1m]` | 0 / 30,464 / 0 / 30,464 / 30,592 | not reported | the cache was lost: all 30,668 tokens were uncached, about nine times the cost of the request before (the gateway's own accounting: $0.0616 against $0.0067); going back to an effort used before read its old cache again |

A second run through CCR, in another session, lost the cache at the change in the same way (28,400 uncached tokens). Claude Code sent the same request in both routes (adaptive thinking, three or four cache marks); what the gateway forwards upstream is not logged, so the cause is unknown. The gateway never reports a cache write, only what it read; what was not read comes back as input.

- **Other models, same test:** GPT (`OpenAI (Login)/gpt-6.1-sol`) lost the whole cache at an effort change (23,040 tokens read, then 0 read and 23,485 uncached); Gemini (`Google (Login)/gemini-3.8-flash-high`) lost part (23,166 read, then 16,080 read and 9,140 uncached). The effort itself does change their behaviour (one GPT probe: 21 tokens at `low`, 123 at `max`; on GPT `max` costs far more tokens than `high`, so consider `topLevel` `high`). Google's Claude (`Google (Login)/claude-sonnet-5-5-high`) was not measured.
- **What Cruise does if you opt in:** it steers the models you name, and its guard, which reads the gateway's numbers, stops steering for the session after the first cache loss it sees (checked on GPT) and says so. Every steered effort change costs one uncached prompt until then.
- **Judge:** a mod's call for `claude-haiku-5-5` (bare or with the router label) was answered by `gpt-6.1-sol`: the Anthropic login answered it with a 429 and the gateway's failure fallback took over (its `x-ccr-fallback-*` response headers say so), and the result does not tell a mod which model answered. A call that names another router model is served by that model. So behind a router Cruise does not use the Haiku judge until you set `judgeModel` to a model your router serves. Tried through the gateway on 30 invented prompts (6 per level, one run, so about plus or minus 9 points): `Google (Login)/gemini-3.5-flash-lite` 50% exact and 93% within one level, median 1.3 s, no unreadable answer; `Google (Login)/gemini-3.8-flash-high` 60% and 97%, median 3.7 s, two answers slower than Cruise's 6 s limit (those prompts keep your effort). For Haiku itself, 52% exact on the easy set and a mean level of 0.83 were measured on a different, larger set, so the numbers are not a like-for-like comparison. In the gateway, **Routing > Default on failure** decides what happens when a model fails; set it to Off if you do not want a failed judge call answered by another model, or add a rule (`request.body` `model` `==` `claude-haiku-5-5`, then a model of your choice) so the bare Haiku name goes where you want. The `jev` and `laya` judges do not go through the router and work as usual.
- **DeepSeek through OpenRouter** (`OpenRouter/~deepseek/*`): the effort showed no effect, so steering it would only cost judge calls; name it in `routerModels` if you want to try.
- **The panel says** why a model is left alone, naming it.

## Is the cache loss only the router? (direct tools, no router)

The same test (a long invented first message, short ones after, the effort changed between requests, one session) run directly in each tool, tokens per request:

| Tool | Result at an effort change |
| --- | --- |
| Claude Code 2.1.309, `claude-sonnet-5-5`, two independent samples | kept: 71,368 read of about 71,400 after `medium` to `high` in the first, 69,131 read and 1,603 not read in the second; returning to `medium` read the cache again |
| Codex CLI 0.163.0, `gpt-6-luna`, `codex exec resume -c model_reasoning_effort=...` | lost on all three changes: reads fell to 26%, 26% and 74% of the prompt, against 97 to 99% on requests with no change (part of that may be context Codex re-sends on a resume, not the effort alone) |
| Antigravity CLI 1.4.5, `gemini-3.8-flash` | lost on the one clean change; there the effort is part of the model name (`-medium`, `-high`), so changing it changes the model, and the old cache was read again on returning |

So only Claude Code with Anthropic models keeps the cache across an effort change, which is why Cruise steers only there. One cause is unknown in each case; these are single short experiments, not a benchmark.
