# Codex CLI models and review speed — what this machine actually offers

Research input for one question: can the `workflow-ship` merge-gate review run
faster than its 121s median without losing review quality?

Answer, adopted 2026-07-26: `gpt-5.6-terra` at `medium` effort, set globally in
`~/.codex/config.toml`. §3 holds the effort sweep that ruled out the higher tiers;
§5 holds the reasoning and what the choice costs.

Every claim below is tagged **MEASURED** (a command run on this machine on
2026-07-26), **DOCUMENTED** (first-party OpenAI docs or a file the CLI itself
owns), or **INFERENCE**. Nothing here comes from a blog post or a forum.

Environment: `codex-cli 0.144.6` (`codex --version`), companion plugin
`openai-codex/codex/1.0.6`.

## 1. The model list

**DOCUMENTED — the CLI's own cache.** `~/.codex/models_cache.json`
(`fetched_at: 2026-07-26T08:31:11Z`, `client_version: 0.144.6`) holds seven
entries. Read with `python3 -c "import json; …"` over the `models` array:

| slug | display name | default effort | supported efforts | visibility | context |
| --- | --- | --- | --- | --- | --- |
| `gpt-5.6-sol` | GPT-5.6-Sol | `low` | low, medium, high, xhigh, max, ultra | list | 272k |
| `gpt-5.6-terra` | GPT-5.6-Terra | `medium` | low, medium, high, xhigh, max, ultra | list | 272k |
| `gpt-5.6-luna` | GPT-5.6-Luna | `medium` | low, medium, high, xhigh, max | list | 272k |
| `gpt-5.5` | GPT-5.5 | `medium` | low, medium, high, xhigh | list | 272k |
| `gpt-5.4` | GPT-5.4 | `medium` | low, medium, high, xhigh | list | 272k (max 1M) |
| `gpt-5.4-mini` | GPT-5.4-Mini | `medium` | low, medium, high, xhigh | list | 272k |
| `codex-auto-review` | Codex Auto Review | `medium` | low, medium, high, xhigh | **hide** | 272k (max 1M) |

`gpt-5.4` and `gpt-5.4-mini` both carry an `upgrade` block in the cache:
"GPT-5.4 will be deprecated soon … Switch to GPT-5.6 Terra" and "… Switch to
GPT-5.6 Luna". `codex-auto-review` is `visibility: hide` and is the model
behind `approvals_reviewer = "auto_review"` in `~/.codex/config.toml:8`.

**MEASURED — there is no `codex models` subcommand.** `codex --help` lists
`exec, review, login, logout, mcp, plugin, mcp-server, app-server,
remote-control, app, completion, update, doctor, sandbox, debug, apply,
resume, archive, delete, unarchive, fork, cloud, exec-server, features, help`.
No model-listing command exists; the cache file is the only local enumeration.

**MEASURED — `[tui.model_availability_nux]` is not an availability list.**
`~/.codex/config.toml:244-246` contains only `"gpt-5.5" = 4` and
`"gpt-5.6-sol" = 4`. The cache carries an `availability_nux.message` field
only on `gpt-5.6-sol`. **INFERENCE:** these are per-model counters for how
often the "new model" notice was shown, not an entitlement list — seven models
are in the cache and six of them answered a live request (§4).

**DOCUMENTED — one extra model exists upstream.** OpenAI's model reference
(<https://learn.chatgpt.com/docs/models>, reached via a 308 from
`https://developers.openai.com/codex/models`) also lists **`gpt-5.3-codex-spark`**
— "Text-only research preview model optimized for near-instant, real-time
coding iteration." It is absent from this machine's cache, and §4 shows why.

**DOCUMENTED — the companion knows one alias.**
`~/.claude/plugins/cache/openai-codex/codex/1.0.6/scripts/codex-companion.mjs:72`:
`const MODEL_ALIASES = new Map([["spark", "gpt-5.3-codex-spark"]]);` So
`--model spark` resolves to the model that this account cannot use.

## 2. Speed characteristics

**DOCUMENTED — OpenAI publishes no latency numbers.** The model reference gives
qualitative positioning only, quoted verbatim:

