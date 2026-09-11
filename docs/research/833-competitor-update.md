# What seven products show for adopting a newer release, and where #833 should move

Serves the decision map [#833](https://github.com/fimoklei/maestro/issues/833)
(*Adopt a Harness release per target*). Read 2026-09-11. Purpose is the
builder's reference: what facts other products expose when a newer version of
something you follow exists, how they show what changed, how the move lands,
and where they fail. Every finding is anchored to a source and a date.

The candidate amendments in §7 are the only part of this document that asks
for a decision. Everything else is reference. Nothing here was applied to the
issue, the glossary or the rules.

## 1. Method

Seven products, each carrying some version of *a newer version exists → what
changed → adopt it → outcome*. Three package managers, one bot, two plugin
hosts and one API-versioning scheme. The Claude Code plugin system is again the
direct benchmark: same audience, same unit (a folder of skills), same tool.

| Product | Journey read | How |
|---|---|---|
| Claude Code plugins | `plugin list`, `plugin update`, marketplaces, renames | Docs plus local read-only CLI |
| Homebrew 6.0.22 | `outdated`, `upgrade --dry-run`, `pin` | Live CLI, Manpage, local source |
| pnpm 12.3.4 | `outdated`, `update`, `patch` | Throwaway project in the scratchpad, docs |
| Dependabot | Version-update pull requests, comment commands, errors | Docs plus public pull requests on `microsoft/vscode`, one read live in the browser |
| VS Code extensions | Extensions view, auto-update, Install Another Version | Official docs only |
| Obsidian community plugins | Settings › Community plugins, releases | Official docs only |
| Stripe API versions | Workbench Overview, upgrade, rollback, changelog | Live, signed in (sandbox, test mode), plus official docs |

Nothing was upgraded, installed or updated on this machine outside the pnpm
scratchpad. `~/.maestro`, the real `apm` state and the Harness were not
touched. VS Code and Obsidian were not read live; their sections quote
documentation and mark uncited screen details unverified. The Stripe
Dashboard was read live in a sandbox that already sits on the latest version,
so its *Behind* and *Upgrade* states rest on documentation and are marked as
such.

Two rubrics, applied together, the same as
[827](827-competitor-journey.md).

**The four principles.** P1 no dead ends. P2 no silent backlog. P3 a way
back. P4 no claim stronger than the facts read.

**Three Nielsen heuristics.** N1 visibility of system status. N3 user control
and freedom. N9 recognise, diagnose and recover from errors. Copy is judged
against `.claude/rules/copy.md`; the fault numbers F1–F13 come from the
table that file carried before commit `446e24c` condensed it (F5 unperformable
instruction, F12 two words for one concept, and so on), used here as 827 used
them.

Terms are the glossary's: **Target release**, **Selection**, **Release head**,
**Update target**, **Behind**, **Changed** / **Unchanged**, **No longer
released**, **Local edits**, **Mixed releases**, **Pending release**, **Extra
files deployed**.

## 2. Ten facts, across seven products

The facts each product exposes for the equivalent of one target following one
release. "n/a" means the product has no such concept; "—" means the docs are
silent and no live read was possible.

| Fact | Claude Code plugins | Homebrew | pnpm | Dependabot | VS Code | Obsidian | Stripe |
|---|---|---|---|---|---|---|---|
| 1 Version pair, where | installed only, list | `(2.86.0) < 2.100.0`, list | `4.17.20 → 4.18.1`, list | in the title | — | — | `(Default)` / `(Latest)` labels |
| 2 What changed | nothing | nothing | nothing; a homepage link | release notes, commits, compare link | Changelog tab | — | changelog, breaking flag per entry |
| 3 Unchanged items | n/a, one unit | hidden | counted, `(of 1)` | n/a | hidden by filter | — | n/a |
| 4 Removed or renamed | after, at startup | — | `isDeprecated` flag | n/a | — | n/a | before, `Breaking` |
| 5 Local edits | overwritten, silent | held per item, warned | fails the install | kept, or overwritten on `recreate` | held per item | overwritten | untouched (pinned code) |
| 6 Outcome, half-failed | Errors tab; restart to apply | — | diff lines; `Already up to date` trap | merged or `Superseded by` | restart prompt | — | per-version request labels |
| 7 Release with no change | auto-skipped | adoptable (`_1` revisions) | n/a | n/a | n/a | auto-skipped | adoptable |
| 8 Read failure, freshness | 8 named states; no time on the row | trust block; no time | policy line `verified 198ms ago` | 9 named errors; 3-day cooldown | — ; 2-hour delay | — ; no auto-update | `last week` window; `Updated today 1:40:16 PM UTC` on the screen |
| 9 Way back | none; old copy kept 14 days | deleted by cleanup | `add x@old` | close or `ignore` | Install Another Version | — | 72-hour rollback |
| 10 Adding while behind | latest, independent | latest, may pull shared deps | latest, independent | n/a | latest, independent | latest, independent | latest, mixes by design |

Three cells carry most of the lesson. Row 2: the three CLIs, the tools most
like Maestro's, show a version pair and **nothing about what changed** — the
step Maestro's preview is built around is absent from the field's closest
relatives. Row 6: pnpm's `outdated` says a newer version exists and `update`
answers `Already up to date`, two commands disagreeing on one fact. Row 7:
Stripe and Homebrew let a no-change release be adopted; Claude Code and
Obsidian make it unreachable, and Claude Code's version string makes a
*changed* release unreachable too when the author forgets to bump.

## 3. Stage by stage

### Behind — knowing a newer version exists

Homebrew's `outdated --verbose` is the reference row for the Release head:

```
gh (2.86.0) < 2.100.0
libtiff (4.7.1_1) < 4.7.2
python@3.14 (3.14.3_1, 3.14.4_1) < 3.14.7
```

Installed on the left, latest on the right, the comparison operator between
them. Two installed versions on one row (`python@3.14`) is the closest thing
to **Mixed releases** in the study, and Homebrew prints it flat, with no
word. In a non-interactive shell the same command prints names only:
"version information is displayed in interactive shells and suppressed
otherwise" (Manpage, read 2026-09-11). The JSON form carries
`installed_versions[]`, `current_version`, `pinned`, `pinned_version` — the
hold state travels with the pair (`brew outdated --json=v2`, measured).

pnpm prints the count with its denominator: `1 outdated packages (of 1)`,
then `lodash: 4.17.20 → 4.18.1` (measured, pnpm 12.3.4). The JSON adds
`wanted`, `isDeprecated` and `dependencyType`. The denominator is exactly the
Release head's `2 of 5 skills changed`, confirmed by a shipping tool.

The Claude Code plugin system has **no Behind state a reader can find**.
`claude plugin list` prints installed `Version` only; `claude plugin outdated`
answers `error: unknown command 'outdated'` (measured). The docs describe the
Installed tab as grouped by problems, favourites and disabled, with a `Last
used` line and a `Not used recently` header
(`code.claude.com/docs/en/discover-plugins`, read 2026-09-11) — usage
facts, never a version pair. Updates arrive by auto-update "with a random
delay of up to ten minutes" after startup, and "If any plugins were updated,
you'll see a notification prompting you to run `/reload-plugins`". The
reader learns a newer version existed only after it landed. The benchmark
skips the stage Maestro is designing.

Stripe puts the pair on labels rather than on one row: in Workbench "Your
account's default **API version** shows the label (Default). Any requests made
using the latest API version show the label (Latest)", and the upgrade
control is "**Upgrade available**, which is visible if a newer API version is
available" (`docs.stripe.com/upgrades`, `workbench/guides`, read
2026-09-11). Both are reads of the last week of requests, so an account with
no traffic has no row to label.

