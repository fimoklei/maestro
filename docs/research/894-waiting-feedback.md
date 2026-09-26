# What good software shows while it is busy, and above which delay

Four questions from #894: the delay thresholds, waiting versus running ahead,
which shape for which wait, and how a failure reads after the interface already
moved. Every page below was fetched **2026-09-10** unless marked. Apple and
Material are client-rendered and were read with `agent-browser open` then
`agent-browser read`, the method `465-notice-placement-apple-google.md`
established; the W3C pages are static HTML and were read with `curl`.

## Answers

1. **Below ~1 s show nothing; 1–10 s a looping animation; 10 s and over a
   percent-done indicator.** NN/g is the only source that names numbers, and it
   names all three.
2. **Waiting wins here.** Optimistic display is a first-party pattern for
   operations that practically cannot fail. Every Maestro action can genuinely
   fail, and a cockpit whose product is verified status spends the credibility
   NN/g's first heuristic is about when it shows a claim the server later
   withdraws.
3. **Skeleton for a first load of a whole empty region; spinner for one module
   or one pressed control; keep the old rows on screen for a re-read; no
   progress bar anywhere** — no Maestro wait is quantifiable.
4. **The failure states itself where the press was made and stays there.** A
   transient message is the one shape the sources rule out.

---

## 1. The delay thresholds

**NN/g owns the numbers. No platform HIG states a general one.**