- Sol — "Flagship GPT-5.6 model with the strongest capability for complex
  coding, computer use, research, and cybersecurity." Pick it for "ambiguous,
  difficult, or high-value tasks that need extra analysis, judgment, or polish".
- Terra — "Balanced GPT-5.6 model for everyday work, with performance
  competitive with GPT-5.5 at a lower cost." Pick it for "everyday work that
  needs strong reasoning and tool use when you do not need Sol's full depth."
- Luna — "Fast and affordable GPT-5.6 model that delivers strong capability at
  the lowest cost in the family." Pick it for "specific, high-volume tasks when
  you know what a good result looks like".
- `gpt-5.3-codex-spark` — "near-instant, real-time coding iteration."

No tokens/sec, no time-to-first-token, no p50 latency is published for any of
them. Treat any such number found elsewhere as unsourced.

**DOCUMENTED — a paid speed tier exists.** Every listed model except
`gpt-5.4-mini` and `codex-auto-review` carries
`service_tiers: [{"id": "priority", "name": "Fast", "description": "1.5x speed,
increased usage"}]` and `additional_speed_tiers: ["fast"]` in
`models_cache.json`. **MEASURED:** neither the companion nor
`codex review`/`codex exec` exposes a flag to select a service tier — the
string `service_tier` does not appear anywhere in the companion's `scripts/`
tree. So this is a ChatGPT-plan setting, not a per-call lever from the gate.

### MEASURED — end-to-end latency on a real review

Command (repeated per model), against a real 34-file / 766-insertion diff:

```
node "$COMPANION" adversarial-review --base main~3 \
  --cwd /Users/michielmerks/Projects/maestro --model <M> --json "<merge-gate focus>"
```

| run | model | effort | wall clock | verdict | findings |
| --- | --- | --- | --- | --- | --- |
| 1 | `gpt-5.6-sol` | medium (config default) | **393s** | needs-attention | 1 × medium — focus lost when the selected row is hidden |
| 2 | `gpt-5.6-terra` | medium | **87s** | needs-attention | 1 × medium — *the same bug*, "Closing a filtered-out pane drops keyboard focus" |
| 3 | `gpt-5.6-luna` | medium | **125s** | approve | none — missed it |
| 4 | `gpt-5.6-sol` | **low** (via alternate `CODEX_HOME`) | **329s** | needs-attention | 1 × medium — a *different*, cosmetic finding; missed the focus bug |
| 5 | `gpt-5.6-terra` | medium (repeat) | **79s** | approve | none — missed it |

Caveats, stated plainly: **n = 1 per cell except Terra (n = 2)**, one diff, one
machine, one time of day. The absolute seconds are not comparable to the 121s
historical median because this diff is larger than a typical branch. The
**ratio** is the signal: Terra finished in 20–22% of Sol's wall clock on the
identical target.

Run 5 is the honest counterweight. Terra found the real bug once and missed it
once. Sol found it at medium and missed it at low. Review quality is noisy at
every setting; no model in this set is a deterministic reviewer.

### MEASURED — bare round-trip floor

`codex exec --skip-git-repo-check --ephemeral -s read-only -m <M>
-c model_reasoning_effort=medium "Reply with exactly: OK"`:

| model | wall clock |
| --- | --- |
| `gpt-5.6-sol` | 9.5s |
| `gpt-5.6-terra` | 5.0s |
| `gpt-5.6-luna` | 7.5s |
| `gpt-5.5` | 5.4s |
| `gpt-5.4-mini` | 5.9s |
| `gpt-5.3-codex-spark` | 3.1s (failed — see §4) |

This measures process start plus one trivial turn, not reasoning throughput.
It only shows that no model carries a large fixed startup penalty.

## 3. Reasoning effort as a speed lever

**DOCUMENTED.** OpenAI's model reference: "Higher reasoning effort can improve
results for complex tasks, but it takes longer and uses more tokens." And:
"Use the lowest reasoning effort that produces the result you need."