Read live (sandbox `merks sandbox`, test mode, 2026-09-11), the section
**API versions** on Workbench › Overview holds one row: `2026-08-26.dahlia`
with two chips, `Default` and `Latest`, and a seven-day per-day request
sparkline to its right. That is the in-sync state: the two labels land on the
same row and nothing says *you are current*; the reader infers it from the
chips coinciding. The cards above carry a meta line `Updated today 1:40:16 PM
UTC`, the read time stated once for the whole screen. The account has no
older version and no traffic, so whether `Upgrade available` renders as a
button or a link, and whether it names the target version, stays
**unverified** (§9).

Dependabot writes the pair into the title, `build(deps): bump hono from
4.13.3 to 4.13.7` (`microsoft/vscode#335421`, read 2026-09-11), and a
grouped update drops it: `build(deps): bump js-yaml` (#335420) names no
version at all. VS Code and Obsidian document an update control but not what
sits beside it; whether either shows the pair is **unverified**.

### Preview — what the move changes

Only three of seven show anything between the pair and the move, and none of
them is a CLI.

Dependabot's pull request body is the fullest preview in the study. Collapsed
`Release notes` sourced from the upstream releases page, a `Commits` list
with short hashes, a compare link (`honojs/hono/compare/v4.13.3...v4.13.7`),
and a compatibility-score badge. The release notes distinguish `Security
fixes` from `What's Changed`, so the reader sees severity before detail. The
same body carries the local-edits rule in one sentence: "Dependabot will
resolve any conflicts with this PR as long as you don't alter it yourself."

Read live in the browser, #335421 shows the release notes for **every
intermediate version**, `v4.13.7`, `v4.13.6`, `v4.13.5` and `v4.13.4`, in
descending order, cut with `... (truncated)`; the preview is the changelog
between the current and the latest version, not the latest alone. Stripe's
upgrade page is built the same way, one changelog entry per version between
the account's and the latest. The multi-version body of #335420 (`gh pr view
335420 --json body`, 2026-09-11) gives each member its own `Updates js-yaml
from 3.15.1 to 3.15.2` heading with its own `Changelog` and `Commits`
disclosures, but the second member, `from 4.3.1 to 4.3.2`, carries the
**3.15.2 changelog**, and the opening sentence reads `updates ancestor
dependency .` with an empty name. A preview that attaches the wrong version's
notes fails P4 harder than one that shows a count, because it reads as
verified.

The compatibility score fails P4. It is "the percentage of CI runs that
passed when updating between specific versions of the dependency",
"calculated from CI tests in other public repositories"
(`about-dependabot-security-updates`, read 2026-09-11). Other people's
tests, presented as a badge on your pull request. Maestro's preview compares
trees at two tags in the Harness itself; it should never import a
confidence number it did not compute.

Stripe's changelog is organised by release, then by product area, with a
table whose third column is `Breaking change?` — `Removes support for
specifying payment method types in Payment Intents and Setup Intents |
Payments | Breaking` (`docs.stripe.com/changelog`, read 2026-09-11). A
removal is stated before the move, flagged as such, in the same table as the
additions. That is **Removed by this release** and **New in this release**
in one screen. Monthly releases "include only backward-compatible changes",
which makes the no-change case a first-class, adoptable release (§3 After).

Homebrew's `upgrade --dry-run` is the only CLI preview, and it earns its
place. Measured:

```
==> Would upgrade 1 requested outdated package
gh 2.86.0 -> 2.100.0 (14MB)
```

and for the whole set, a line Maestro's preview has no equivalent for yet:

> Warning: The following dependents of upgraded formulae are outdated but will
> not be upgraded because they are not bottled: mongodb-community@7.0

followed by `Would install 23 dependencies:`. The preview names what the move
will *not* do and why, and what it will add that the reader did not ask for.
For pinned items the source is explicit: `"Not upgrading #{pinned.count}
pinned package(s):"` is a warning when nothing was named and a failure when
the pinned formula was asked for by name
(`Library/Homebrew/cmd/upgrade.rb` lines 472–480, Homebrew 6.0.22). Hold
per item, proceed with the rest, and say so — the opposite of Maestro's
whole-target block, discussed in §5.

The dry run today was blocked first by a sixteen-line tap-trust warning
(`Homebrew is currently ignoring formulae, casks and commands from these taps
because tap trust is required`) with five alternative commands. Honest and
performable, but F3 several times over.

pnpm's `--interactive` flag "Show outdated dependencies and select which ones
to update" (`pnpm update --help`) is the closest thing to a checkbox preview;
it was not run. The plain `pnpm update` prints a diff *after* the move
(`- lodash 4.17.20` / `+ lodash 4.18.1`), not before.

VS Code's preview is a `Changelog` tab on the extension page, "The extension
repository CHANGELOG if available" (`extension-marketplace`, read
2026-09-11). The manifest reference does not define a changelog field
(`api/references/extension-manifest`, read 2026-09-11), so the tab is best
effort. Claude Code shows nothing; the plugin `version` may be a commit hash
(`code-review@claude-plugins-official` → `3b600518a637`, measured), so there
is no changelog to link and no release to name. Obsidian: **unverified**; the
docs describe `Update` and `Update all` and nothing beside them.

