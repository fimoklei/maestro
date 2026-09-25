# 2026 UX practice for a dense, status-heavy cockpit: candidate principles from five anchors

Answers issue #998 (parent map #984). Read **2026-09-15** against the five
anchors settled while charting, and nothing else: WCAG 2.2 (w3.org), Nielsen
Norman Group (nngroup.com), the GOV.UK Design System
(design-system.service.gov.uk), the ARIA Authoring Practices Guide
(w3.org/WAI/ARIA/apg) and Apple's Human Interface Guidelines
(developer.apple.com). Every quoted sentence was read on the cited page; no
sentence is retyped from memory.

How the pages were read: WCAG, APG, NN/g and GOV.UK render as HTML. Apple's
HIG pages are JavaScript-rendered and return only a title to a plain fetch;
each page was read from the JSON the site itself loads
(`developer.apple.com/tutorials/data/design/human-interface-guidelines/<page>.json`,
`primaryContentSections` flattened to text). Quotes are from that JSON.

Each candidate principle is: **statement** — source — the sentence it rests on —
a Maestro example. Where a principle extends or contradicts the banked findings
of #894 (waiting) and #895 (manual re-read), or `copy.md` / ADR-0024, the entry
says so. Section 9 lists every point where two anchors disagree.

## 1. How information is presented

**P1. Order the screen by importance, top-left first.**
Apple [Layout](https://developer.apple.com/design/human-interface-guidelines/layout):
"Order content by relative importance. People often start by viewing content in
reading order — that is, from top to bottom and from the leading to trailing
side — so place the most important items near the top and leading side of the
window or display." NN/g
[F-shaped pattern](https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/):
"Users may skip important content simply because it appears on the right side
of the page." Maestro: on the Harness view the freshness strip and the failed
read notice belong above the skill table, not at the end of the row.

**P2. Front-load every heading and cell: the first two words carry the gist.**
NN/g F-shaped pattern: "Start headings and subheadings with the words carrying
most information: if users see only the first 2 words, they should still get the
gist." Maestro: a status chip reads `Not yet proposed`, never `The change has
not yet been proposed`; a notice heading names the outcome first (`copy.md`
already requires this).

**P3. Emphasis is scarce: if everything is contrasted, nothing stands out.**
NN/g [Visual hierarchy](https://www.nngroup.com/articles/visual-hierarchy-ux-definition/):
"If everything is contrasted, then nothing stands out." and "It's not the actual
color of an element that creates the hierarchy, but rather the contrast in value
and saturation between the element and the context in which it appears." NN/g
[Heuristic 8](https://www.nngroup.com/articles/ten-usability-heuristics/): "Every
extra unit of information in an interface competes with the relevant units of
information and diminishes their relative visibility." Maestro: one coloured
chip per row at most; a table where every row carries an amber or green badge
tells the reader nothing.

**P4. Group by proximity, align to scan.**
Apple Layout: "Align elements to make them easier to scan, and use indentation
to convey hierarchy." and "Group related items to clearly express related
information or functions. For example, you might use negative space, container
shapes, or separator lines to show which elements are related and which are
unrelated." NN/g Visual hierarchy: "An element that has more space around it will
be perceived as one group and thus will receive more attention." Maestro: the
deploy-state panel keeps a repo's rows in one bordered group rather than one
flat list across repos.

**P5. Show the few important options first; disclose the rest on request.**
NN/g [Progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/):
"Initially, show users only a few of the most important options." and "Disclose
these secondary features only if a user asks for them." GOV.UK
[Details](https://design-system.service.gov.uk/components/details/): "Make a page
easier to scan by letting users reveal more detailed information only if they
need it." with the limit "Do not use the details component to hide information
that the majority of your users will need." APG
[Disclosure](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/) gives the
control: a `button` with `aria-expanded` set to `true` when the content is
visible and `false` when hidden. Maestro: a skill row shows name, version and
status; the `deployed_files` list and lock hash sit behind a disclosure. The
notice `detail` field is already this pattern for cause text.

**P6. A cockpit is for fast consumption, not exploration.**
NN/g [Dashboards](https://www.nngroup.com/articles/dashboards-preattentive/):
"Dashboards are not intended as expansive views of complex data: Their goal is
not to facilitate exploration; instead, they provide information that can be
consumed fast, with a minimum of interaction or cognitive processing." Maestro:
the Inventory is a read-at-a-glance table; filters and drill-down come second.

**P7. Keep what the reader needs on screen; do not make them remember it.**
NN/g [Heuristic 6](https://www.nngroup.com/articles/ten-usability-heuristics/):
"The user should not have to remember information from one part of the interface
to another." NN/g
[Working memory](https://www.nngroup.com/articles/working-memory-external-memory/):
"make sure that users can easily access all the information they need for a
task, without having to commit it to working memory". Maestro: a Remove dialog
repeats the skill name and the target repo in its title and body; the reader
never has to recall which row they opened it from.

**P8. Keep row text short; long content goes to a detail view, not a tall row.**
Apple [Lists and tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables):
"Keep item text succinct so row content is comfortable to read." and "If each
item consists of a large amount of text, consider alternatives that help you
avoid displaying over-large table rows. For example, you could list item titles
only, letting people choose an item to reveal its content in a detail view."
Maestro: the skill detail pane holds the description; the table row holds the
name.

**P9. Write in plain words, active voice, no jargon, no "we".**
Apple [Writing](https://developer.apple.com/design/human-interface-guidelines/writing):
"Choose simple, plain language and write with accessibility and localization in
mind, avoiding jargon and gendered terminology." and "Avoid using we altogether
because it may be unclear who the 'we' in question refers to." GOV.UK
[Error message](https://design-system.service.gov.uk/components/error-message/):
"The message must be in plain English, use positive language and get to the
point." Agrees with `copy.md` (ASD-STE100). Maestro: `Unable to read the
Harness` rather than `We're having trouble loading the Harness`.

## 2. How errors and failures are stated

**P10. State the error in text, next to the thing that failed.**
WCAG [3.3.1 Error Identification](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html):
"the item that is in error is identified and the error is described to the user
in text." NN/g
[Error-message guidelines](https://www.nngroup.com/articles/error-message-guidelines/):
"Display the error message close to the error's source". Apple Writing: "display
it as close to the problem as possible, avoid blame, and be clear about what
someone can do to fix it." Apple Alerts: "If your app detects a problem at
startup, like no network connection, consider alternative ways to let people
know. For example, you could show cached or placeholder data and a nonintrusive
label that describes the problem." Agrees with ADR-0024 §7 (the notice sits
after the control that caused it) and with #894 finding 4. Maestro: a failed
deploy-state read puts its notice inside the deploy-state panel, not at page top.

**P11. Every error names the next action, and its exact control.**
NN/g Heuristic 9: "Error messages should be expressed in plain language (no
error codes), precisely indicate the problem, and constructively suggest a
solution." WCAG [3.3.3 Error Suggestion](https://www.w3.org/WAI/WCAG22/Understanding/error-suggestion.html):
"suggestions for correction are known, then the suggestions are provided to the
user". GOV.UK Error message: "Describe what has happened and tell them how to fix
it." Apple Feedback: "Show people when a command can't be carried out and help
them understand why." This is `copy.md`'s outcome-first rule, now with four
anchors behind it. Maestro: `Deploy again to restore the released files. Then
remove the skill.`