**DOCUMENTED — valid values.** The config reference
(<https://learn.chatgpt.com/docs/config-file/config-reference>) gives
`model_reasoning_effort` as `minimal | low | medium | high | xhigh`. The local
cache is broader for the 5.6 family (`low … ultra`, see §1) and the companion
accepts `none | minimal | low | medium | high | xhigh`
(`codex-companion.mjs:71`). Where they disagree, the per-model
`supported_reasoning_levels` in the cache is the operative list.

**MEASURED — the review path has no effort flag, but the plumbing exists.** Both
`review` and `adversarial-review` route through `handleReviewCommand`
(`codex-companion.mjs:712`), whose parser is
`valueOptions: ["base", "scope", "model", "cwd"]` (`:714`). The adversarial
path then calls `runAppServerTurn` with `prompt, model, sandbox, outputSchema,
onProgress` and **no `effort`** (`codex-companion.mjs:411-416`). The native
path calls `review/start` with only `threadId, delivery, target`
(`scripts/lib/codex.mjs:1025-1029`) — effort is not even in that protocol
message. The `task` subcommand does pass it (`codex.mjs:1139-1140`).

The gap is two lines wide, not a wall: `runAppServerTurn` already sends
`effort: options.effort ?? null` on `turn/start`
(`scripts/lib/codex.mjs:1136-1141`). Only the review command's parser and its
call site omit it. Patching that is possible but lands in the plugin cache, so a
plugin update would silently revert the gate to the config default — a silent
regression, which is worse than a slow one. So in practice effort for a review
still comes from config.

**MEASURED — a review-specific profile is reachable, but not the way you would
guess.** This `codex` build has no `[profiles.*]` table; `-p, --profile
<CONFIG_PROFILE_V2>` means "Layer `$CODEX_HOME/<name>.config.toml` on top of the
base user config" (`codex --help`). The companion never passes `-p`. What it
*does* do is spawn `codex app-server` with the inherited environment
(`scripts/lib/app-server.mjs:190-192`: `spawn("codex", ["app-server"], { env:
this.options.env ?? process.env })`).

That gives a working lever, and I ran it: a scratch directory with a two-line
`config.toml` (`model = "gpt-5.6-sol"`, `model_reasoning_effort = "low"`) plus
symlinks to the real `auth.json` and `models_cache.json`, invoked as
`CODEX_HOME=<dir> node "$COMPANION" adversarial-review …`. It authenticated,
ran, and returned a valid review (run 4 above). **MEASURED**, exit code 0.

Cost of that trick: the alternate home has none of the real home's plugins,
hooks, MCP servers, or project trust entries. It is a viable escape hatch, not
a clean feature.

### MEASURED — the full effort sweep on Terra

Follow-up run, 2026-07-26, after §5's model recommendation was adopted. One
target for all four cells: `--base main~3` in this repo (21 files, 1426
insertions), sequential, same machine, same hour. `medium` ran with the global
config; `high`, `xhigh` and `max` ran through the alternate-`CODEX_HOME` trick
above.

| effort | wall clock | verdict | findings |
| --- | --- | --- | --- |
| `medium` | **118s** | needs-attention | 3 (2 high, 1 medium) |
| `xhigh` | **192s** | needs-attention | 3 (1 high, 2 medium) |
| `max` | **446s** | needs-attention | 4 (3 high, 1 medium) |
| `high` | **465s** | needs-attention | 4 (2 high, 2 medium) |

**The ladder is not monotonic in wall clock.** `high` took longer than `max`,
the tier above it. Run-to-run variance is larger than the effort setting's
effect, so no clean "more effort costs more time" curve can be read out of this
table at n = 1 per cell.

Finding overlap matters more than the counts. Reading the four result sets
side by side:

| issue | found in |
| --- | --- |
| identity check does not protect the writes that follow it | **4 of 4** |
| ordinary shell wrappers bypass the browser guard | **4 of 4** |
| stale smoke state approves a plain dev server | 2 of 4 (`high`, `max`) |
| four one-off findings | 1 of 4 each |

`medium` returns both universally-found issues in a quarter of the slow tiers'
wall clock. The two slow tiers add exactly one further issue class, and only in
half their runs. Everything else appears once and vanishes — that is the
reviewer drawing differently from the same bag, not depth.

Quirk worth recording: `high` and `max` answered in Dutch, `medium` and `xhigh`
in English, from an identical English prompt. Harmless for the gate (the verdict
is a fixed schema field), but it is another sign of how loosely this reviewer is
pinned.

## 4. Auth constraint

**MEASURED — this machine uses ChatGPT-account auth.** `~/.codex/auth.json`
has `auth_mode = "chatgpt"`, `OPENAI_API_KEY = null`, and an OAuth token triple.
No credential value is reproduced here.

**MEASURED — the HTTP 400 warning is real and precise.** The probe in §2
returned, for `gpt-5.3-codex-spark` only:

```
"status":400,"error":{"type":"invalid_request_error",
"message":"The 'gpt-5.3-codex-spark' model is not supported when using Codex with a ChatGPT account."}
```

All six other slugs returned `OK`. So under ChatGPT auth the usable set is
exactly the seven cache entries; the block is specific to the `-codex-`
variants, which the API-key path would presumably reach. **INFERENCE** on that
last clause — I did not test an API key, and OpenAI publishes no per-auth-mode
model matrix that I could find.

**Unverified:** the `missing field \`supports_reasoning_summaries\`` cache-load
error mentioned in the task brief. No occurrence in `~/.codex/log/`, and all
seven entries in the current cache carry that field, so the cache loads today.

## 5. Recommendation

**Switch the merge gate to `gpt-5.6-terra`, leave reasoning effort alone.**

**ADOPTED 2026-07-26.** Applied globally rather than per-skill: `~/.codex/config.toml`
lines 1-2 now read `model = "gpt-5.6-terra"` and `model_reasoning_effort = "medium"`.
A global change was chosen because every other codex consumer on this machine —
`/codex:rescue`, `/codex-review`, an interactive `codex` session — is told to leave
model and effort unset (`agents/codex-rescue.md:29-30`), so a per-skill flag would
have left them all on the slow default anyway. The cost is real and accepted: the
rescue agent, the one case where deep analysis is the point, now also runs Terra.
Revisit if rescue starts missing things.

The per-skill alternative still works if the global default ever has to go back to
Sol: add `--model gpt-5.6-terra` to the `adversarial-review` line in
`~/.agents/skills/workflow-ship/SKILL.md:48`. The flag already exists on that
code path (`codex-companion.mjs:714`), so this is a one-word change with no
plumbing.

Why Terra and not the alternatives:

- **Sol is the wrong tool for this job.** It is the deep-analysis model, and it
  spent 393s to return the same single finding Terra returned in 87s. Its own
  cache entry defaults to `low` effort; the global `medium` in
  `~/.codex/config.toml:2` is pushing it harder than OpenAI's own default.
- **Effort is the weaker lever.** Dropping Sol to `low` bought 16% (393s → 329s)
  and *lost* the real finding. Model choice bought 78%.
- **Luna is too cheap for this.** It approved a diff that contained a real
  keyboard-focus regression. Its documented job is "extraction, classification,
  transformation" — not adversarial review.
- **`spark` is unavailable.** HTTP 400 under ChatGPT auth, confirmed.
- **The "Fast" 1.5x service tier is not reachable per call** from the gate.

The honest tradeoff: Terra hit the bug in one of two runs. So did Sol across its
two configurations. This measurement cannot show that Terra is as thorough as
Sol — n is far too small, and a single 34-file diff is not a benchmark. What it
does show is that Sol's 4.5x time cost bought no extra finding on this target.
Given the gate already runs one pass per branch and hands every finding to a
human, trading unproven depth for a 4.5x faster gate is the better bet.

If a future ship reveals Terra missing something Sol would have caught, the
next lever is Terra at `high` effort through the alternate-`CODEX_HOME` trick in
§3 — likely still well under Sol's wall clock. That has not been measured.

**Superseded on the effort question — it has now been measured (§3).** Raising
Terra's effort is not the lever it looked like. `high` and `max` both land near
450s, roughly Sol's own wall clock, and they buy exactly one further issue class
beyond what `medium` finds in 118s — in half their runs. `xhigh` is the worst
cell in the table: 63% more wall clock than `medium` for no additional high-
severity finding. Keep the gate at `medium`. If depth is genuinely wanted for one
branch, `max` beats `high`: it was both faster and returned more high-severity
findings, though n = 1 cannot separate those two tiers with confidence.
