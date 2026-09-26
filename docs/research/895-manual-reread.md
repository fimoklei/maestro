# Reading again on demand, and telling the reader how old this is

Serves [#895](https://github.com/fimoklei/maestro/issues/895) under the decision
map [#893](https://github.com/fimoklei/maestro/issues/893). Sources read
**2026-09-10**: the ARIA 1.2 specification, the WAI-ARIA Authoring Practices,
WCAG 2.2 Understanding, the WHATWG HTML standard, Material Design 3, the Apple
Human Interface Guidelines, the GOV.UK Design System, Nielsen Norman Group, and
the TanStack Query documentation and source.

`developer.apple.com` and `m3.material.io` are client-rendered; both were read
with `agent-browser open` then `agent-browser read`, as
[465-notice-placement-apple-google.md](465-notice-placement-apple-google.md)
records. The W3C, WHATWG and GOV.UK pages are static HTML. TanStack's defaults
were taken from the doc comments in `query-core/src/types.ts`, not from a
rendered docs page.

§6 is the only part that asks for a decision. Everything else is reference.

## Answer in four lines

1. **One re-read control per screen, at the top** — plus an in-place action
   inside the failed region's own notice. Not one per region.
2. **Show age only where the data actually ages**, next to the thing it dates,
   as a relative reading in a `<time datetime>`; show nothing while a read is
   in flight, because the busy word takes the slot.
3. **An in-place retry that keeps the previous data on screen.** A full page
   reload throws away every other panel's data, the scroll position and any
   open dialog; the sources reserve it for the case where nothing else works.
4. **One polite live region per screen, mounted before the read starts**,
   announcing the outcome rather than the spinner; `aria-busy` on the region
   being rewritten, never on the button; focus stays on the pressed control,
   which is never `disabled` mid-read.

---

## 1. One control at the top, or one per region

No source states a rule for the *number* of manual re-read controls. Three
rules together decide it.

**Busy feedback is grouped, not per item.** Material 3's progress-indicators
guidance is explicit: "When multiple items are loading, use a single progress
indicator to show progress for the group. Don't add progress indicators to
every activity"
([m3.material.io](https://m3.material.io/components/progress-indicators/guidelines)).
It also fixes the variant per process: "A process should be represented by the
same variant of progress indicator throughout the product. For example, if
refreshing uses a circular indicator in one place, it should use circular
indicators everywhere" (same page).

**Failure feedback is local.** NN/g's error-message guidelines say to "display
the error message close to the error's source", to "concisely and precisely
describe the issue", and that merely stating the problem is not enough — "offer
some potential remedies"
([nngroup.com](https://www.nngroup.com/articles/error-message-guidelines/)).

**A control is only worth its space above a threshold.** Material's wait-time
table: under 200 ms show the content and no indicator; 200 ms–5 s a loading
indicator; over 5 s a progress indicator
([m3.material.io](https://m3.material.io/components/progress-indicators/guidelines)).
NN/g's older limits agree on the shape — 0.1 s feels instantaneous and needs
"no special feedback", 1.0 s keeps the flow of thought, 10 s is "the limit for
keeping the user's attention focused on the dialogue"
([nngroup.com](https://www.nngroup.com/articles/response-times-3-important-limits/)).
Beyond 10 s NN/g wants a percent-done indicator and a way to interrupt
([nngroup.com](https://www.nngroup.com/articles/progress-indicators/)).

**What goes wrong with each shape.** A control per region multiplies the busy
indication Material tells you to group, and makes the same act carry a
different label in each place. One control at the top loses the proximity NN/g
asks for when only one region failed — the reader presses a global control to
fix a local problem, and every other region is re-read as a side effect.

**The resolution the sources support:** one screen-level re-read control for
the whole screen's read, and a *recovery action inside the notice* for the
region that failed. That is one control per screen plus one per failure, not
one per region.

## 2. Showing age without becoming noise

**No source names a threshold at which a timestamp becomes noise.** Say so
plainly; the guidance below is what does exist.

- **Age is a status, so the status heuristic governs it.** NN/g's first
  heuristic requires the system to "keep users informed about what is going on
  through appropriate feedback within reasonable time"
  ([nngroup.com](https://www.nngroup.com/articles/visibility-system-status/)) —
  which makes a stale reading worth stating and an unchanging one not.
- **A relative reading needs a machine-readable twin.** The WHATWG HTML
  standard: the `time` element "represents its contents, along with a
  machine-readable form of those contents in the `datetime` attribute"
  ([html.spec.whatwg.org](https://html.spec.whatwg.org/multipage/text-level-semantics.html#the-time-element)).
  `Read 4 min ago` in a `<time datetime="…">` gives the exact moment to anything
  that needs it, without spending screen on it.
- **A pending read replaces the age, it does not sit beside it.** Apple: "Show
  something as soon as possible… consider showing placeholder text, graphics,
  or animations as content loads, replacing these elements as content becomes
  available" and "Clearly communicate that content is loading and how long it
  might take to complete"
  ([developer.apple.com](https://developer.apple.com/design/human-interface-guidelines/loading)).
- **A relative reading is only honest if it ticks.** Nothing in the sources
  covers this; it follows from the reading itself. `Read 4 min ago` computed
  once at render is wrong within a minute.

**Where the data actually ages, in Query terms.** `dataUpdatedAt` is "the
timestamp for when the query most recently returned the `status` as
`"success"`" and `errorUpdatedAt` the same for `"error"`
([query-core/src/types.ts](https://github.com/TanStack/query/blob/main/packages/query-core/src/types.ts#L775)).
`isStale` "will be `true` if the data in the cache is invalidated or if the data
is older than the given `staleTime`"
([types.ts](https://github.com/TanStack/query/blob/main/packages/query-core/src/types.ts#L858)).
`staleTime` "Defaults to `0`"
([types.ts](https://github.com/TanStack/query/blob/main/packages/query-core/src/types.ts#L405)) —
so by default every query is stale the moment it lands, and `isStale` is not the
signal a freshness line should use. `dataUpdatedAt` is.

## 3. The way out of a failed read

**Every source offers an in-place recovery, and none recommends a page reload
as the normal answer.**

- NN/g: preserve the reader's work — "let users correct errors by editing their
  original action instead of starting over" — and put the message next to what
  failed
  ([nngroup.com](https://www.nngroup.com/articles/error-message-guidelines/)).
- GOV.UK reserves a whole page for the case where the service itself is down:
  the heading "Sorry, there is a problem with the service", the instruction "Try
  again later", and a plain statement of what happened to the reader's answers —
  "We saved your answers" or "We have not saved your answers. When the service
  is available, you will have to start again". It bans jargon such as "500 or
  bad request"
  ([design-system.service.gov.uk](https://design-system.service.gov.uk/patterns/problem-with-the-service-pages/)).
  Note the shape: a full restart is a *whole-service* answer, paired with an
  explicit statement of what it costs.
- TanStack already retries before the reader sees anything: failing queries "are
  silently retried 3 times, with exponential backoff delay"
  ([tanstack.com](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults)).
  By the time a failure is on screen, three automatic retries have gone.

**What a page reload costs, concretely.** Query's cache is in memory: `gcTime`
defaults to five minutes
([tanstack.com](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults)),
and a reload discards it entirely. So a reload triggered by one failed region
re-reads every other region from scratch, drops scroll position, closes any open
dialog, and loses unsent field text — none of which the failure touched. A
`refetch()` of the one query costs one request and leaves the rest standing.

**Old data survives a refetch and survives an error.** `status` and
`fetchStatus` are independent: "The `status` gives information about the `data`:
Do we have any or not? The `fetchStatus` gives information about the `queryFn`:
Is it running or not?"
([tanstack.com](https://tanstack.com/query/latest/docs/framework/react/guides/queries)).
`data` is "the last successfully resolved data for the query"
([types.ts](https://github.com/TanStack/query/blob/main/packages/query-core/src/types.ts#L771)),
so a failed re-read leaves the previous rows in `data` and sets `error` beside
them. Showing the old rows with a dated warning is the supported path, not a
workaround.

## 4. What a screen reader must hear

**The criterion.** WCAG 2.2 SC 4.1.3: "status messages can be programmatically
determined through role or properties such that they can be presented to the
user by assistive technologies **without receiving focus**". A status message
covers "the waiting state of an application, on the progress of a process, or on
the existence of errors", and must not be a change of context, because "changes
of context, by their nature, interrupt the user by taking focus"
([w3.org](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)). A
role or property is required; the criterion does not force new messages, only
that the ones shown are programmatically identified (same page).

**Which role.** `status` is "a type of live region whose content is advisory
information for the user but is not important enough to justify an alert", with
implicit `aria-live="polite"` and `aria-atomic="true"`; `alert` is "a type of
live region with important, and usually time-sensitive, information", implicitly
`assertive`
([w3.org/TR/wai-aria-1.2](https://www.w3.org/TR/wai-aria-1.2/#status)). MDN
warns that assertive "will interrupt any announcement a screen reader is
currently making… can be extremely annoying and disruptive and should only be
used sparingly"
([MDN](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions)).
A re-read the reader asked for is advisory: `role="status"`, never `alert`.

**The region must pre-exist.** "Including an `aria-live` attribute or a
specialized live region `role`… works as long as you add the attribute **before
the changes occur**… Start with an empty live region, then – in a separate step
– change the content inside the region"
([MDN](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions)).
A notice component that mounts together with its first message announces
nothing.

**`aria-busy` goes on the container, not the button.** ARIA 1.2: it "indicates
an element is being modified and that assistive technologies MAY want to wait
until the modifications are complete before exposing them to the user", default
`false`; when `true`, assistive technologies "MAY ignore changes to content
owned by that element and then process all changes made during the busy period
as a single, atomic update when `aria-busy` becomes `false`". Authors "MAY set
`aria-busy` to `true` on the container element before the first change, and then
set it to `false` when the last change is complete… if multiple changes to a
live region should be spoken as a single unit of speech"
([w3.org/TR/wai-aria-1.2](https://www.w3.org/TR/wai-aria-1.2/#aria-busy)). So
`aria-busy` is how a table that repaints row by row is announced once instead of
per row — it is not a "loading" flag for a pressed button.

**Focus when the region repaints.** The APG: "If the user closes a dialog or
performs a destructive operation like deleting an item from a list, the active
element may be hidden or removed from the DOM. If such events are not managed to
set focus on the button that triggered the dialog or on the list item following
the deleted item, browsers move focus to the body element, effectively causing a
loss of focus within the user interface"
([w3.org/WAI/ARIA/apg](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/)).
The minimum for a re-read: the pressed control must still exist and still hold
focus when the read finishes. Two things break that — removing the control while
the read runs, and setting `disabled` on it, since a `disabled` element is not
focusable. The APG's alternative is `aria-disabled="true"`, which keeps the
element focusable and discoverable (same page).

**The minimum that keeps a re-read usable without sight**, in order:

1. A `role="status"` region already in the DOM when the screen paints.
2. On press: nothing announced yet — the press itself is the feedback, and a
   spinner is not a message.
3. While the read runs: `aria-busy="true"` on the region being rewritten, so the
   repaint is one announcement.
4. On finish: one sentence in the status region naming the outcome and the new
   reading — what changed and how old it now is, not "loading finished".
5. Focus never moved and never lost: `aria-disabled`, not `disabled`.

## 5. What Maestro does today

Read from `packages/web/src` on 2026-09-10.

| Screen | Re-read control | Age shown | Way out of a failed read |
|---|---|---|---|
| Harness | **Retry check** in the strip (`harness-view.tsx:269-278`) | `Read 4 min ago` / `Reading GitHub…` in the strip and every stage's meta (`harness-view-model.ts:44-68`) | *Retry check* for a failed GitHub read; **Reload the page** for a failed server read (`harness/notice-copy.ts:433`) |
| Harness location | **Re-read Inventory** (`inventory-source-view.tsx:107-117`), label becomes `Re-reading Inventory…` | none | The button below the notice; the notice itself carries no action (`inventory-source-view.tsx:22-24`) |
| Inventory | **Re-read Inventory** inside the failed-read notice (`inventory-panel.tsx:33-36`) | none | In-place action |
| Deploy-state panel | none | none | **Reload the page** (`deploy-state-panel.tsx:53`) |
| Registered repositories | none | none | **Reload the page** (`deploy-state-view.tsx:96`) |
| Global targets | none | none | **Reload the page** (`global-targets.tsx:58`) |

Query is configured with a bare `new QueryClient()` (`main.tsx:18`), so
`refetchOnWindowFocus` is `true`
([tanstack.com](https://tanstack.com/query/latest/docs/framework/react/guides/window-focus-refetching))
and `staleTime` is `0`. The Harness view adds a second `focus` listener of its
own (`harness-view.tsx:196-208`). Drift is the one query with a real staleness
window — `staleTime: FIVE_MINUTES` (`drift/use-drift.ts:28,40`) — and it shows no
age anywhere.

The Harness has one polite off-screen region carrying the stage counts plus the
freshness reading (`harness-view.tsx:282-290`); the Harness location screen has
a `role="status"` count pill (`inventory-source-view.tsx:88`) and an
`aria-busy="true"` skeleton (`inventory-source-view.tsx:141-145`). No other
screen announces a read.

## 6. Where practice contradicts `CONTEXT.md`

Flat list, no ruling — #893 decides.

1. **`CONTEXT.md` contradicts itself on the failed read, and the code follows
   the weaker rule.** The *Harness re-read* row calls **Retry check** "the
   single action in every failed-read notice" on the Harness view; the *Read
   failure* row makes **Reload the page** the way out. `harnessStateNotice`
   ships "The Maestro server did not answer. Reload the page to read the Harness
   again." (`harness/notice-copy.ts:429-434`) — a failed-read notice on the
   Harness view whose action is a page reload.
2. **The same failure kind has two different ways out.** A failed Inventory read
   offers **Re-read Inventory** in place (`inventory-panel.tsx:33-36`); a failed
   deploy-state, registry or global-targets read offers **Reload the page**
   (`deploy-state-panel.tsx:53`, `deploy-state-view.tsx:96`,
   `global-targets.tsx:58`). `CONTEXT.md` sanctions only the second.
3. **A page reload is the recovery no source recommends**, and every one of
   those three regions has a `refetch` available that would cost one request.
   `CONTEXT.md` fixes the expensive answer as the rule.
4. **"Refresh" is retired but still on screen.** "Maestro tagged {tag} but could
   not refresh Inventory. Re-read Inventory to see the published skills."
   (`harness/notice-copy.ts:512`) — *Refresh* in a sentence, which the *Harness
   re-read* row forbids outright.
5. **Two busy forms for the same act.** The Harness puts the busy word in a
   status slot (`Reading GitHub…`, `harness-view-model.ts:52`); the Harness
   location screen puts it on the button label (`Re-reading Inventory…`,
   `inventory-source-view.tsx:115-116`). `CONTEXT.md` names only the first, and
   Material asks for one form per process across the product.
6. **The freshness vocabulary stops at the Harness.** `CONTEXT.md` calls
   **Read** "the one word for reading the Harness, on every surface" and gives
   no word for any other screen's age. Drift genuinely ages (five minutes) and
   states nothing; Inventory and deploy-state state nothing.
7. **`Read 4 min ago` does not tick.** It is computed from `new Date()` at
   render (`harness-view.tsx:256`, `harness-view-model.ts:24-39`), so the
   reading freezes until something else re-renders the strip. The glossary's
   example implies a live reading.
8. **Both re-read controls are `disabled` mid-read.** *Retry check*
   (`harness-view.tsx:274`) and *Re-read Inventory*
   (`inventory-source-view.tsx:112`). A `disabled` element is not focusable, so
   the keyboard reader who pressed it loses focus to `body` — the APG's
   "persistence of focus" failure. The comment beside *Retry check* already
   states the intent ("Never disabled by a failed fetch: it is the one way
   back") and the pending case defeats it.
9. **The cockpit re-reads without being asked, and no word covers it.**
   `refetchOnWindowFocus: true` by default (`main.tsx:18`) plus the Harness
   view's own `focus` listener (`harness-view.tsx:196-208`). `CONTEXT.md`
   describes only reads the author asks for.

## Sources

- [ARIA 1.2 — `aria-busy`, `status`, `alert`](https://www.w3.org/TR/wai-aria-1.2/)
- [WCAG 2.2 Understanding SC 4.1.3 Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)
- [WAI-ARIA Authoring Practices — Developing a Keyboard Interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/)
- [MDN — ARIA live regions](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions)
- [WHATWG HTML — the `time` element](https://html.spec.whatwg.org/multipage/text-level-semantics.html#the-time-element)
- [Material Design 3 — Progress indicators](https://m3.material.io/components/progress-indicators/guidelines)
- [Apple HIG — Loading](https://developer.apple.com/design/human-interface-guidelines/loading)
- [GOV.UK Design System — Problem with the service pages](https://design-system.service.gov.uk/patterns/problem-with-the-service-pages/)
- [NN/g — Error message guidelines](https://www.nngroup.com/articles/error-message-guidelines/)
- [NN/g — Response time limits](https://www.nngroup.com/articles/response-times-3-important-limits/)
- [NN/g — Progress indicators](https://www.nngroup.com/articles/progress-indicators/)
- [NN/g — Visibility of system status](https://www.nngroup.com/articles/visibility-system-status/)
- [TanStack Query — Important defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults)
- [TanStack Query — Queries (`status` vs `fetchStatus`)](https://tanstack.com/query/latest/docs/framework/react/guides/queries)
- [TanStack Query — Window focus refetching](https://tanstack.com/query/latest/docs/framework/react/guides/window-focus-refetching)
- [TanStack Query — Background fetching indicators](https://tanstack.com/query/latest/docs/framework/react/guides/background-fetching-indicators)
- [`query-core/src/types.ts` — result and option doc comments](https://github.com/TanStack/query/blob/main/packages/query-core/src/types.ts)