[Response Times: The 3 Important
Limits](https://www.nngroup.com/articles/response-times-3-important-limits/):

> **0.1 second** is about the limit for having the user feel that the system is
> reacting instantaneously […]
> **1.0 second** is about the limit for the user's flow of thought to stay
> uninterrupted, even though the user will notice the delay […]
> **10 seconds** is about the limit for keeping the user's attention focused on
> the dialogue.

[Progress Indicators Make a Slow System Less
Insufferable](https://www.nngroup.com/articles/progress-indicators/) converts
those limits into which indicator to draw:

> Use a progress indicator for any action that takes longer than about 1.0
> second.

> **Looped animation: Use only for fast actions.** […] This indicator should be
> reserved for actions that take between 2-10 seconds.

> For anything that takes less than 1 second to load, it is distracting to use a
> looped animation.

> Percent-done progress indicators should be used for longer processes that take
> 10 or more seconds.

Summarised on the same page: *"use a looped indicator for delays of 2–9 seconds
and a percent-done indicator for delays of 10 seconds or more"*.

[Skeleton Screens](https://www.nngroup.com/articles/skeleton-screens/) repeats
the floor and adds the ceiling for the skeleton shape:

> If a page takes less than 1 second to load, skeleton screens or spinners
> aren't necessary.

> Spinners or wait animations […] are best used when the page takes 2–10 seconds
> to load. Similarly, skeleton screens should be used with a wait time that's
> under 10 seconds.

**Region versus control.** Neither NN/g article splits the thresholds by scope;
they split by *what is loading* (see §3). The only scope-plus-duration statement
in any primary source is Material's, on the circular indicator inside a button
([M3 Progress
indicators](https://m3.material.io/components/progress-indicators/guidelines)):

> **Do** — Use circular indicators for short, indeterminate activities under 5
> seconds.
> **Don't** — Avoid applying progress indicators to every button in a list.

Apple names no general threshold at all. Its one duration statement is about
the deprecated network activity indicator, not about waits in general.

**Provenance of the triad.** NN/g credits Miller (1968) and Card, Robertson &
Mackinlay (1991). Miller's own paper
([ACM DL](https://dl.acm.org/doi/10.1145/1476589.1476628)) argues the
conversational analogy and names a ~2 s feedback boundary and a 4 s
conversational silence, **not** the 0.1/1/10 triad. The triad is NN/g's
synthesis. Cite it as NN/g, never as Miller.

**Unverified:** "below 0.1 s, showing feedback is worse than showing nothing" is
not stated by any primary source read here. NN/g's actual floor claim is the
weaker and better-evidenced one — under 1 s an animation is *distracting*
because *"users cannot keep up with what happened"*. Do not upgrade it.

## 2. Waiting versus running ahead

**Nothing in the field forbids optimistic display; the tool decides.**

The mechanism, from
[TanStack Query · Optimistic
Updates](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates):

> When you optimistically update your state before performing a mutation, there
> is a chance that the mutation will fail. In most of these failure cases, you
> can just trigger a refetch for your optimistic queries to revert them to their
> true server state.

`onMutate` snapshots, `onError` restores, `onSettled` invalidates. The library
treats rollback as routine, and says nothing about what the rollback costs the
reader.

**What it costs is the whole of NN/g's first heuristic.**
[Visibility of System
Status](https://www.nngroup.com/articles/visibility-system-status/):

> Ideally, systems should always keep users informed about what is going on,
> through appropriate feedback within reasonable time.

> When we understand the system's state, we feel in control — we can rely on the
> system to act as expected in all circumstances.

> The predictability of the interaction creates trust not only in the mechanics
> of the site or the app, but also in the brand itself.

> Losing the immediate order is preferable to losing credibility for future
> orders, which will never be placed if users feel that they cannot trust you.

Apple states the same trade under its own name, on
[Progress
indicators](https://developer.apple.com/design/human-interface-guidelines/progress-indicators):
a determinate bar that shows *"90 percent completion in five seconds and the
last 10 percent in 5 minutes"* is not merely inaccurate — it *"can even feel
deceptive"*. A displayed claim the system then withdraws is read as a lie, not
as a race.

**Read against Maestro.** Every action the cockpit offers crosses a boundary
that can refuse it: `gh pr create` and `pr close` reach GitHub, `apm install`
reaches the network and the filesystem, `git fetch` can be offline. A row's
status chip is not a preference the user set — it is the product, a reading the
server verified. Showing `Pending review` before GitHub has opened the request
puts an unverified claim in the one column the reader came for, and a rollback
takes back the only thing the screen is for. The map's standing decision
("waiting beats running ahead") survives the research; the research does not
overturn it.

**Nothing forbids optimism for the cheap half.** Where the change is UI-state
the server does not own — a dialog closing, a row scrolling into view — the
interface may move at once. That is not an optimistic *status*.

**Where the sources are silent, and it matters.** No first-party engineering
source was found arguing *against* optimistic updates for authoritative data.
The "users hate seeing the UI revert" argument circulates only as independent
commentary. The case above rests on NN/g's credibility statement plus Apple's
"deceptive" — not on a source that names this exact case. State it as reasoning,
not as a cited rule.

## 3. Which shape for which wait

NN/g splits by *what* is loading, not by how long:

> Spinners are typically best used on a single module, like a video or a card
> which is on a dashboard. Skeleton screens (with the exception of frame-display
> ones) are better when the full screen is loading because the wireframe gives
> users a sense of what the page will look like.
> — [Skeleton Screens](https://www.nngroup.com/articles/skeleton-screens/)

> A skeleton screen is a design pattern used to indicate that a page is loading
> while providing users with a wireframe-like visual that mimics the layout of
> the page.

Apple splits by whether the duration is knowable
([Progress
indicators](https://developer.apple.com/design/human-interface-guidelines/progress-indicators)):

> Determinate, for a task with a well-defined duration, such as a file
> conversion […] Indeterminate, for unquantifiable tasks, such as loading or
> synchronizing complex data.

> **When possible, use a determinate progress indicator.** An indeterminate
> progress indicator shows that a process is occurring, but it doesn't help
> people estimate how long a task will take.

> **Keep progress indicators moving** so people know something is continuing to
> happen. People tend to associate a stationary indicator with a stalled process
> or a frozen app.

> **Don't switch from the circular style to the bar style.** Activity indicators
> (also called spinners) and progress bars are different shapes and sizes, so
> transitioning between them can disrupt your interface and confuse people.

> **If it's helpful, display a description that provides additional context for
> the task.** Be accurate and succinct. **Avoid vague terms like loading or
> authenticating** because they seldom add value.

Material agrees on the axis and adds the upgrade path
([M3](https://m3.material.io/components/progress-indicators/guidelines)):
*"As more information about a process becomes available, a progress indicator
should change from indeterminate to determinate."*

**Re-reading content already on screen is a fourth case, and only TanStack
answers it.** [Paginated
Queries](https://tanstack.com/query/latest/docs/framework/react/guides/paginated-queries)
on `placeholderData` / `keepPreviousData`:

> The data from the last successful fetch is available while new data is being
> requested, even though the query key has changed […] When the new data
> arrives, the previous `data` is seamlessly swapped to show the new data.

The library separates the two questions that decide this
([Queries](https://tanstack.com/query/latest/docs/framework/react/guides/queries)):

> The `status` gives information about the `data`: Do we have any or not? The
> `fetchStatus` gives information about the `queryFn`: Is it running or not?

So `isPending` — no data yet — is the skeleton case, and `isFetching` with data
present is the keep-the-rows case. **Neither NN/g nor either HIG says to blur or
dim content during a re-read**, and neither states a rule for it. Treat dimming
as unsourced.

**Read against Maestro.**

| Wait | Shape | Why |
|---|---|---|
| First open of the Harness, no state yet (`harness.data === undefined`) | Skeleton of the strip and the three stage cards | Whole region, no data — NN/g's full-screen case |
| A stage card's own first load | Spinner or skeleton in that card | NN/g's single-module case |
| `Retry check` / focus re-read with rows already painted | Keep the rows, mark the strip only | TanStack's `isFetching`-with-data case; nothing licenses removing verified rows |
| A pressed row action (`Propose change`, `Withdraw proposal`) | Busy state on that control alone | M3's in-button circular indicator, under 5 s; the map's "only the pressed control" |
| Anything | **Never a progress bar** | Apple: determinate only for a *well-defined duration*. `gh`, `apm` and `git fetch` report no progress Maestro can read |

The cockpit already carries the strip pattern: `freshnessLabel` returns
`Reading GitHub…` while `refresh.isPending`, and the comment beside it says that
slot *"is the only feedback the author gets while one runs"*. That is the
re-read case, correctly solved. Note Apple's warning against *"vague terms like
loading"*: `Reading GitHub…` names its subject and passes; the bare `Loading the
Harness…` form in `harness-view.tsx` is the weaker shape, and `copy.md` blesses
it as a form, so any change is a copy ticket, not this one.

**Motion.** WCAG 2.2 SC 2.2.2 Pause, Stop, Hide applies to moving content that
starts automatically and lasts more than five seconds; SC 2.3.3 Animation from
Interactions (AAA) requires that motion triggered by interaction can be
disabled, with `prefers-reduced-motion` as its cited technique
([C39](https://www.w3.org/WAI/WCAG22/Techniques/css/C39)). A busy state that is
*only* motion has no reduced-motion fallback — which is why the strip's text
reading, not the animation, must carry the meaning.

**Screen readers.** WCAG 2.2 [SC 4.1.3 Status
Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html):

> In content implemented using markup languages, status messages can be
> programmatically determined through role or properties such that they can be
> presented to the user by assistive technologies without receiving focus.

Its own worked example is this exact case: *"After a user activates a process,
an icon symbolizing 'busy' appears on the screen. The screen reader announces
'application busy'."* The roles, from [WAI-ARIA
1.2](https://www.w3.org/TR/wai-aria-1.2/):

- `role="status"` — *"A type of live region whose content is advisory
  information for the user but is not important enough to justify an alert, often
  this information will be quickly outdated."* Implicit `aria-live="polite"`.
- `role="alert"` — *"A type of live region with important, and usually
  time-sensitive, information."* Implicit `aria-live="assertive"`; *"assistive
  technologies will immediately notify the user, and could potentially clear the
  speech queue of previous updates"* (`aria-live`).
- `aria-busy` — *"Indicates an element is being modified and that assistive
  technologies MAY want to wait until the modifications are complete before
  exposing them to the user."* On a region being rewritten, it batches the
  changes into *"a single, atomic update when `aria-busy` becomes false"*.
- `role="progressbar"` — *"The author SHOULD supply a value for `aria-valuenow`
  unless the value is indeterminate, in which case the author SHOULD omit the
  `aria-valuenow` attribute."* And, decisively for a region: *"If the progressbar
  is describing the loading progress of a particular region of a page, the author
  SHOULD use `aria-describedby` to point to the status, and set the `aria-busy`
  attribute to true on the region until it is finished loading."*
- `aria-disabled` — *"Indicates that the element is perceivable but disabled, so
  it is not editable or otherwise operable."* Note the spec's own instruction:
  *"authors SHOULD change the appearance (grayed out, etc.)"* — the state is not
  self-announcing.

The Harness already has the polite region SC 4.1.3 asks for (`role="status"`,
`aria-live="polite"`, `aria-label="Harness stages"`), and `harnessAnnouncement`
already takes `reading`. The rule the map lacks is cockpit-wide, not new
machinery.

## 4. Failure after the interface already moved

**The sources converge on: state it where the press was, and let it stay.**

[NN/g Error Message
Guidelines](https://www.nngroup.com/articles/error-message-guidelines/):

> **Use noticeable, redundant, and accessible indicators.** Text and highlights
> that are bold, high-contrast, and red are conventional error-message visuals.

> **Display the error message close to the error's source.** Proximity helps
> users associate the error message content with the interface elements needing
> attention.

> Presenting errors too early is a hostile pattern.

WCAG 2.2 SC 3.3.1 Error Identification constrains the content, not the place:
*"If an input error is automatically detected, the item that is in error is
identified and the error is described to the user in text."* The Understanding
document says outright that the criterion *"does not mandate any particular way
in which errors should be displayed"* (quoted in full in
`465-notice-placement-apple-google.md`).

**The one shape the sources rule out is a message that leaves by itself.** The
[APG Alert pattern](https://www.w3.org/WAI/ARIA/apg/patterns/alert/):

> It is also important to avoid designing alerts that disappear automatically.
> An alert that disappears too quickly can lead to failure to meet WCAG 2.0
> success criterion 2.2.3.

M3 says the same for its own component, and the rule is web-specific:
*"Avoid using auto-dismissing snackbars on web unless there's also inline
feedback"* — captured verbatim, with its accessibility rationale, in
`465-notice-placement-apple-google.md` §4. Read together with the APG, a
transient toast is never sufficient on its own for a failure.

**Apple bounds the loudest shape.** *"By design, alerts disrupt the current
context, so you need to match the importance of the information to the level of
interruption"*, and *"Avoid using an alert merely to provide information"*
(both in `465-notice-placement-apple-google.md`). A failed `Retry check` is not
an alert case. Apple also names the stall specifically: *"If a process stalls
for some reason, provide feedback that helps people understand the problem and
what they can do about it"*
([Progress
indicators](https://developer.apple.com/design/human-interface-guidelines/progress-indicators)).

**Read against Maestro.** The cockpit already does the sourced thing and should
keep doing it, which is the finding: a refusal is a `Notice` beside the control
that was pressed (`rowFailure()` returns one skill plus one notice; a
withdrawal's refusal stays in the dialog that still stands), the notice persists
until the next press resets it, and `harness-view.tsx` states in a comment that
*"a failed refresh is not a failed read: the state below stands"*. Nothing in
the field contradicts any of that. Three consequences follow for the spec:

- **A failure never removes a verified reading.** The strip falls back to
  `Read failed — last read 4 min ago`, never to a blank or a guess. This is
  Apple's *"show cached or placeholder data and a nonintrusive label"* and
  NN/g's credibility line, agreeing.
- **The failure must be announced without stealing focus.** `role="status"` for
  an outcome the reader asked for; `role="alert"` only where the reader did not
  press anything. The APG: an alert *"displays a brief, important message in a
  way that attracts the user's attention without interrupting the user's task"*.
- **One refusal at a time.** `465` already carries M3's *"Only one snackbar may
  be displayed at a time"* and *"Show all errors on the page at once"*; the
  Harness's one-notice rule matches.

## Where the sources are silent

State these as unknowns in the spec, not as permissions.

- **A numeric threshold for a control versus a region.** Only M3's under-5 s
  in-button rule exists. Nobody says "a region needs a busy state above N ms".
- **Blurring or dimming stale content during a re-read.** Not a pattern any
  primary source describes. TanStack describes keeping the data, not degrading
  its appearance.
- **Optimistic updates for authoritative, verified state.** No first-party
  source addresses the case. The argument in §2 is reasoning from NN/g's
  credibility claim, not a citation.
- **A delay before showing a busy state.** Everyone names when an indicator is
  warranted; nobody names how long to wait before drawing it, or whether a
  minimum display time should follow.
- **Per-row busy states in a dense table.** The same gap `465` found for per-row
  errors. M3's *"Avoid applying progress indicators to every button in a list"*
  is the nearest statement, and it is a prohibition, not a pattern.