### Update — the move, and a half-landed move

Claude Code's `plugin update` is documented as "Update a plugin to the latest
version (restart required to apply)" (`claude plugin update --help`,
measured). Each version is "a separate directory in the cache", and after an
update "Claude Code marks the previous version directory as orphaned and
removes it in a background sweep roughly 14 days later"
(`plugins-reference`, read 2026-09-11). Mid-session, "hook commands,
monitors, MCP servers, and LSP servers keep using the previous version's
path" until `/reload-plugins` — a documented Mixed state, inside one session,
with an explicit way out. The `--json` result has three fixed fields,
`command`, `outcome` (`ok` or `failed`) and `message`; a partial outcome has
no field.

The skip rule is the P2 hazard of the benchmark: "If you declare
`"version": "1.0.0"` in `plugin.json` and push new commits without changing
that string, existing users of those sources keep the cached copy, because
Claude Code sees the same version" (`plugin-marketplaces`, read
2026-09-11). A changed release that reads as unchanged is worse than a
no-change release that reads as changed: the backlog is invisible to both
sides. Maestro compares trees, not strings (#932), which is why the *No
content changes* chip can be honest.

pnpm's `update` has the sharpest failure in the study. Measured, in order:

```
$ pnpm outdated
1 outdated packages (of 1)
lodash: 4.17.20 → 4.18.1
$ pnpm update lodash
Already up to date
$ pnpm outdated
1 outdated packages (of 1)
lodash: 4.17.20 → 4.18.1
```

`pnpm add` had written the exact version `4.17.20` into `package.json`, so
`update` "based on the specified range" had nothing to do. The JSON knows —
`"wanted": "4.17.20"` — and neither human message says it. Two commands, one
fact, opposite answers, and the way out (`--latest`) is named by neither.
That is F5 in its purest form and the case Maestro's preflight must not
reproduce: when Update does nothing, the sentence names why (§7 A3).

pnpm's local-edit analogue is `pnpm patch`. Since v11 "patch application
failures always throw an error" and `allowUnusedPatches` defaults to false,
so a patch keyed to the old version fails the install after the version moved
(`pnpm.io/cli/patch`, read 2026-09-11). A block, but *after* the move is
attempted, at install time, not in a preview. Maestro's #931 guard runs
first; the field confirms the block and Maestro moves it earlier.

Dependabot's move is a merge, atomic by construction, so the half-landed
case is the *stale* pull request. When a newer version appears, the old
request is closed with one comment: `Superseded by #332063.`
(`microsoft/vscode#331726`, read 2026-09-11). The closed list shows the
chain — `0.0.2-74 to 0.0.2-76`, `to 0.0.2-81`, `to 0.0.2-82`, `to
0.0.2-83` — four requests for one dependency, each naming its successor.
Maestro's rule that "a newer tag appearing during preview asks for a new
preview" is this behaviour; the sentence that says so should name the newer
tag as Dependabot names the successor (§7 A3).

Dependabot also degrades silently on age: "If a pull request has not been
merged for 30 days, Dependabot will stop rebasing the pull request"
(`managing-pull-requests-for-dependency-updates`, read 2026-09-11). Nothing
on the request says rebasing stopped. P2.

Homebrew runs `brew cleanup` "for the upgraded formulae and casks" after
every upgrade (`brew upgrade --help`, measured), so the previous keg is
deleted by default. VS Code: "After an update, you are prompted to restart
the extension host (**Restart Extensions**)". Obsidian downloads three named
files "from the GitHub release whose tag matches the `version` in your
manifest" (`Submit your plugin`, read 2026-09-11); whether a failed third
download leaves two new files and one old is **unverified**.

Stripe's move is one setting: "Review which API version will be assigned to
your account, and click **Upgrade**." It "switches the version used by API
calls that don't have the `Stripe-Version` header and also switches the
version used to render objects sent to your webhooks" — with the carve-out
"if an endpoint has an explicit version set, it always uses that version"
(`upgrades`, read 2026-09-11). Mixed by design, and the Overview labels each
recent request with the version it used, so the reader can see which callers
stayed behind. That is a per-item outcome view after a whole-target move —
the shape #932 chose.

How the Overview renders the rollback window (a countdown, a date, or
nothing) and whether pinned webhook endpoints are called out after an upgrade
could not be read: the sandbox sits on the latest version, and running an
upgrade was out of scope. **Unverified** (§9).

### After — outcome per item, freshness, way back

pnpm's post-move diff is the reference for an outcome row: same subject,
two lines, one sign each (`- lodash 4.17.20` / `+ lodash 4.18.1`). It is
827's A3 (two sentences of identical grammar) already shipped as a diff.

Freshness is thin everywhere. pnpm stamps its policy check — `Lockfile
passes supply-chain policies (verified 198ms ago)` — and nothing else. Homebrew
prints `Auto-updated Homebrew! Updated 4 taps` before the list and puts no
time on any row. Claude Code writes `lastUpdated` per marketplace into
`known_marketplaces.json` (`2026-09-11T11:54:42Z` today, measured) and
`claude plugin marketplace list` prints name and source only — the same gap
827 found on 2026-09-07, unchanged. Stripe's read is a window, "requests
made in the last week", stated on the page. VS Code's freshness is a
deliberate lag: `extensions.autoUpdateDelay` defaults to `2` hours; "Set the
value to `0` to install updates as soon as they are published."

Ways back, for the record only (out of scope for #833):

- **Stripe**, the best: "For 72 hours after you've upgraded your API version,
  you can safely roll back to the version you were upgrading from", and
  "webhooks that were sent with the new object structure and failed will be
  retried with the old structure". The way back also repairs what broke in
  between.
- **VS Code**: "right-click the extension and select **Install Another
  Version**. You can then select a version from the available list."
- **pnpm**: `pnpm add lodash@4.17.20` re-pins (measured, used to reset the
  scratchpad).
- **Dependabot**: close the request, or `@dependabot ignore this major
  version` "will close this PR and stop Dependabot creating any more for this
  major version (unless you reopen the PR or upgrade to it yourself)".
- **Homebrew**: none by default; cleanup deletes the old keg.
- **Claude Code**: none documented; the orphaned directory survives ~14 days
  with no command that points at it.
- **Obsidian**: none documented; `versions.json` routes *older apps* to older
  plugin versions, not users to older releases.

Removal after the move: Claude Code's `renames` map is told **after**, at the
next startup — `Renamed to "code-formatter" in the "acme-tools" marketplace`,
or for a `null` entry "the notice reports that the plugin was removed from the
marketplace". Without the map, `plugin-not-found`; with a remote source,
`plugin-cache-miss` and "the user must run `/plugin install` once to fetch it
under the new name" (`plugin-marketplaces`, read 2026-09-11). Maestro's
choice to state removal in the preview, before the move, has one ally (Stripe)
and one counterexample (Claude Code) in the field.

### Adding while behind

No product forces the update first, and none lands the new item on the old
version. Homebrew, pnpm, VS Code, Obsidian and Claude Code install the new
item at latest and leave the rest alone. Two carry a side effect worth
knowing. Homebrew may upgrade shared dependencies the new formula needs
(`Would install 23 dependencies` on the dry run; not measured for `install`),
so adding can move other items without a preview. Stripe creates a new
webhook endpoint at the latest version from the Dashboard — "If you're
upgrading to the latest API version, you can use the Dashboard or the API to
create the endpoint. For other versions, use the API" — so adding while behind
*creates* a mixed account. Maestro's rule (Deploy on a behind target opens
Update target with *Added by this deploy*, #937) is stricter than any of the
seven and has no counterexample that argues against it; Stripe's endpoint is
the case it prevents.

## 4. What they get wrong, ranked

Ordered by how much the failure would cost Maestro's reader.

**1. Two commands disagree on one fact and neither says why.** pnpm's
`outdated` reports a newer version; `update` answers `Already up to date`;
`wanted` in the JSON explains it and no human sentence does. F5, and P1: the
reader has no next step. Homebrew's pinned case is the same shape done
right — `Not upgrading 1 pinned package:` names the item and the reason.

**2. A move that changes content but reads as no change.** Claude Code skips
a release whose `version` string did not change, whatever the commits did.
The docs' fix is an instruction to the author ("bump it on every release").
P2 at the source: the backlog exists and no screen can show it.

**3. Nothing between the pair and the move.** Homebrew, pnpm and Claude Code
show what version, never what changed. pnpm's `Details` column is a homepage
URL. Only Dependabot, Stripe and VS Code carry a changelog, and VS Code's is
"if available".

**4. Told after, at the next start.** Claude Code's rename and removal
notices appear when the user starts a session with the old name in settings.
The move already happened; the reader is reconciling, not deciding. Removal
without a `renames` entry is a bare `plugin-not-found`.

**5. A held item that stops being told about.** VS Code: "Disabled
extensions are not updated automatically and update the next time you enable
them." Dependabot stops rebasing after 30 days. Both are silent backlogs
created by a reasonable rule, and neither surfaces the count of items it is
no longer updating.

**6. The way back deleted by the way forward.** Homebrew's upgrade runs
cleanup; Claude Code sweeps the old directory in 14 days without ever
offering it. A way back that exists on disk but not on any screen is not a
way back (827 §4.4 had the same finding for Shopify).

**7. A confidence number computed elsewhere.** Dependabot's compatibility
score is other repositories' CI. It sits on your request as if it were about
your code. P4.

**8. Overwrite without a word.** Obsidian replaces `main.js`,
`manifest.json` and `styles.css`; Claude Code lands a new cache directory.
Neither documents any check of the copy it replaces. Maestro's #931 guard
compares hashes before every install; nothing in the field does.

**9. A version that is not a version.** Claude Code labels a commit hash
`Version` (827 §3 found this on the catalog; it is now on the installed row
too: `3b600518a637`). A pair of hashes cannot be ordered, so *Behind* is
undefinable.

**10. Freshness nowhere near the row.** Homebrew, pnpm, VS Code and Claude
Code put no time on the outdated reading. Stripe's `Updated today 1:40:16 PM
UTC` (one stamp for the whole Overview, read live) and pnpm's `verified 198ms
ago` are the only stamps, and the pnpm one is on a different fact.

## 5. Confirmed by comparison

Decisions in #833's *Settled while charting* that the field supports, listed so
they are not traded away later.

1. **A target card leads with the pair and a counted changed set.** Homebrew's
   `(2.86.0) < 2.100.0` and pnpm's `(of 1)` denominator are the same head in
   two CLIs. Dependabot puts the pair in the title and loses it on grouped
   requests — the counter-case that shows why the head keeps both numbers.
2. **Removal is stated in the preview, before the move.** Stripe's
   `Breaking change?` column is the only product that does this, and Claude
   Code's told-after rename notice is the cost of not doing it.
3. **Changed is measured between the target's release and the latest, not
   against the last release alone.** Dependabot lists the release notes of
   every intermediate version (#335421 carries four), and Stripe's upgrade
   page shows one changelog entry per version between the account's and the
   latest. Maestro's tree diff between the two tags covers skipped releases
   by construction; the preview should never read as "what v0.3.4 changed".
4. **A no-change release is adoptable, same control, with a chip.** Stripe's
   monthly releases are exactly this ("You can safely upgrade to a new monthly
   release without breaking any existing code"), and Homebrew offers a `_1`
   revision through the same `upgrade`. Claude Code and Obsidian, which skip
   such a release, are the products with the invisible-backlog problem.
5. **New unselected skills as a plain list, never auto-selected.** Homebrew
   prints `New Formulae` as a plain list at the top of every update and
   installs none of them. Update never changes the selection there either.
6. **Only the latest release can be adopted.** Homebrew, Claude Code,
   Obsidian, Dependabot and Stripe's account upgrade all move to latest only.
   VS Code (Install Another Version) and pnpm (`add x@ver`) allow any version,
   but as a way back, not as a target for Update. Two of seven; not a reopen.
7. **Local edits block the whole target.** Three products hold per item and
   proceed (Homebrew `pin`, VS Code per-extension Auto Update, Stripe pinned
   code), which clears the three-product bar for a reopen. No principle moves
   for Maestro, because those items are independent and a target's skills are
   not: holding one skill at v0.3.2 while the rest move to v0.3.4 *is* Mixed
   releases, the state #932 defines as incomplete. A per-item hold would turn
   the half-failed state into a chosen one, and P2 loses. Recorded, not
   amended. The transferable half is the copy: Homebrew names the held item
   and the count, which Maestro's block already does.
8. **Deploy on a behind target opens Update target.** No product forces it,
   and Stripe shows what the alternative produces: a new endpoint at latest
   beside an account that is behind. Stricter than the field, with the field's
   worst case as its justification.

## 6. Beyond the stages

Findings that apply to the whole cockpit. None is a job yet.

- **A preview says what it will not do.** Homebrew's dry run names the
  dependents it will leave outdated and why. Maestro's preview names Local
  edits; it could name every reason a skill is left where it is, in one
  line per reason.
- **Restart to apply is a fact the reader needs.** Claude Code writes
  "(restart required to apply)" in the command's own help, and VS Code prompts
  `Restart Extensions`. Whether a deployed skill's new content reaches a
  running Claude Code session is **unverified** here; if it does not, the
  Update outcome needs one sentence saying so.
- **A rollback that repairs the interval.** Stripe retries failed webhooks
  with the old structure after a rollback. When the LATER rollback job is
  specified, the question "what happened between the two moves" is part of
  it.
- **Disabled is a backlog.** VS Code's rule that disabled extensions are not
  updated has a Maestro cousin: a *Pinned per skill* target has no Update
  target. The head and notice make that visible; keep it so.
- **Freshness on the fact, not the page.** Same finding as 827 §6, now with
  four more products that fail it. The Release head's meta line is where the
  read time belongs (§7 A2).
- **The JSON knows more than the sentence.** pnpm's `wanted`, Homebrew's
  `pinned_version`, Claude Code's `lastUpdated` all exist on disk and are
  absent from the human output. Wherever Maestro's read model holds a fact
  that explains a state, the sentence should carry it.
- **A commit hash is not a version.** Maestro names releases by tag
  (ADR-0014, ADR-0021); 827's A7 (carry the tag beside the fact) stands.

## 7. Candidate amendments to #833

Four, all in class (a), presentation and copy, free. Ordered by value. Each
names what it would change in the flow ticket (#932) or the spec. None is
applied; this section is the decision.

Class (b), reopen candidates against *Settled while charting*: **none**. Two
decisions reached the three-product bar (local edits, §5.7; latest-only did
not, §5.6) and in neither does a principle move for Maestro. Both are
recorded above as observations.

### A1 — Say what the move will do, per section, in the preview's first line

**What.** The Update target dialog opens with one sentence that counts its
sections with their verbs: *Updates 2 skills, removes 1, leaves 3 unchanged.*
When Local edits block, the same sentence form names the block: *Not
updating: code-review has local edits.*

**Why.** Homebrew's dry run leads with `Would upgrade 1 requested outdated
package` and `Not upgrading 1 pinned package:` before any detail; pnpm leads
with `1 outdated packages (of 1)`. Both let the reader stop after one line.
The sections already exist in #932; this is their sum, stated once.

**Cost.** One sentence in the dialog's copy module, with zero, one and many
forms.

**Recommendation.** Take it. Same-grammar sentences per outcome, as 827 A3.

### A2 — Carry the read time on the Release head's meta line

**What.** The Release head's meta line reads *Compared with v0.3.4, read 4
min ago*, and *Changes could not be read* keeps the last successful time:
*Changes could not be read, last read 2 h ago.*

**Why.** Four of seven products put no time on the outdated reading; the two
that do (Stripe's `Updated today 1:40:16 PM UTC`, pnpm's `verified 198ms
ago`) are the only rows a reader can trust after leaving the tab open, and
Stripe's stamp sits on the screen, not beside the version row it qualifies. 827's A1 asked for this
on the Harness stages; the target card is the same fact on another screen,
and the glossary already fixes the word (*Read*).

**Cost.** One meta line, format already in the glossary's *Read* row.

**Recommendation.** Take it.

### A3 — When Update does nothing, name the release that made it moot

**What.** The preflight failure "tag still latest" (#932) reads *Release
v0.3.5 appeared after this preview. Select Update target to preview it
again.* Never a bare *Nothing to update* or *Already up to date*.

**Why.** pnpm's `Already up to date` beside `1 outdated packages (of 1)` is
§4.1, the costliest failure in the study. Dependabot's `Superseded by
#332063.` is the fix: one sentence, the successor named, the next step
implied. The preflight already knows the newer tag; the sentence should
carry it.

**Cost.** One notice in the copy module; the tag is in the preflight result.

**Recommendation.** Take it. Cause first, then the control, per copy.md.

### A4 — Link each changed skill to its folder at the new release

**What.** Every row under *Changed* and *New in this release* carries a link
to the skill folder at the new tag on GitHub
(`github.com/<owner>/<harness>/tree/v0.3.4/.apm/skills/<name>`).

**Why.** Dependabot's compare link and Stripe's per-entry changelog are the
only "what changed" surfaces in the study, and both are links out to the
source of truth rather than a rendered diff. Maestro states *changed* from a
tree comparison and shows nothing of the content; a link makes the claim
checkable without building a diff view. ADR-0014 (GitHub-only origins) makes
the URL constructible from facts already read.

**Cost.** One URL per row, built from origin, tag and skill name. No diff
rendering, no new read.

**Recommendation.** Take it. Name the link by its destination (*code-review
at v0.3.4*), per `design.md`.

## 8. Sources

All read 2026-09-11 unless stated.

**Claude Code plugins.** `code.claude.com/docs/en/plugins`,
`plugin-marketplaces` (incl. Troubleshooting), `plugins-reference`,
`discover-plugins`, `errors` (index only; the plugin entries were truncated
by the fetch). Read-only local: `claude plugin --help`, `claude plugin list`
and `--json`, `claude plugin update --help`, `claude plugin details
eli5@claude-community`, `claude plugin marketplace list`, `claude plugin
outdated` (unknown command), and the on-disk `known_marketplaces.json` and
`installed_plugins.json`. Nothing installed, updated or removed. The
eight failed-read states are quoted from 827 (read 2026-09-07).

**Homebrew 6.0.22.** `brew outdated --verbose`, `--json=v2`, `brew outdated
gh` / `git` (exit codes), `brew upgrade --help`, `brew upgrade --dry-run gh`
and bare, `brew pin --help`, `brew list --pinned`; `docs.brew.sh/Manpage`
(outdated, upgrade, pin, unpin); local source
`Library/Homebrew/cmd/upgrade.rb` (lines 425–484) and `cmd/outdated.rb`
(line 90). No upgrade run.

**pnpm 12.3.4.** Scratchpad project `pnpm-spike`: `pnpm add lodash@4.17.20`,
`pnpm outdated` (plain, `--long`, `--format json` via `rtk proxy`), `pnpm
update lodash`, `pnpm update lodash --latest`, `pnpm update --help`;
`pnpm.io/cli/outdated`, `cli/update`, `cli/patch`.

**Dependabot.** `docs.github.com` pages `about-dependabot-version-updates`,
`managing-pull-requests-for-dependency-updates`,
`optimizing-pr-creation-version-updates`, `dependabot-options-reference`
(`open-pull-requests-limit`, `groups`, `cooldown`),
`about-dependabot-security-updates` (compatibility scores),
`troubleshooting-dependabot-errors`. Live via `gh`: `microsoft/vscode`
pull requests #335421 (body), #335420 (title and body), #331726 (closing
comment) and the closed list. #335421 also read in the browser, signed in;
screenshot
`/var/folders/md/9htx0_616wl_v3lv2ldd9pcr0000gn/T/claude-chrome-screenshots-G2SAj3/screenshot-1789134099066-1.jpg`.

**VS Code.** `code.visualstudio.com/docs/configure/extensions/extension-marketplace`,
`api/references/extension-manifest`. The `code` CLI is not installed.

**Obsidian.** `obsidian.md/help/community-plugins` (redirect from
`help.obsidian.md`), `docs.obsidian.md` pages `Release your plugin with GitHub
Actions`, `Submit your plugin`, `Reference/Manifest`, `Plugin guidelines`,
`Reference/TypeScript API/Plugin/saveData`, `Anatomy of a plugin`;
`obsidianmd/obsidian-sample-plugin` README (versions.json).

**Stripe.** `docs.stripe.com/api/versioning`, `upgrades`, `changelog`,
`workbench/guides`, `sdks/set-version`, `webhooks/versioning`. Dashboard
read live, signed in: sandbox `merks sandbox`, test mode, Workbench ›
Overview › API versions, 2026-09-11; screenshot
`/var/folders/md/9htx0_616wl_v3lv2ldd9pcr0000gn/T/claude-chrome-screenshots-G2SAj3/screenshot-1789134053515-0.jpg`.
The live account redirects to the sandbox (payments not activated), so no
second account state was available.

## 9. Not verified

Carried forward so nothing here is mistaken for a measurement.

- **Claude Code**: whether the Installed tab or the Discover detail pane
  shows any update-available marker or a latest version; what `claude plugin
  update` prints when nothing is newer; what happens to a hand-edited cache
  directory on update (assumed replaced by a new directory, per the versioned
  cache rule); the full text of the `errors` page's plugin entries.
- **Homebrew**: per-formula outcome lines and the state after one formula
  in a multi-formula upgrade fails; whether `install` of a new formula
  upgrades shared dependencies without a preview; any renamed or deleted
  formula message.
- **pnpm**: registry-unreachable output for `outdated`; the state after an
  interrupted `update`; the `--interactive` screen.
- **Dependabot**: what the request shows when a member of a group cannot be
  updated; the exact "Dependabot is unable to update" wording on a request;
  whether the 30-day rebase stop is announced.
- **VS Code**: the update count badge, the version pair on a card, the
  `Install Another Version` list contents (dates), the incompatible-extension
  message, extension-pack update behaviour, the half-failed `Update All`
  state, whether extension settings survive an update.
- **Obsidian**: whether a version pair or release notes appear beside
  `Update`; whether `data.json` survives an update (inferred: the update
  downloads three named files and `data.json` is not one of them); the
  half-failed three-file download; any failed-check state; any way back.
- **Stripe**: the *Behind* row (the sandbox is on the latest version):
  whether `Upgrade available` is a button or a link and whether it shows the
  target version before `Upgrade`; how the rollback window is displayed
  after an upgrade; whether pinned webhook endpoints are called out;
  test-mode versus live-mode upgrade independence.
- **Maestro-side**: whether a running Claude Code session picks up a
  re-deployed skill without a restart (§6).