**P12. The error indicator is redundant: colour, glyph and text together.**
NN/g Error-message guidelines: "Use noticeable, redundant, and accessible
indicators". GOV.UK Error message: "use a red border to visually connect the
message and the question it belongs to" and the component "includes a hidden
'Error:' before the error message." WCAG 3.3.1 Intent: "It is perfectly
acceptable to indicate the error in other ways such as through the use of an
image, color, or other visual indicator, in addition to the text description."
ADR-0024 §6 already does this (glyph + colour + heading). Maestro: the `✕`
glyph stays `aria-hidden`; the heading carries the word an assistive reader
hears.

**P13. Do not use "please", "sorry", "oops" or a bare "Error".**
GOV.UK Error message: do not use "'please' because it implies a choice" or
"'sorry' because it does not help fix the problem", nor "technical jargon like
'form post error', 'unspecified error'". Apple Alerts: "Avoid writing a title
that doesn't convey useful information — like 'Error' or 'Error 329347
occurred'". Apple Writing: "Interjections like 'oops!' or 'uh-oh' are typically
unnecessary and can sound insincere." Maestro: `Status out of date`, never
`Oops, something went wrong`.

**P14. A failure never discards the reader's work or the last good reading.**
NN/g Error-message guidelines: "Preserve the user's input". GOV.UK
[Problem with the service pages](https://design-system.service.gov.uk/patterns/problem-with-the-service-pages/):
"Store previously entered information for a reasonable amount of time so users
can resume a journey with re-populated information when the service becomes
available again." Apple Alerts (startup problem): "show cached or placeholder
data and a nonintrusive label that describes the problem." Extends #895 answer 3
(in-place retry keeps the rows). Maestro: a failed Harness read leaves the table
and shows `Read failed — last read 4 min ago`.

**P15. A whole-service failure page says what happened, what to do, and whether
the reader's work survived.**
GOV.UK Problem with the service pages: the H1 "Sorry, there is a problem with the
service", then "Try again later.", then one of "We saved your answers. They
will be available for 30 days." or "We have not saved your answers. When the
service is available, you will have to start again." Maestro: the connect gate
when the server is unreachable states whether the registry is intact.

**P16. Validate on submit, not while typing.**
GOV.UK [Validation](https://design-system.service.gov.uk/patterns/validation/):
"Do not validate when the user moves away from a field. Wait until they try to
move to the next part of the service - usually by clicking the 'continue' or
'submit' button at the bottom of the page." NN/g Error-message guidelines:
"Avoid prematurely displaying errors". Maestro: the Register repo path field
shows `Folder not found` after Register, not on every keystroke.

**P17. Prevent the error before writing the message.**
NN/g [Heuristic 5](https://www.nngroup.com/articles/ten-usability-heuristics/):
"Either eliminate error-prone conditions, or check for them and present users
with a confirmation option before they commit to the action." Apple Writing:
"It's always best to help people avoid errors." Maestro: the deploy use-case
refuses a diverged copy before calling `apm`, so the reader never sees apm's
half-deleted state.

## 3. Status and state

**P18. Colour is never the only channel for a state.**
WCAG [1.4.1 Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html):
"Color is not used as the only visual means of conveying information,
indicating an action, prompting a response, or distinguishing a visual
element." Apple [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility):
"Offer visual indicators, like distinct shapes or icons, in addition to color to
help people perceive differences in function and changes in state." GOV.UK
[Tag](https://design-system.service.gov.uk/components/tag/): "Do not use colour
alone to convey information, because it's not accessible." Maestro: every chip
carries its word; a green dot alone is not a status.

**P19. One colour, one meaning, everywhere.**
Apple [Color](https://developer.apple.com/design/human-interface-guidelines/color):
"Avoid using the same color to mean different things. Use color consistently
throughout your interface, especially when you use it to help communicate
information like status or interactivity." NN/g
[Color](https://www.nngroup.com/articles/color-enhance-design/): "Use colors
consistently in your interface." GOV.UK Tag: "If you use the same tag in more
than one place, make sure you keep the colour consistent." ADR-0024's four
levels bound to `danger`/`amber`/`green`/`dim` is this rule. Maestro: amber
means "you can proceed, at a cost" on every screen; it is never a decoration.

**P20. Keep the set of statuses small; add one only when research shows the need.**
GOV.UK Tag: "The more you add, the harder it is for users to remember them. So
start with the smallest number of statuses you think might work, then add more
if your user research shows there's a need for them." GOV.UK
[Complete multiple tasks](https://design-system.service.gov.uk/patterns/complete-multiple-tasks/)
ships five: Completed, Incomplete, Cannot start yet, Not yet started, In
progress. NN/g Color: "Limit your palette to three colors." Maestro: the
proposal states in `CONTEXT.md` are the whole vocabulary; a new chip word is a
glossary change, not a UI tweak.

**P21. The resting state is plain text; colour marks what needs action.**
GOV.UK Complete multiple tasks: "Once the user has completed the task, the
status should show as 'Completed' and be black text with no background colour.
This will draw more attention to tasks that require action." Apple Color:
"reserve it for elements that truly benefit from emphasis, such as status
indicators or primary actions." Maestro: `Up to date` is plain text;
`Update available` gets the chip.

**P22. Status words are adjectives in sentence case, two to four words.**
GOV.UK Tag: "Use adjectives (descriptive words) and not verbs (action words) for
the names of your tags." GOV.UK Task list: "Statuses are now written in sentence
case to make them easier to read." Matches the `copy.md` status-chip form.
Maestro: `Not yet proposed`, `Awaiting review` — never `Propose`.

**P23. Status feedback sits beside the thing it describes and waits to be read.**
Apple [Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback):
"it often works well to display status information in a passive way so that
people can view it when they need it." and "When status feedback is available
near the items it describes, people get important information without having to
take action or leave their current context." NN/g
[Visibility of system status](https://www.nngroup.com/articles/visibility-system-status/):
"Only by knowing what the current system status is can you change it".
Maestro: drift state is a column in the row, not a banner at the top.

**P24. An empty state says why it is empty, what will appear, and gives the
first action.**
NN/g [Empty states](https://www.nngroup.com/articles/empty-state-interface-design/):
"Tell the user what could be displayed, and how to populate the area with that
content." and "Provide direct pathways (i.e., links) to getting started with
key tasks related to populating the empty state." Apple Writing: "An empty
screen can be daunting if it isn't obvious what to do next, so guide people on
actions they can take, and give them a button or link to do so if possible.
Remember that empty states are usually temporary, so don't show crucial
information that could then disappear." The `copy.md` empty-state form (`No
{things} yet` plus one sentence) covers the first two; the anchors add the
control. Maestro: `No repos yet. Select Register repo to add one.`

**P25. A state indicator must itself reach 3:1 against its surroundings.**
WCAG [1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html):
"Any visual information necessary to indicate state, such as whether a
component is selected or focused must also ensure that the information used to
identify the control in that state has a minimum 3:1 contrast ratio." Maestro:
a chip's border or fill, a selected row's highlight and the focus ring are each
measured, not only the text inside them (see #985 for the ramp).

## 4. Waiting and freshness

Banked in #894 and #895; the entries below say what the anchors add.

**P26. Nothing under 1 s; a looping indicator from 1 s; percent-done from 10 s —
but only when the duration is known.**
NN/g [Progress indicators](https://www.nngroup.com/articles/progress-indicators/):
"Use a progress indicator for any action that takes longer than about 1.0
second." and "percent-done progress indicators should be used for longer
processes that take 10 or more seconds." NN/g
[Response times](https://www.nngroup.com/articles/response-times-3-important-limits/):
1.0 s is "the limit for the user's flow of thought to stay uninterrupted". Apple
[Progress indicators](https://developer.apple.com/design/human-interface-guidelines/progress-indicators):
"Indeterminate, for unquantifiable tasks, such as loading or synchronizing
complex data" and "When possible, use a determinate progress indicator."
Confirms #894 findings 1 and 3: Apple prefers determinate, but `gh`, `apm` and
`git fetch` never report a duration, so the cockpit stays indeterminate.

**P27. Show something at once; a blank region reads as a fault.**
Apple [Loading](https://developer.apple.com/design/human-interface-guidelines/loading):
"If you make people wait for loading to complete before displaying anything,
they can interpret the lack of content as a problem with your app or game.
Instead, consider showing placeholder text, graphics, or animations as content
loads, replacing these elements as content becomes available." NN/g
[Skeleton screens](https://www.nngroup.com/articles/skeleton-screens/):
"Spinners are typically best used on a single module, like a video or a card
which is on a dashboard. Skeleton screens ... are better when the full screen is
loading". Confirms #894 finding 3. Maestro: first load of the Inventory is a
skeleton; a single re-read is a spinner in that module.

**P28. A stationary indicator reads as a hang; if it stalls, say why.**
Apple Progress indicators: "Keep progress indicators moving so people know
something is continuing to happen. People tend to associate a stationary
indicator with a stalled process or a frozen app. If a process stalls for some
reason, provide feedback that helps people understand the problem and what they
can do about it." Adds to #894: a bounded execution time on `gh` (already in
`HarnessGitAdapter`) must end in a notice, never in a spinner that keeps
spinning.

**P29. Auto-refresh is expected — and must be pausable.**
Apple Progress indicators (refresh controls): "Perform automatic content
updates. Although people appreciate being able to do an immediate content
refresh, they also expect automatic refreshes to occur periodically. Don't make
people responsible for initiating every update." WCAG
[2.2.2 Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html):
"For any auto-updating information that (1) starts automatically and (2) is
presented in parallel with other content, there is a mechanism for the user to
pause, stop, or hide it or to control the frequency of the update unless the
auto-updating is part of an activity where it is essential." Adds to #895
contradiction 9 (the cockpit re-reads on window focus and no word covers it):
Apple says that re-read is right; WCAG says the reader needs a way to stop it.

**P30. Show when the data was last read, next to the data.**
Apple Progress indicators: "A refresh control in Podcasts, for example, uses a
title to tell people when the last podcast update occurred." NN/g Heuristic 1:
"The design should always keep users informed about what is going on, through
appropriate feedback within a reasonable amount of time." Confirms #895 answer 2
(`<time datetime>` beside the thing it dates) with one first-party precedent.

**P31. A wait's description is specific or absent; "Loading…" adds nothing.**
Apple Progress indicators: "If it's helpful, display a description that
provides additional context for the task. Be accurate and succinct. Avoid vague
terms like loading or authenticating because they seldom add value." Sharpens
the `copy.md` loading form: `Loading the Inventory…` names the screen and
passes; a bare `Loading…` does not. Apple's macOS note "Avoid labeling a spinning
progress indicator" applies to the spinner beside a pressed control, not to the
status slot — see §9.

**P32. Let the reader cancel a wait when cancelling is safe; say when it is not.**
Apple Progress indicators: "If people can interrupt a process without causing
negative side effects, include a Cancel button." and "When canceling a process
results in lost progress, it's helpful to provide an alert that includes an
option to confirm the cancellation or resume the process." Maestro: a Harness
read may be cancelled; a Deploy in flight may not (apm has already started
writing), and the dialog says so.

**P33. A wait or its outcome is announced by a live region that was already there.**
WCAG [4.1.3 Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)
defines a status message as information "on the success or results of an
action, on the waiting state of an application, on the progress of a process,
or on the existence of errors" and requires it to be "presented to the user by
assistive technologies without receiving focus." APG
[Feed](https://www.w3.org/WAI/ARIA/apg/patterns/feed/): during a multi-step DOM
update the container "has aria-busy set to true", and "it is extremely important
that aria-busy is set to false when the operation is complete or the changes
may not become visible to some assistive technology users." Confirms #895
answer 4 and ADR-0024 §5 (region always mounted).

## 5. Keyboard, focus and screen readers

**P34. Something always has focus, and it is visible.**
APG [Keyboard interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/):
"It is essential that there is always a component within the user interface
that is active (document.activeElement is not null or is not the body element)
and that the active element has a visual focus indicator." WCAG
[2.4.7 Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html)
(AA): "Any keyboard operable user interface has a mode of operation where the
keyboard focus indicator is visible." WCAG
[2.4.11 Focus Not Obscured (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)
(AA): "the component is not entirely hidden due to author-created content", with
"sticky footers, sticky headers, and non-modal dialogs" named as the usual
culprits. Maestro: a sticky table header uses scroll padding so a focused row
never slides under it.

**P35. A control that must stay discoverable while unavailable uses
`aria-disabled`, not `disabled`.**
APG Keyboard interface: "When a disabled element does need to remain
discoverable, aria-disabled="true" is applied so that it will remain
focusable." GOV.UK [Button](https://design-system.service.gov.uk/components/button/):
"Disabled buttons have poor contrast and can confuse some users, so avoid them
if possible." Apple [Menus](https://developer.apple.com/design/human-interface-guidelines/menus):
"Show people when a menu item is unavailable. An unavailable menu item often
appears dimmed and doesn't respond to interactions." Confirms #895 contradiction
8 (both re-read controls are `disabled` mid-read and lose focus). The
`copy.md` blocked-control form (`Withdraw proposal — no request yet`) is the
visible half of this rule.

**P36. Do not move focus unless the reader moved it, or the focused thing is gone.**
Apple [Focus and selection](https://developer.apple.com/design/human-interface-guidelines/focus-and-selection):
"Avoid changing focus without people's interaction. People rely on the focus
system to help them know where they are in your app." and, when the focused item
disappears under keyboard navigation, "moving focus to one of these remaining
items ensures that the focus indicator is in a location people can easily
find." APG [Alert](https://www.w3.org/WAI/ARIA/apg/patterns/alert/): "it is
crucial they do not affect keyboard focus." Confirms ADR-0024 §7 and its one
exception (the card heading when the control no longer exists). GOV.UK is the
dissenter — see §9.

**P37. A composite widget is one Tab stop; arrows move inside it.**
APG Keyboard interface: "the tab sequence should include only one focusable
element of a composite UI component". APG
[Toolbar](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/): "the keyboard tab
sequence includes one stop for the toolbar and arrow keys move focus among the
controls in the toolbar." APG [Grid](https://www.w3.org/WAI/ARIA/apg/patterns/grid/):
"Only one of the focusable elements contained by the grid is included in the
page tab sequence." versus APG [Table](https://www.w3.org/WAI/ARIA/apg/patterns/table/):
"All focusable elements contained in a table are included in the page tab
sequence." Maestro: the row-action buttons in the skill table are a design
choice between `table` (every button a Tab stop, fine under ~20 rows) and
`grid` (one stop, arrows between cells); pick per table size and write it down.

**P38. A menu button opens with Enter, Space or Down Arrow, focuses the first
item, and Escape returns focus to the button.**
APG [Menu button](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/): Enter
"opens the menu and places focus on the first menu item"; the button carries
`aria-haspopup` and `aria-expanded`. APG
[Menu and menubar](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/): "Escape:
Close the menu that contains focus and return focus to the element or context,
e.g., menu button or parent menuitem, from which the menu was opened." and "Tab
and Shift + Tab do not move focus among the items in the menu". Maestro: the
row's `…` menu.

**P39. Accessible names start with the visible words, are one to three words,
and name purpose, not form.**
APG [Names and descriptions](https://www.w3.org/WAI/ARIA/apg/practices/names-and-descriptions/):
"Be concise. For many elements, one to three words is sufficient." "Put the most
distinguishing and important words first." "Convey function or purpose, not
form. For example, if an icon that looks like the letter X closes a dialog,
name it Close, not X." Dialogs and tables: "Use aria-labelledby if a visible
label is present, otherwise use aria-label." Confirms `design.md` and the
`copy.md` accessible-name form. Maestro: `Inventory table`, `Close`.

**P40. Table semantics are real: `<caption>`, `scope`, and `aria-sort` on the
sorted header.**
WCAG [1.3.1 Info and Relationships](https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html):
"Information, structure, and relationships conveyed through presentation can be
programmatically determined or are available in text." GOV.UK
[Table](https://design-system.service.gov.uk/components/table/): "Use the
`<caption>` element to describe a table in the same way you would use a
heading." and "Use the `scope` attribute to help users of assistive technology
distinguish between row and column headers." APG
[Sortable table](https://www.w3.org/WAI/ARIA/apg/example-index/table/sortable-table.html):
"The header text of sortable columns is wrapped in a button element." and
`aria-sort` is "Set on the currently sorted column. When the sorted column is
changed, the aria-sort attribute is removed and set on the newly sorted column."
Maestro: the Inventory table gets a caption that is its accessible name.

**P41. Hover content is dismissable, hoverable and persistent.**
WCAG [1.4.13 Content on Hover or Focus](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html)
(AA): "A mechanism is available to dismiss the additional content without
moving pointer hover or keyboard focus", "the pointer can be moved over the
additional content without the additional content disappearing", and it
"remains visible until the hover or focus trigger is removed, the user
dismisses it, or its information is no longer valid". Maestro: a lock-hash
tooltip on a row must survive the pointer crossing to it and close on Escape.

**P42. Pointer targets are at least 24×24 CSS px, or spaced as if they were.**
WCAG [2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
(AA): "The size of the target for pointer inputs is at least 24 by 24 CSS
pixels", with the spacing exception for undersized targets whose 24 px circles
"do not intersect another target". Apple Accessibility: "Consider spacing
between controls as important as size." Maestro: a 32 px row with two icon
buttons is fine; three 20 px icons touching each other is not.

**P43. Support 200% text and keep the hierarchy at that size.**
Apple Accessibility: "Ideally, give people the option to enlarge text by at
least 200 percent". Apple [Typography](https://developer.apple.com/design/human-interface-guidelines/typography):
"Maintain a consistent information hierarchy regardless of the current font
size." WCAG [1.4.10 Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)
(AA) requires no two-dimensional scrolling at 320 CSS px "Except for parts of
the content which require two-dimensional layout for usage or meaning",
listing "data tables (not individual cells)". This is the `design.md` 200%-zoom
check, with the table carve-out made explicit: the table may scroll sideways
inside its own container; the page must not.

## 6. Dense data tables

**P44. Numbers right-aligned, in tabular figures; text left-aligned.**
GOV.UK Table: "When comparing columns of numbers, align the numbers to the right
in table cells." GOV.UK [Type scale](https://design-system.service.gov.uk/styles/type-scale/)
ships tabular figures as `@include govuk-font($size: 19, $weight: bold,
$tabular: true)`. Apple Lists and tables: "Use descriptive column headings in a
multicolumn table. Use nouns or short noun phrases". Maestro: the version and
count columns of the Inventory. Not found: no anchor states a row height or a
density scale for tables (see §10).

**P45. The first column is a human-readable identifier.**
NN/g [Data tables](https://www.nngroup.com/articles/data-tables/): "The (default)
first column should be a human-readable record identifier instead of a 'mystery
meat' automatically generated ID." Maestro: skill name first, never the lock
hash.

**P46. Freeze the header when the table outgrows the screen; stripe or hover to
track a row.**
NN/g Data tables: "Freeze header rows and header columns (if the table is larger
than the screen)." and "Borders, zebra striping, and hover-triggered
highlighting of a record can all help." Apple Lists and tables (macOS):
"Consider using alternating row colors in a multicolumn table. Alternating
colors can help people track row values across columns, especially in a wide
table." With P34's obscured-focus rule, a frozen header needs scroll padding.

**P47. Sorting is a click on the header, toggling direction, with a visible and
an announced indicator.**
Apple Lists and tables (macOS): "When it provides value, let people click a
column heading to sort a table view based on that column. If people click the
heading of a column that's already sorted, re-sort the data in the opposite
direction." APG Sortable table: "Character entities (e.g. '▼' and '▲') are used
to indicate the sorting direction." with the glyphs `aria-hidden` and
`aria-sort` carrying the state. Maestro: no sort control ships today; when one
does, this is its shape.

**P48. Filters are discoverable and quick; column hiding and reordering are easy.**
NN/g Data tables: "Filters need to be discoverable, quick, and powerful." and
"Hiding and reordering columns must be easy to accomplish". Apple Lists and
tables (macOS): "Let people resize columns." Maestro: the Inventory filter
field sits above the table, not behind a menu.

**P49. Row selection feedback matches what selecting does.**
Apple Lists and tables: "a table that helps people navigate through a hierarchy
persistently highlights the selected row to clarify the path people are taking.
In contrast, a table that lists options often highlights a row only briefly".
Apple Focus and selection: "use a focus ring for a text or search field, but use
a highlight in a list or collection." Maestro: the selected skill row stays
highlighted while its detail pane is open.

## 7. Theming

**P50. Follow the operating system's appearance; do not add an in-app switch
that competes with it.**
Apple [Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode):
"Avoid offering an app-specific appearance setting. An app-specific appearance
mode option creates more work for people because they have to adjust more than
one setting to get the appearance they want. Worse, they may think your app is
broken because it doesn't respond to their systemwide appearance choice."
Maestro: `prefers-color-scheme` drives the theme. NN/g disagrees on the switch —
see §9.

**P51. Both modes must exist and both must pass AA; dark is not the inverse of
light.**
Apple Dark Mode: "Ensure that your app looks good in both appearance modes."
and "these colors aren't necessarily inversions of their light counterparts".
Apple Color: "If you define a custom color, make sure to supply light and dark
variants". Apple Accessibility: "If your app supports Dark Mode, make sure to
check the minimum contrast in both light and dark appearances." WCAG
[1.4.3 Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html):
4.5:1 for text, 3:1 for large text. This is what #985 measured: each of the
twelve steps has a dark counterpart chosen for AA, not computed by inversion.

**P52. Semantic colour tokens, never hard-coded values.**
Apple Dark Mode: "Embrace colors that adapt to the current appearance." and
"Avoid using hard-coded color values or colors that don't adapt." Apple Color:
"Avoid redefining the semantic meanings of dynamic system colors." Matches
ADR-0004 (tokens are the source of truth). Maestro: `--color-danger`, never
`#c0392b`.

**P53. Light mode is the default that reads best for most; dark must remain a
choice for those it helps.**
NN/g [Dark mode](https://www.nngroup.com/articles/dark-mode/): "in users with
normal vision, light mode leads to better performance most of the time." and
"participants with cloudy ocular media had better reading rates with dark
modes". Maestro: light is the default; dark follows the OS (P50).

**P54. Respect Reduce Motion and Increase Contrast.**
Apple Accessibility: "When this setting is active, ensure your app or game
responds by reducing automatic and repetitive animations". Apple Dark Mode:
"Test your content to make sure that it remains comfortably legible in both
appearance modes. For example, in Dark Mode with Increase Contrast and Reduce
Transparency turned on". Maestro: `prefers-reduced-motion` stops the busy
spinner's rotation and swaps a static glyph; `prefers-contrast` is checked in
the 200%-zoom pass.

GOV.UK states nothing on dark mode: its
[Colour](https://design-system.service.gov.uk/styles/colour/) page requires
WCAG 1.4.3 AA and mentions no appearance mode.

## 8. Feedback patterns

Which surface carries which message, and what a dialog looks like.

**P55. The ladder: inline notice → banner → dialog. Choose by how much the
message interrupts, matched to how much it matters.**
Apple Feedback: "The most effective feedback tends to match the significance of
the information to the way it's delivered." NN/g
[Error messages scoring rubric](https://www.nngroup.com/articles/error-messages-scoring-rubric/):
"Modal dialogs (which have high interaction cost) should be reserved for
presenting consequential, actionable decisions to users. Other types of
interface components, such as banners, toast notifications, popovers, or labels,
should be used to communicate passive warnings or less severe errors to reduce
interaction costs." NN/g
[Indicators, validations, notifications](https://www.nngroup.com/articles/indicators-validations-notifications/):
action-required notifications "could be implemented as modal popups that
interrupt the user, forcing immediate attention", passive ones as "a badge icon
or a small nonmodal popover in a corner of a screen." ADR-0024 chose one
primitive and no banner or toast region; the anchors do not require more
surfaces, they require that whatever surface exists is matched to severity.

**P56. Inline notice (default): anything about one control, one row or one
region — an outcome, a warning, a failed read.**
NN/g Error-message guidelines: "Display the error message close to the error's
source". Apple Feedback: status "near the items it describes". GOV.UK Error
message: "Show an error message next to the field". This is ADR-0024's
`Notice`. Maestro: every server error code lands here.

**P57. Banner (page-level, sparingly): a problem with the whole service, or a
completed action whose result the reader cannot see in place.**
GOV.UK [Notification banner](https://design-system.service.gov.uk/components/notification-banner/):
use for "telling the user about a problem that's affecting the service as a
whole" or "confirming that an email has been sent"; "Do not: use a notification
banner to tell the user about validation errors"; "Use notification banners
sparingly. There's evidence that people often miss them"; placed "immediately
before the page h1" with `role="region"`. Maestro: the connect gate's
"server unreachable" state is the one banner-shaped message; per-row failures
never are.

**P58. Toast: never for an error or anything that needs an action; if used at
all, only for a passive confirmation the reader can afford to miss.**
NN/g Indicators, validations, notifications: a toast, "while appropriate for
passive notifications, would be a bad way to implement an error message"; "one
of our mobile users spent 5 minutes waiting for some content to load only
because she hadn't notice the little error message presented at the bottom of
the screen that quickly faded away after 5 seconds". APG Alert: "it is
important to avoid designing alerts that disappear automatically." WCAG 2.2.1
counts content that disappears on its own as a time limit. Apple ships no toast
component and GOV.UK's
[component index](https://design-system.service.gov.uk/components/) lists none.
Maestro: no toast region exists and none is needed — a confirmation reads in
place as a `success` notice that stays.

**P59. Confirm only the uncommon, irreversible action; everything else gets undo.**
Apple [Alerts](https://developer.apple.com/design/human-interface-guidelines/alerts):
"Avoid displaying alerts for common, undoable actions, even when they're
destructive." and "when people take an uncommon destructive action that they
can't undo, it's important to display an alert in case they initiated the
action accidentally." NN/g
[Confirmation dialogs](https://www.nngroup.com/articles/confirmation-dialog/):
"Use a confirmation dialog before committing to actions with serious
consequences — such as destroying users' work or costing large amounts of
money." and "if you cry wolf too many times, people will stop paying attention
to the question". WCAG
[3.3.4 Error Prevention](https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-legal-financial-data.html)
(AA) requires one of "Reversible", "Checked" or "Confirmed" where users
"delete data stored in a database that they later need to access". GOV.UK
Button (warning buttons): "Only use warning buttons for actions with serious
destructive consequences that cannot be easily undone by a user." Maestro:
Remove skill (apm deletes files; no undo) confirms; Retry check does not.

**P60. Do not confirm a routine deletion; warn only about loss that is unexpected.**
Apple Feedback: "Warn people when they initiate a task that can cause data loss
that's unexpected and irreversible. In contrast, don't warn people when data
loss is the expected result of their action." Maestro: withdrawing a proposal
the reader just opened is expected; removing a skill whose deployed copy has
local edits is unexpected loss and gets the `warning` notice with its cost
(ADR-0024 §3).

**P61. A dialog has a title naming the task, a short body, and buttons that
name their result.**
Apple Alerts: "Write a title that clearly and succinctly describes the
situation." "Include informative text only if it adds value." "Aim for a one- or
two-word title that describes the result of selecting the button." "Avoid
using OK as the default button title unless the alert is purely
informational." and "avoiding 'Yes' and 'No'." NN/g Confirmation dialogs:
"provide response options that summarize what will happen for each possible
response. For example, in the case of file deletion, use buttons labeled Delete
file and Keep file." Apple Modality: "Make it easy to identify a modal view's
task." Matches the `copy.md` dialog form (`Delete {skill}` / `Delete skill`).

**P62. Primary action on the trailing side, Cancel on the leading side; a
destructive action the reader did not choose gets the destructive style.**
Apple Alerts: "Always place the default button on the trailing side of a row or
at the top of a stack. Cancel buttons are typically on the leading side of a
row or at the bottom of a stack." "Use the destructive style to identify a
button that performs a destructive action people didn't deliberately choose."
and "If there's a destructive action, include a Cancel button to give people a
clear, safe way to avoid the action. Always use the title 'Cancel'". GOV.UK
Button: "Do not only rely on the red colour of a warning button to communicate
the serious nature of the action." Apple is the only anchor that states an
order — see §10.

**P63. A modal dialog is inert underneath, traps Tab, closes on Escape, and
returns focus to where it came from.**
APG [Dialog (Modal)](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/):
"Windows under a modal dialog are inert." "Tab and Shift + Tab do not move
focus outside the dialog." "Escape: Closes the dialog." The dialog is named by
"aria-labelledby ... that refers to a visible dialog title". Apple Alerts:
cancel by "Pressing Escape (Esc) or Command-Period (.)". Apple Modality: "Always
give people an obvious way to dismiss a modal view." and "you never want to
display more than one alert at the same time." Maestro: the shadcn `Dialog` is
owned (ADR-0004) and does this; a second dialog never opens over the first.

**P64. Initial focus in a destructive dialog goes to the least destructive
control — or, per Apple, to nothing.**
APG Dialog (Modal): "If a dialog contains the final step in a process that is
not easily reversible, such as deleting data or completing a financial
transaction, it may be advisable to set focus on the least destructive
action." Apple Alerts: "If you want to encourage people to read an alert and
not just automatically press Return to dismiss it, avoid making any button the
default button." and, for a deliberately chosen destructive action, "the
convenience of pressing Return to confirm the deliberately chosen Empty Trash
action outweighs the benefit of reaffirming that the button is destructive."
Maestro: Remove skill focuses Cancel; the two anchors' split is in §9.

**P65. An alert dialog is for a message that needs a response; a plain alert
never takes focus.**
APG [Alert dialog](https://www.w3.org/WAI/ARIA/apg/patterns/alertdialog/): "An
alert dialog is a modal dialog that interrupts the user's workflow to
communicate an important message and acquire a response." with
`aria-describedby` pointing at the message. APG Alert: "it is crucial they do
not affect keyboard focus." and "Frequent interruptions inhibit usability for
people with visual and cognitive disabilities". Apple Alerts: "Avoid using an
alert merely to provide information." Maestro: a failed read is a `Notice`
(`role="status"` or derived `role="alert"`, ADR-0024 §4), never a dialog.

**P66. Confirm success only where the reader would otherwise not know.**
Apple Feedback: "It's generally best to reserve this type of confirmation for
activities that are sufficiently important — because people typically expect
their action or task to succeed, they only need to know when it doesn't."
GOV.UK Notification banner (success): shown with a "Success" heading and
"removed when the user moves to a new page." Maestro: a Deploy's success is
the row's new state; the `success` notice is for outcomes the row cannot show
(a pull request opened on GitHub, with its link).

**P67. Never show a dialog or alert on load.**
Apple Alerts: "Avoid showing an alert when your app starts." ADR-0024 §4 (a
panel that failed to load is always `trigger: "load"`, so never assertive).
Maestro: the connect gate is a screen, not a dialog.

## 9. Where two anchors disagree

1. **Moving focus to an error.** GOV.UK
   [Error summary](https://design-system.service.gov.uk/components/error-summary/):
   "move keyboard focus to the error summary" and always show it "even if
   there's only one". APG Alert: "it is crucial they do not affect keyboard
   focus." Apple Focus and selection: "Avoid changing focus without people's
   interaction." GOV.UK's rule assumes a full page reload after a form post;
   in a single-page cockpit the APG/Apple rule (ADR-0024 §7) stands.
2. **Success feedback: required or reserved.** GOV.UK's success banner takes
   `role="alert"` and moves focus to itself; NN/g Heuristic 1 wants feedback
   for every action; Apple Feedback says people "only need to know when it
   doesn't" succeed. WCAG 4.1.3's technique for success is `role=status`, not
   `role=alert`, which also cuts against GOV.UK's markup.
3. **A dark-mode switch in the product.** NN/g Dark mode: "we strongly
   recommend that designers allow users to switch to dark mode if they want
   to". Apple Dark Mode: "Avoid offering an app-specific appearance setting."
   Reconcilable only by reading NN/g's switch as the OS one.
4. **Initial focus and the default button in a destructive dialog.** APG:
   focus "the least destructive action". Apple: no default button when the
   reader must read; but when the destructive action was deliberately chosen,
   the default is that action so Return confirms it. The same dialog gets
   opposite Return behaviour from the two anchors.
5. **Disabled controls.** GOV.UK Button: "avoid them if possible"; Apple
   Menus: show the item "dimmed" rather than hide it; APG: `aria-disabled` to
   keep it focusable. GOV.UK says do not show; Apple says show but dim; APG
   says show, dim and keep focus.
6. **Automatic refresh.** Apple Progress indicators: "Don't make people
   responsible for initiating every update." WCAG 2.2.2 (Level A): any
   auto-updating information presented in parallel with other content needs
   a way to "pause, stop, or hide it or to control the frequency". Apple
   requires the behaviour WCAG requires a switch for.
7. **Labelling a spinner.** Apple Progress indicators (macOS): "Avoid
   labeling a spinning progress indicator." The same page: "display a
   description that provides additional context for the task ... Avoid vague
   terms like loading". Internal tension; #895's status-slot busy word
   (`Reading GitHub…`) follows the second sentence, the spinner beside a
   button follows the first.
8. **A generic problem heading.** GOV.UK fixes "There is a problem" for
   every error summary and "Sorry, there is a problem with the service" for
   the service page. Apple Alerts: "Avoid writing a title that doesn't convey
   useful information — like 'Error'". GOV.UK's own Error message page bans
   "sorry" ("it does not help fix the problem") while its problem page opens
   with it. `copy.md`'s outcome-first heading sides with Apple.
9. **How many colours.** NN/g Color: "Limit your palette to three colors."
   GOV.UK Tag ships a multi-colour tag palette and says "You can use colour to
   help distinguish between different tags". ADR-0024's four levels sit
   between the two.
10. **Toasts.** NN/g accepts a toast for "passive notifications"; APG Alert
    says "avoid designing alerts that disappear automatically" and WCAG 2.2.1
    counts self-dismissing content as a time limit. Apple and GOV.UK ship no
    toast at all.
11. **Validation timing.** GOV.UK: "Do not validate when the user moves away
    from a field." NN/g Error-message guidelines only says "Avoid prematurely
    displaying errors" — compatible, but NN/g does not forbid on-blur
    validation; GOV.UK does.
12. **Tables versus grids for keyboard.** APG Table puts every focusable cell
    control in the Tab sequence; APG Grid makes the whole table one stop. Both
    are APG; the guide offers the choice and states no threshold.

## 10. What the anchors do not say

- No anchor gives a row height, a density scale or a minimum row count for a
  data table. Apple says "succinct" and NN/g says freeze the header; neither
  gives a number.
- No anchor states an order for primary/secondary buttons outside a dialog.
  Apple orders dialog buttons; GOV.UK's Button page was read and states
  primary/secondary roles but no left-right rule; NN/g is silent.
- No anchor names a threshold at which a relative timestamp (`4 min ago`)
  becomes noise; Apple's Podcasts example is the only first-party precedent
  for showing one at all.
- GOV.UK says nothing about dark mode, high contrast or forced colours.
- Neither Apple nor GOV.UK publishes a severity taxonomy beyond
  error/warning; ADR-0024's four-level scale stays a house rule.
- WCAG 4.1.3 does not itself say the live region must exist before the
  content changes; that requirement is the APG/ADR-0024 reading and stands on
  its own measurement.

## Pages read

WCAG 2.2 Understanding: 1.3.1, 1.4.1, 1.4.3, 1.4.10, 1.4.11, 1.4.13, 2.2.1,
2.2.2, 2.4.7, 2.4.11, 2.5.8, 3.2.6, 3.3.1, 3.3.3, 3.3.4, 4.1.3.
APG: patterns dialog-modal, alertdialog, alert, table, grid, menu-button,
menubar, disclosure, toolbar, switch, feed; practices keyboard-interface,
names-and-descriptions; example sortable-table.
NN/g: visual-hierarchy-ux-definition, f-shaped-pattern-reading-web-content,
progressive-disclosure, error-message-guidelines, ten-usability-heuristics,
indicators-validations-notifications, confirmation-dialog,
empty-state-interface-design, dark-mode, data-tables,
response-times-3-important-limits, progress-indicators, modal-nonmodal-dialog,
skeleton-screens, dashboards-preattentive, working-memory-external-memory,
color-enhance-design, error-messages-scoring-rubric, ui-elements-glossary,
visibility-system-status. (Slugs `visual-hierarchy`, `toast-notifications`,
`short-term-memory` return 404; NN/g has no dedicated toast article.)
GOV.UK: components error-message, error-summary, notification-banner, table,
tag, button, details, warning-text, task-list, summary-list, index; patterns
validation, problem-with-the-service-pages, complete-multiple-tasks; styles
colour, type-scale; get-started/focus-states. (`/styles/focus-states/`,
`/styles/typography/`, `/patterns/problem-pages/` return 404.)
Apple HIG: alerts, modality, feedback, progress-indicators, dark-mode, color,
loading, lists-and-tables, accessibility, keyboards, focus-and-selection,
undo-and-redo, typography, layout, menus, writing, sheets, notifications.
