# What seven products show for the same journey, and where the spec should move

Serves spec [#827](https://github.com/fimoklei/maestro/issues/827) and the
decision map [#805](https://github.com/fimoklei/maestro/issues/805). Read
2026-09-07. Purpose is the builder's reference: what facts other products
expose for a change moving from local work to a release, how they render
them, and where they fail. Every finding is anchored to a source and a date.

The seven candidate amendments in §7 are the only part of this document that
asks for a decision. Everything else is reference.

## 1. Method

Seven products, each carrying some version of local work → waiting → published
→ a way back. Five analogues plus one adjacent tool plus one direct benchmark.

| Product | Journey read | How |
|---|---|---|
| GitHub | Pull request inbox, pull request page, releases | Live, signed in |
| Vercel | Deployments list, deployment detail, promote and rollback | Live, signed in |
| Zapier | Zap list, editor draft, publish gate | Live, free plan |
| GitLab | Merge request list and page, releases | Official docs |
| Figma | Branch list, review and merge, archive and restore | Official docs |
| Shopify | Theme library, preview, publish, updates, Timeline | Official docs |
| Claude Code plugins | Discover, Installed, update, errors | Docs plus local read-only CLI |

Figma and Shopify could not be read live: Figma branching needs a paid plan,
and the Shopify store is paused behind a reactivation payment, which was not
filled in. Their sections rest on quoted documentation and mark uncited
details unverified.

Two rubrics, applied together.

**The spec's own four principles.** P1 no dead ends. P2 no silent backlog.
P3 a way back. P4 no claim stronger than the facts Maestro has read.

**Three Nielsen heuristics**, narrowed to the ones the principles restate.
N1 visibility of system status. N3 user control and freedom. N9 help users
recognise, diagnose and recover from errors. Copy is judged against
`.claude/rules/copy.md`, whose fault numbers (F1–F13) are used directly.

## 2. What a stage row carries, across seven products

The facts each product puts on a row, for the equivalent of one skill in one
stage.

| Fact | GitHub | GitLab | Vercel | Zapier | Figma | Shopify | Plugins |
|---|---|---|---|---|---|---|---|
| State word | yes | yes | yes | no, a toggle | badge, in-file only | yes | yes |
| Who must act next | yes, by section | yes, by bucket | no | no | no | n/a | no |
| Reviewer identities | yes | yes, per person | n/a | n/a | requested only | n/a | n/a |
| Verdict after review | yes | yes, 4 states | n/a | n/a | yes, 3 states | n/a | n/a |
| Checks result | yes | yes, fused cell | yes | count + severity | no | n/a | n/a |
| Age or freshness | yes | list only | yes, per fact | no | unverified | live theme only | last updated |
| Underlying identity | branch pair | branch pair | commit + branch | no | parent/child names | version number | ref + sha, hidden |
| Read failure state | n/a | no | **no** | no | no | probably no | **yes, 8 named** |
| Empty vs not configured | n/a | unverified | **yes, 2 chips** | no | unverified | unreachable by design | partly |

Three cells carry most of the lesson. Vercel has seven deployment statuses and
none of them means "the read failed" — it assumes its own reads succeed. The
Claude Code plugin system is the only product of the seven with a named
vocabulary for a failed read, and it has eight of them. Shopify has no empty
state at all, because it made one unreachable.

## 3. Stage by stage

### Pending proposal — local work not yet sent

Zapier is the closest true equivalent, and it is the weakest thing in this
study. A published Zap can hold exactly one unpublished draft. There is **no
chip, no banner and no "you have unpublished changes" notice** anywhere in the
documentation. The only two surfaces that reveal a pending draft are a button
label flipping from `Edit Zap` to `Edit draft`, and a row at the top of a
sidebar inside the editor you must open first.

The list page shows Name, Last modified, Status and Owner. A draft appears in
none of them.

That is P2 failing at its centre: unsent work with no indicator anywhere the
reader would look. It is the direct evidence for the spec's user story 6,
that additional local edits must remain visible after proposing.

Figma's branch list has the same hole in a different shape. It has an
`Active` tab, and Active means only "not archived". No staleness, no
behind-ness, no review state in the list. Figma's own best-practice guidance
asks users to adopt emoji naming conventions to compensate. When the
documented fix for a backlog is a naming convention, the system never read
the backlog.

Shopify inverts the problem and solves it. Every unpublished thing sits in
one named list, `Draft themes`, on the same screen as the live theme. No
archive, no second page, no hidden tier — so nothing accumulates invisibly.
The cost is that drafts carry no date, so a three-month-old draft looks like
one saved this morning.

**Nobody in this study does Pending proposal well.** Shopify comes closest by
keeping everything on one screen. The spec's decision to give the stage a
table of its own, with local reversions visible against a differing proposal,
has no competitor to beat.

### Pending review — waiting on someone

GitHub's pull request inbox is the closest existing thing to the spec's three
stacked tables. Six collapsible sections, each with a count:

```
Needs your review              0
Needs your teams' review       0
Your drafts                    0
Waiting for review or checks   0
Needs action                   0
Ready to merge                 0
```

Every section carries an info icon. Opening the one on `Waiting for review or
checks` shows the definition plus the literal query that fills it:

> Your pull requests that are waiting for a review or have running checks
>
> `is:pr author:@me state:open -is:draft archived:false -review:approved
> -review:changes_requested -status:failure sort:updated-desc`

with a copy button and an open-in-search button. **This is the fourth
principle taken further than the spec goes.** The reader is shown the facts
the classification was derived from and can run the derivation themselves.

GitLab's cross-project merge request homepage partitions by who is holding
the work: *Your merge requests* with substates Draft and Reviewers needed,
*Review requested* with Changes requested and Reviewer commented, *Returned
to you*, and inactive buckets *Waiting for assignee*, *Waiting for approvals*,
*Approved by you*, *Approved by others*. Its **Checks** column fuses four
facts into one cell: a conflict warning, unresolved threads as `0 of 3`, the
approval state and the pipeline.

GitLab's approval widget is one control whose **label is the verdict**:
`Approve` when more approvals are needed, `Approve additionally` when they are
satisfied, `Revoke approval` when you already approved. No separate badge.

Figma's three review badges are the best-written copy found anywhere in this
study:

> **Approved:** Your changes have been approved, but the branch has not yet
> been merged. This usually means the reviewer does not have edit access to
> the main file or is waiting for other reviewers to add their reviews too
> before merging.

The badge states the fact and then names the two likely causes, without
folding either into the label. That is exactly the spec's user story 15,
already shipped by someone else.

### Pending release — merged, not yet published

GitHub separates `Releases` and `Tags` as two tabs on one screen. The
distinction Maestro needs for a released-only Inventory is settled here
structurally rather than in prose: a tag is not a release.

A release header reads:

> GitHub CLI 2.100.0 `Latest` · github-actions released this 4 days ago ·
> 🔒 `Immutable` · `v2.100.0` · `45437bc` ✅

Tag and commit sit side by side, so the reader can check the claim. The
`Immutable` marker states a property of the artefact: the content cannot
change underneath you. Maestro's released-only Inventory rests on exactly
that promise and currently says it nowhere.

Vercel's environment chip is the sharpest single rendering found. The word
`Production` appears on many rows, but **filled blue** means this deployment
is serving production now, and **outline** means it was built for production
and no longer serves it. One chip, three facts, no second status reading.

Shopify makes the whole stage cheap by never overwriting. Publishing a theme
is a swap:

> "If you publish a new theme, then your previously published theme moves to
> the **Draft themes** section. None of your theme changes are lost."

The old thing is demoted, not deleted. Reverting is publishing it again.
There is no rollback feature, no version tree and no restore screen, because
the ordinary action already runs backwards. This is the laziest correct
design in the study.

GitLab's release cards carry an **Upcoming Release** badge for a future
release date and a **Historical release** badge for a past one, where "release
evidence is not available". A weaker-facts badge on an otherwise identical
card is the honest pattern for any row read from a less reliable source.

GitLab also gets the object model backwards: delete the tag and the release
disappears, delete the release and the tag survives, yet the page presents
the release as the primary object.

### Inventory — what a consumer can actually get

The Claude Code plugin marketplace is the direct benchmark and it fails the
spec's core rule in the opposite direction to what one would expect.

It never collapses a read failure to empty. A failed catalog fetch keeps the
cached rows, keeps them installable, and labels the failure. Eight named
states, each ending in a runnable command:

> **Marketplace unavailable**: The marketplace source couldn't be reached. …
> Run `/plugin marketplace update` to retry.
>
> **Last known version**: Claude Code is showing a cached copy of the plugin
> from the last time it was available. The plugin still loads, but updates
> can't be fetched until the source is reachable again.

But **the label lives on a different tab from the rows**. A user on Discover
sees a full, confident list read from a cache that may have failed to refresh
minutes ago. The system knows; the screen the reader is on does not say.

There is no concept of "released". The official catalog's 291 entries carry a
`version` field on 14 of them; for the rest the displayed "Version" is a
commit hash such as `85cce0381e78`, and most entries pin `ref: main` plus a
sha, meaning the catalog snapshots a branch tip. **The product labels a
commit hash "Version" and offers a branch tip as installable.**

Removal is inferred from absence rather than declared, with one exception.
A publisher can write `renames: { "legacy-linter": null }`, an append-only
tombstone that says "gone" authoritatively. Everything else produces
"Plugin not found in marketplace", whose own text admits it cannot tell the
two causes apart: "The marketplace may have removed it, or you removed the
marketplace."

Vercel ships the distinction the spec needs, on two cards side by side:

- Speed Insights — amber chip **`No Data`**
- Web Analytics — grey chip **`Not Enabled`**

Two chips, two colours, two meanings. Feature on and genuinely empty, versus
nothing read because nothing is configured. That is ADR-0021 points 7–9
rendered in a shipping product, and it needs no explanation to read. Vercel
lacks the third case, a read that was attempted and failed, which is the case
the spec adds.

Shopify runs the same slot with only two states. The version number sits on
the row, and when an update exists:

> "When an update for a theme is available, a notification replaces the theme
> version number in your Shopify admin."

When none does, the row reads `This theme is up to date`. One slot, two
states, and the number the user habitually reads disappears in the stale
case, so it cannot be overlooked. But there is no documented third state for
a check that failed, and if a failed check falls back to showing the version
number, the row claims "current" from a check that never completed. That is
P4's exact failure mode. **Unverified** against a live admin, but no doc
describes any third state.

## 4. What they get wrong, ranked

Ordered by how much the failure would cost Maestro's reader.

**1. An unavailable action hidden instead of disabled.** GitLab: "You cannot
revert a commit that has already been reverted, as the **Revert** option is
not shown in this case." Deployment rollback buttons "might be hidden or
disabled" under deployment safety, with no stated reason. Figma hides the
branch-creation entry entirely when a sharing setting is off: "If this is
disabled, viewers won't see the option to create or edit branches." A missing
button is not an explanation, and the system knows the reason in all three
cases.

Vercel does the opposite and it works. `Instant Rollback` and `Promote` stay
in the menu, greyed, and hovering the disabled item says "This Deployment is
already in Production". The reason is only in a tooltip, which Maestro's
screen design forbids, but the pattern of disabled-plus-reason is right.

**2. An instruction the reader cannot perform.** Zapier's disabled `Publish`
tooltip reads, in full:

> Fix your Zap to publish.

That is F5 exactly: no place, no command, no control named. The real answer
is a Status sidebar two panels away with an issue count, a severity and a
click-through to the offending step. The tooltip knows the answer and
withholds it. GitLab's stuck merge check has the same shape from the other
direction: "Wait a few seconds and the status should update automatically",
a wait with no bound and no fallback control.

Shopify has a gentler version. `"Theme added: code edits could not be
included"` is honest, but the recovery is to copy custom code across by hand,
and the message names no file. The system knows which paths conflicted;
showing them would turn unbounded work into bounded work.

**3. Silent state regression.** GitLab removes an approval when new commits
land: "By default, an approval on a merge request is removed when you add
more changes after the approval." The list returns to "Required approvals are
missing" with nothing recording that it was previously satisfied. Auto-merge
cancels itself on new commits and the docs never say how the author is told.
Zapier auto-disables a Zap at 95 % errors over seven days, and only Team and
Enterprise plans get a warning email.

The spec already guards this: "Updating does not clear GitHub's review
verdict", and requested changes remain visible until GitHub's verdict changes.
That decision is correct and this is why.

**4. A terminal state with no return, reached in one click.** Figma: "The
branch will be archived and locked after it has been merged" and "It's not
possible to restore a merged branch." Undoing a merge means restoring the
whole main file to a timestamp, with a Caution admitting it "won't preserve
any other changes made to the main file, including other branch merges".

Worse, the two documented recovery paths contradict each other. One article
says undoing a merge "won't restore an archived branch. You'll need to
**restore the branch**"; the other says a merged branch cannot be restored.
For the commonest failure, "we merged too early", the documentation
contradicts itself.

Shopify's version is narrower but real: `"Deleting a theme is a permanent
action"` and the Timeline "can't recover deleted theme files". The only
reverse gear is a download taken beforehand. A way back that must be taken
before the action is a precondition, not a way back.

**5. A vocabulary with no word for a failed read.** Vercel's seven statuses
are Ready, Error, Building, Queued, Initializing, Canceled, Blocked. Every one
is a process fact about the deployment. None means "we could not determine
this". Zapier's eleven run statuses have the same gap. Shopify's freshness
slot appears to hold two states and no third. `claude plugin marketplace list`
prints name and source with no reachability and no last-fetched time, even
though `lastUpdated` sits on disk.

**6. Documented failure modes the system never detects.** Figma ships a
four-row Problem/Solution table for incomplete merges. Row three asks the
user to notice, by eye, that "Not all changes from the branch are applied to
the main file". Figma computed a change count for the review screen and never
verifies it against the merged result. A "Merged" state that was never checked
is a claim stronger than the facts read.

**7. Two words for one concept.** Figma's own docs say "Reviewers can either
**Approve** the branch or **Request changes**" on one page and "select
**Suggest changes**" on another. Zapier runs three vocabularies for adjacent
states, `Published`, `Status: on` and `Pending billing`, with nothing on
screen relating them. F12 is not a pedantic rule; two products this size both
break it.

**8. Colour carrying meaning alone.** GitLab "shows **Merge** in red" when the
pipeline failed but the merge is still allowed. Zapier's list status is a
toggle with no word, so a never-published draft and a deliberately paused Zap
are the same pixel.

**9. A freshness stamp that stops updating.** GitLab's API exposes
`prepared_at`, which "does not update if more changes are added". A stale
timestamp is worse than none.

**10. Deciding without the data to decide.** Shopify caps a store at 20
themes and shows a last-saved date on the live theme only — the one item you
cannot delete. At the cap the user must choose what to remove using
information the library does not show.

## 5. Confirmed by comparison

Five spec decisions that the field supports, listed so they are not traded
away later.

1. **Three separate tables, one row per stage.** GitHub's inbox proves
   stacked, named, counted sections are legible at six. GitLab proves the
   partition should be by who must act next.
2. **Approved stays in Pending review until merged.** Figma ships that exact
   badge with that exact caveat, and its reasoning matches the spec's.
3. **Requested changes survive an update.** GitLab's silent approval reset is
   the counterexample, and it is a documented source of confusion.
4. **Unreadable is not empty.** The plugin marketplace names eight failure
   states rather than showing zero, and Vercel separates `No Data` from
   `Not Enabled`. Both halves of ADR-0021 points 7–9 are validated, and
   Shopify's two-state slot shows what the third case costs when it is
   missing.
5. **A local reversion is work to send, not an absence.** Nothing in the field
   models this at all, which is a gap rather than a disagreement, but it means
   the spec is not overbuilding.

## 6. Beyond the three stages

Findings that apply to the whole cockpit, not to #827's screens. None is a job
yet.

- **Freshness belongs on the fact, not on the page.** Vercel writes
  `Duration 59s  269d ago` inside the fact grid. The spec puts `Status out of
  date` in a notice above the strip. Both are defensible; the cockpit should
  pick one and apply it on Inventory and Deploy too.
- **A state chip beside the object's name, on every screen showing it.**
  Zapier's `Draft` chip sits next to the Zap name in the title bar, so the
  stage travels with the object. Maestro shows stage only in the table it
  came from.
- **Empty states need three sentences, not one.** Zapier documents at least
  three causes of an empty run history: aged out past 60 days, every run
  skipped, or the Zap turned off. It distinguishes none. The cockpit has the
  same trap wherever a count can be zero.
- **A filtered-empty state is not a collection-empty state.** Vercel writes
  `No Results` / "No deployments match the current filters." / `Clear Filters`
  for one and a different card for the other. Any future filter in the cockpit
  inherits this requirement.
- **Refuse the action that would leave no valid state, instead of warning
  about it.** Shopify will not delete the live theme; it tells you to publish
  another first. A constraint that removes a failure mode beats a dialog that
  apologises for one.
- **Design the worst state to be unreachable.** A Shopify store ships with one
  theme already published and cannot delete it, so a zero-theme library cannot
  occur. Where the cockpit can seed a working example instead of writing an
  empty state, it should.
- **Write the return address before the risky action.** Figma creates a named
  `Before merge` checkpoint automatically, and every recovery instruction
  quotes that name. Maestro's release lease and deploy guards are the same
  instinct; naming the checkpoint would make the recovery sentences
  performable.
- **Restore appends rather than overwrites.** Figma's restore writes two
  checkpoints, so undoing an undo works. Zapier's `Edit from this version`
  creates a draft rather than swapping the live version.
- **Auto-name a derived copy after its origin.** Shopify writes `Copy Of
  <name>` and `Updated copy of <name>`. One line of code, and a reader
  scanning a list never has to remember what a row is.

## 7. Candidate amendments to #827

Seven, ordered by value. Each names the spec text it would change. None is
applied; this section is the decision.

### A1 — Publish the derivation beside each stage header

**What.** Each stage header carries one sentence naming what was compared and
when, for example *Compared with the latest release, read 4 minutes ago.*

**Why.** GitHub's per-section popover publishes the literal query behind the
classification. It is the only product of seven that lets the reader check
the system's claim rather than trust it. The spec's fourth principle asks for
exactly this and currently stops at "do not over-claim", which is the passive
half.

**Cost.** One line per stage header. The facts already exist in the read
model; the spec already tracks a last successful read for `Status out of
date`.

**Recommendation.** Take it, in the reduced form above. Not the query, which
has no equivalent the reader could run.

### A2 — Disabled actions with their reason, instead of absent actions

**What.** Where the spec removes an action, keep the menu item, disable it,
and carry the reason as item text. The named case is "Withdrawal is
unavailable until a request exists" under Pull request missing.

**Why.** Vercel keeps `Instant Rollback` and `Promote` visible and greyed with
a stated reason; GitLab and Figma hide theirs and produce the dead ends in
§4.1. A reader who cannot find `Withdraw proposal` cannot tell whether it does
not apply or whether the cockpit is broken.

**Cost.** ActionsMenu must support a disabled item with a reason. The reason
must be item text, not a tooltip, because the screen design forbids tooltips.

**Recommendation.** Take it for `Withdraw proposal` under Pull request
missing, and for update and withdrawal under Multiple pull requests. Do not
generalise further in this spec.

### A3 — Two outcome sentences for a release, not one plus a caveat

**What.** Where the release result can be partial, write two sentences with
the same subject and the same grammar, differing by one word, rather than one
success sentence with a hedge.

**Why.** Shopify's update flow is the reference implementation:

> "Theme added: code edits successfully included"
> "Theme added: code edits could not be included"

Neither hedges, both name the same subject, and the difference between them
is legible at a glance. The spec's user story 38 asks that release success
describe publication accurately; this is the sentence shape that delivers it.

**Cost.** Two rows in the release feature's copy module instead of one.

**Recommendation.** Take it wherever the release outcome has a partial case.
If publication is all-or-nothing, this reduces to a note in the copy module
and costs nothing.

### A4 — Say what the read covered when it could not cover everything

**What.** Where the cockpit read a bounded window or an incomplete answer,
the sentence says so rather than reporting the result flat.

**Why.** Shopify's Timeline states its own horizon: `"Timeline history is
finite, so older versions might not be available."` The system does not know
how far back it goes and says so instead of implying completeness. The spec
already has the harder half of this, `Review status unknown` when
completeness is unestablished. This is the same honesty applied to a bounded
but successful read.

**Cost.** One clause in the affected notices.

**Recommendation.** Take it. The `--limit` argument on the pull-request list
read makes a bounded answer a real case, and the spec already forbids reading
a bounded answer as proof of absence. Saying so on screen closes the loop.

### A5 — Reconsider hiding zero counts and empty stages

**What.** The spec says "A confirmed empty stage renders no section" and "Do
not display a zero count". GitHub shows all six sections with `0` badges.

**Why.** The spec's reason is sound: a zero must never be mistaken for an
unknown, and Maestro has unknown states GitHub does not. The cost is that a
first-time reader never learns the three stages exist until work lands in
them, and the journey the whole spec is built around is invisible on a clean
Harness.

**Cost.** None to implement either way. This is a decision, not work.

**Recommendation.** Keep the rule, but note it was chosen rather than
assumed, and revisit if the empty Harness reads as a broken page in the
browser check. The confirmed-empty card already carries `No changes yet`,
which partly covers the teaching problem.

### A6 — Say that a release is immutable

**What.** One short phrase on the Released Harness stating that a release's
content cannot change after publication.

**Why.** GitHub marks a release `Immutable` with a lock. The entire
released-only Inventory decision rests on that property, and the cockpit never
states it. A consumer reading Inventory has no way to know why the list is
stable while the author edits.

**Cost.** One clause in the release dialog's overview. No new component.

**Recommendation.** Take the cheap half: state it in the release dialog's
overview sentence, not as a new chip.

### A7 — Carry the tag beside the fact it names

**What.** Wherever the cockpit names a release, show the tag.

**Why.** GitHub prints tag and commit side by side so the claim is checkable.
The Claude Code marketplace labels a commit hash "Version" and is the
cautionary case.

**Cost.** Likely already satisfied by existing screens. Needs a check rather
than a change.

**Recommendation.** Verify during the build; raise a tracker issue only if a
release is named anywhere without its tag.

## 8. Sources

All accessed 2026-09-07.

**Live.** GitHub `github.com/pulls`, `fimoklei/maestro` pull requests and
releases, `cli/cli` releases. Vercel `fimokleis-projects` deployments list,
deployment detail, row menus, status filter. Zapier Zap list and editor on the
free plan.

**GitLab**: `docs.gitlab.com` merge request pages (list, homepage, widgets,
drafts, reviews, approvals and settings, auto merge, conflicts, methods,
status checks, troubleshooting, revert, cherry-pick), `api/merge_requests`,
`user/project/releases`, `ci/environments/deployments`.

**Figma**: `help.figma.com` articles 5665697002263, 5665728006423,
5668839659415, 5691414603543, 5693123873687, 5691189138839, 5691750511383.
Guide to branching, the best-practices page and the launch blog returned
paraphrase only and are never quoted.

**Zapier**: `help.zapier.com` articles 9693520498445, 14094586364941,
8496199466125, 16722578092429, 20505304170637, 8496291148685, 8496241726989,
37454233721869, 21705940108941.

**Shopify**: `help.shopify.com` manual pages for managing themes, publishing
themes, adding and previewing themes, duplicating, downloading, deleting,
updating themes, theme architecture versions, and editing theme code
(Timeline); plus `shopify.dev/docs/storefronts/themes/store/success/updates`.
The troubleshooting page's error strings came back through a summarising layer
without stable attribution and are **not** used here.

**Claude Code plugins**: `code.claude.com/docs/en/discover-plugins`,
`plugin-marketplaces`, `plugins-reference`, plus read-only local reads of
`claude plugin list`, `claude plugin marketplace list` and the cached
`marketplace.json`. Nothing was installed, updated or removed.

## 9. Not verified

Carried forward so nothing here is mistaken for a measurement.

- Figma: per-branch author, timestamp or behind-main indicator in the branch
  list; empty states throughout; whether a confirmation dialog precedes Merge;
  whether the disabled merge control carries its memory-limit reason.
- Shopify: a `Current theme` or `Sample` label; renaming a theme; author or
  last-modified date on a draft row; the publish, delete and at-limit dialog
  wording; any "could not check for updates" state; all empty-state copy;
  Timeline entry metadata; what an expired preview link shows its recipient.
- Zapier: whether the Zap list shows anything for a pending draft or a held
  run; whether a draft survives turning a Zap off; both empty states.
- GitLab: list empty states, per-row actions, UI wording for most
  `detailed_merge_status` values, the Reopen action, whether auto-merge
  cancellation notifies the author.
- Claude Code plugins: whether the Errors tab header shows a count; the
  Marketplaces tab's status vocabulary; any version-rollback command.
