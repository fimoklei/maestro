# Where do Apple and Google put a user-facing message?

One fixed region, or inline next to the thing that failed? Read against the
first-party guidelines only — no blog posts, no secondary summaries. Every page
below was fetched **2026-07-31**.

## Answer

**Neither system has a single fixed message region, and neither offers one as a
default.** Both route a message by two questions: *how much does it need to
interrupt?* and *what is it about?* The second question is the one that decides
placement, and both systems answer it the same way — a message about a specific
thing sits with that thing.

The two systems differ in how much they say out loud:

- **Material 3 states the rule explicitly**, once, in the dialogs page: field
  errors inline where they occur, general errors in a dialog. It also **removed
  the one fixed-region component it used to have** (the M2 Banner).
- **Apple never states a placement rule at all.** It states an *interruption*
  rule ("match the significance of the information to the way it's delivered")
  and a *proximity* preference ("near the items it describes"), and leaves the
  pixel location to you. Apple has no toast, no snackbar, and no banner
  component.

**W3C is deliberately silent on location** and says so in as many words. It
constrains only the content (text, and it identifies the item in error).

## How these pages were read

`developer.apple.com` and `m3.material.io` are client-rendered. `curl` and
WebFetch both return an empty app shell — the Apple DocC JSON endpoint
(`/tutorials/data/documentation/design/human-interface-guidelines/<page>.json`)
now 404s. Every Apple and Material page below was rendered with
`agent-browser open <url>` then `agent-browser read`. The W3C pages are static
HTML and were read with `curl`.

---

## 1. Is there a single fixed region? No — and here is each system's actual rule

### Apple: match the level of interruption to the importance

The [Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback)
page (fetched 2026-07-31) is the closest thing Apple has to a routing rule:

> The most effective feedback tends to match the significance of the information
> to the way it's delivered. For example, it often works well to display status
> information in a passive way so that people can view it when they need it. In
> contrast, a warning about possible data loss needs to interrupt people so they
> have a chance to avoid the problem.

Same page, on where passive feedback goes:

> **Consider integrating status feedback into your interface.** When status
> feedback is available near the items it describes, people get important
> information without having to take action or leave their current context.

And on the interrupting end:

> **Use alerts to deliver critical — and ideally actionable — information.** By
> design, alerts disrupt the current context, so you need to match the importance
> of the information to the level of interruption. Alerts can lose their impact
> if you use them too often or to deliver unimportant information.

The [Alerts](https://developer.apple.com/design/human-interface-guidelines/alerts)
page (fetched 2026-07-31) closes the loop by pushing informational messages back
into context:

> **Avoid using an alert merely to provide information.** People don't appreciate
> an interruption from an alert that's informative, but not actionable. If you
> need to provide only information, prefer finding an alternative way to
> communicate it within the relevant context. For example, when a server
> connection is unavailable, Mail displays an indicator that people can choose to
> learn more.

> **Avoid showing an alert when your app starts.** […] If your app detects a
> problem at startup, like no network connection, consider alternative ways to
> let people know. For example, you could show cached or placeholder data and a
> nonintrusive label that describes the problem.

**Apple ships no fixed-region component.** The
[Presentation](https://developer.apple.com/design/human-interface-guidelines/presentation)
category (fetched 2026-07-31) lists exactly: Action sheets, Alerts, Page
controls, Panels, Popovers, Scroll views, Sheets, Windows. No toast, no
snackbar, no in-window banner. Apple's only "banner" is a system notification
outside the app — and
[Notifications](https://developer.apple.com/design/human-interface-guidelines/notifications)
(fetched 2026-07-31) forbids using it for errors:

> **Use an alert — not a notification — to display an error message.** People
> are familiar with both alerts and notifications, so you don't want to cause
> confusion by using the wrong component.

### Material 3: a two-rung priority ladder, and the middle rung was deleted

M3 routes on importance through two components only.
[Snackbar guidelines](https://m3.material.io/components/snackbar/guidelines)
(fetched 2026-07-31):

| Component | Priority | User action |
|---|---|---|
| Snackbar | Low priority | Optional: Snackbars disappear automatically |
| Dialog | High priority | Required: Dialogs block app usage until the user takes a dialog action or exits the dialog (if available) |

[Dialogs guidelines](https://m3.material.io/components/dialogs/guidelines)
(fetched 2026-07-31) carries the mirror table and the negative rule:

> **Don't** use dialogs for low- or medium-priority information. Instead use a
> snackbar, which can be dismissed or disappear automatically.

**The Banner is gone from M3.** `https://m3.material.io/components/banner` and
`/components/banners` both return **HTTP 404** (measured 2026-07-31 with
`curl -o /dev/null -w "%{http_code}"`), and the full
[M3 component index](https://m3.material.io/components) (fetched 2026-07-31)
lists no Banner: App bars, Badges, Cards, Carousel, Checkbox, Chips, Dialogs,
Divider, Lists, Menus, Radio button, Search, Sliders, Snackbar, Switch, Tabs,
Text fields, Toolbars, Tooltips, plus the Buttons / Date & time pickers /
Loading & progress / Navigation / Sheets groups.

M2 had it, and it was the fixed-region pattern.
[M2 Banners](https://m2.material.io/components/banners) (fetched 2026-07-31):

> Banners should be displayed at the top of the screen, below a top app bar.
> They're persistent and nonmodal, allowing the user to either ignore them or
> interact with them at any time. Only one banner should be shown at a time.

M2's table had three rungs — Snackbar (low), Banner ("Prominent, medium
priority", remains "until dismissed by the user, or if the state that caused the
banner is resolved"), Dialog (highest). **M3 dropped the middle rung and did not
replace it.** So the persistent, dismissible, top-of-screen message strip is a
pattern Google used to bless and now does not.

### W3C: explicitly declines to pick a location

[Understanding SC 3.3.1 Error
Identification](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html)
(fetched 2026-07-31), verbatim note:

> This criterion does not mandate any particular way in which errors should be
> displayed. Depending on the situation, it may be more suitable for all errors
> to be listed at the start or before a form. In other cases, it may be more
> appropriate to show errors inline, with error messages next to the specific
> fields that are in error. Errors could also be listed in an alert, or dialog.
> This criterion does not cover which of these methods should be used — the only
> requirement is for errors to be presented to users in text or a text
> alternative.

The criterion itself constrains content, not position:

> If an input error is automatically detected, the item that is in error is
> identified and the error is described to the user in text.

Its sufficient techniques deliberately span every placement: `ARIA18` (alert
dialog), `ARIA19` (`role=alert` / live regions), `ARIA21` (`aria-invalid` on the
field), `G83`/`G84`/`G85` (text descriptions), `SCR32` (error text added to the
DOM). An advisory technique, `G139`, is *"Creating a mechanism that allows users
to jump to errors"* — which presumes the errors are somewhere other than the
summary, i.e. at the fields.

**Anyone claiming "WCAG requires inline field errors" is wrong.** It requires
text and identification. Not location.

---

## 2. Field-bound errors vs whole-view errors

**Material 3 answers this in one paragraph**, in
[Dialogs guidelines](https://m3.material.io/components/dialogs/guidelines)
§ Error messages (fetched 2026-07-31):

> Errors about the dialog fields should always appear inline where they occur.
> Some components like text fields have built-in error messaging, while others
> like checkboxes and radio buttons need error messages to be added next to the
> fields.
>
> General errors such as network issues preventing saving or submitting should
> appear in a basic dialog when the confirming action fails.
>
> Error messages should clearly but briefly explain the source of the error and
> how to fix it. Show all errors on the page at once so people can fix everything
> before trying again.

Three separate rules in one block: **field error → inline at the field**;
**whole-operation error → dialog at the moment the action fails**; **never drip
errors one at a time**.

The field half is specified again in
[Text fields guidelines](https://m3.material.io/components/text-fields/guidelines)
(fetched 2026-07-31):

> For text fields that validate their content such as passwords, replace
> supporting text with error text. Swapping supporting text with error text
> prevents new lines of text from bumping content and changing the layout.
>
> - If only one error is possible, error text should describe how to avoid the error
> - If multiple errors are possible, error text should describe how to avoid the most likely error

Note what this forces: the error occupies the field's *existing* supporting-text
slot, so an error appearing never reflows the form. Same page: *"Don't add error
text in addition to supporting text, as their appearance will shift content."*

**Apple says nothing about placement, only about timing.**
[Text fields](https://developer.apple.com/design/human-interface-guidelines/text-fields)
(fetched 2026-07-31):

> **Validate fields when it makes sense.** For example, if the only legitimate
> value for a field is a string of digits, your app needs to alert people if
> they've entered characters other than digits. The appropriate time to check the
> data depends on the context: when entering an email address, it's best to
> validate when people switch to another field; when creating a user name or
> password, validation needs to happen before people switch to another field.

[Entering data](https://developer.apple.com/design/human-interface-guidelines/entering-data)
(fetched 2026-07-31):

> **Dynamically validate field values.** People can get frustrated when they have
> to go back and correct mistakes after filling out a lengthy form. When you
> verify values as soon as people enter them — and provide feedback as soon as
> you detect a problem — you give them the opportunity to correct errors right
> away.

**Neither Apple page says where the feedback appears.** "Provide feedback as
soon as you detect a problem" and "your app needs to alert people" is the whole
of it. There is no HIG equivalent of Material's error-text slot. This is a real
gap, not an oversight I am papering over: Apple's guidance for form errors is
about *when*, Material's is about *where*.

---

## 3. Per-row / per-item errors in a list or table

**Both systems are silent. This is the clearest gap in the research.**

[Apple's Lists and
tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables)
page (fetched 2026-07-31) covers row content, truncation, column headings,
sorting, resizing, alternating row colours, and outline views. It contains no
guidance on error, failure, or per-row status of any kind. Its only feedback
rule is about selection:

> **Provide appropriate feedback when people select a list item.** The feedback
> can vary depending on whether selecting the item reveals a new view or toggles
> the item's state.

**Material 3 has no data-table component at all.**
`https://m3.material.io/components/data-tables` returns **HTTP 404** (measured
2026-07-31), and the M3 component index has no data table entry. M2 did list one
(visible in the [M2 component
nav](https://m2.material.io/components/banners), fetched 2026-07-31).
[M3 Lists guidelines](https://m3.material.io/components/lists/guidelines)
(fetched 2026-07-31) mentions status exactly once, and not for errors: *"A
trailing icon is often used to communicate status or indicate an action, like
Show more."*

So no primary source directly answers "36 rows, some failed". Four rules from
elsewhere do bear on it, and they all point the same way:

1. WCAG 3.3.1 — *"the item that is in error is identified"*. With 36 rows, a
   message that does not name its row fails this.
2. M3 dialogs — *"Show all errors on the page at once so people can fix
   everything before trying again."*
   ([source](https://m3.material.io/components/dialogs/guidelines), 2026-07-31)
3. M3 snackbar — *"Only one snackbar may be displayed at a time"* and
   *"Consecutive snackbars must appear one at a time"* and *"Don't stack
   snackbars on top of one another"*.
   ([source](https://m3.material.io/components/snackbar/guidelines), 2026-07-31)
   Six failures cannot become six snackbars.
4. Apple Feedback — *"When status feedback is available near the items it
   describes, people get important information without having to take action or
   leave their current context."*

---

## 4. Snackbar / toast: the stated constraints

All from
[M3 Snackbar guidelines](https://m3.material.io/components/snackbar/guidelines)
and [Snackbar
accessibility](https://m3.material.io/components/snackbar/accessibility), both
fetched 2026-07-31, unless marked.

| Constraint | Verbatim |
|---|---|
| Purpose | "Snackbars inform users of a process that an app has performed or will perform. They appear temporarily, towards the bottom of the screen." |
| Non-interruptive | "They shouldn't interrupt the user experience. People can browse the page content without being required to interact with the snackbar." |
| Priority ceiling | "Snackbars communicate messages that are minimally interruptive and **don't require user action**." |
| One at a time | "Only one snackbar may be displayed at a time." / "Consecutive snackbars must appear one at a time." / "Don't stack snackbars on top of one another" |
| Never the only path | "Snackbars shouldn't be the only way to access a core use case, to make an app usable." |
| Actions | "A snackbar can contain a single action." Snackbars with actions "should remain on the screen until the user takes an action on the snackbar, or dismisses it." |
| Duration | "Snackbars without actions can auto-dismiss after 4–10 seconds, depending on platform. **Avoid using auto-dismissing snackbars on web unless there's also inline feedback.**" |
| No icons | "Avoid adding icons to snackbars. If your message needs an icon, consider using a different component such as a dialog." |
| No links | "Avoid using stylized text or inline links in snackbars; they can add unwanted complexity." |
| Focus | "When a snackbar appears, announce the message but don't move focus." / "Don't trap focus in the snackbar." |

The web-specific requirement is the load-bearing one for a desktop app, and M3
states it twice — once in the guidelines and once in the accessibility page:

> On web, auto-dismissing snackbars are inaccessible for people with low vision
> or who require additional time to perceive information. This can be solved in 2
> ways: **1. Add inline feedback.** Information in auto-dismissing snackbars must
> also be communicated using another accessible method **inline or near the
> action that triggered the snackbar**. […] **2. Make the snackbar actionable.**

**Read plainly: on the web, a snackbar is never sufficient on its own.** Either
it is a duplicate of something already visible inline, or it must not
auto-dismiss.

The [WAI-ARIA APG Alert
pattern](https://www.w3.org/WAI/ARIA/apg/patterns/alert/) (fetched 2026-07-31)
is harder still:

> An alert is an element that displays a brief, important message in a way that
> attracts the user's attention without interrupting the user's task. […] Because
> alerts are intended to provide important and potentially time-sensitive
> information without interfering with the user's ability to continue working, it
> is crucial they do not affect keyboard focus. The Alert Dialog Pattern is
> designed for situations where interrupting work flow is necessary.
>
> **It is also important to avoid designing alerts that disappear
> automatically.** An alert that disappears too quickly can lead to failure to
> meet WCAG 2.0 success criterion 2.2.3.
>
> Another critical design consideration is the frequency of interruption caused
> by alerts. Frequent interruptions inhibit usability for people with visual and
> cognitive disabilities […]

**Apple has no toast concept to constrain.** Nothing in the HIG describes a
transient in-app message overlay. The nearest Apple statement is the
foreground-notification rule
([Notifications](https://developer.apple.com/design/human-interface-guidelines/notifications),
2026-07-31): *"present the information in a way that's discoverable but not
distracting or invasive, such as incrementing a badge or subtly inserting new
data into the current view."* — again pushing it into the view, not over it.

M3 draws a matching line for tooltips
([Tooltips guidelines](https://m3.material.io/components/tooltips/guidelines),
2026-07-31): *"Don't hide critical information within tooltips as it's easy to
miss. Use an interruptive dialog instead."*

---

## 5. Severity levels, and whether colour may carry severity alone

**Colour alone is forbidden by all three sources, unanimously and without
qualification.**

- WCAG 1.4.1 Use of Color, Level A
  ([Understanding](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html),
  2026-07-31): *"Color is not used as the only visual means of conveying
  information, indicating an action, prompting a response, or distinguishing a
  visual element."* Its own worked example is exactly this case: *"Examples of
  information conveyed by color differences: 'required fields are red', **'error
  is shown in red'** […]"*
- Apple [Color](https://developer.apple.com/design/human-interface-guidelines/color)
  (2026-07-31): *"Avoid relying solely on color to differentiate between objects,
  indicate interactivity, or communicate essential information. […] For example,
  you can use text labels or glyph shapes to identify objects or states."*
- Apple [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
  (2026-07-31): *"Convey information with more than color alone. […] Offer visual
  indicators, like distinct shapes or icons, in addition to color."*
- M3 [Text fields
  guidelines](https://m3.material.io/components/text-fields/guidelines)
  (2026-07-31) turns it into a component rule: *"It's **strongly recommended** to
  show an error icon when the text field is in the error state. This highlights
  the error for people with visual impairments, and provides an additional
  sensory indicator."*

**On severity *levels*, the two systems diverge sharply.**

**M3 defines exactly one severity, and it is a colour role, not a message
class.** [Color roles](https://m3.material.io/styles/color/roles) (2026-07-31):
*"There are 26 standard color roles organized into six groups: primary,
secondary, tertiary, **error**, surface, and outline."* The error group has four
roles (Error, On error, Error container, On error container) and is *"an example
of a static color (it doesn't change even in dynamic color schemes)"*. **There is
no warning role, no success role, no info role in M3.** Severity in M3 is carried
by *which component you pick* — snackbar (low) or dialog (high) — not by a colour
band on a shared component.

**Apple defines no severity taxonomy at all.** It defines a delivery ladder
(passive in-context status → alert) and one rationing rule for the strongest
signal, on the [Alerts](https://developer.apple.com/design/human-interface-guidelines/alerts)
page (2026-07-31):

> **Use a caution symbol sparingly.** Using a caution symbol like
> `exclamationmark.triangle` too frequently in your alerts diminishes its
> significance. Use the symbol only when extra attention is really needed, as
> when confirming an action that might result in unexpected loss of data. Don't
> use the symbol for tasks whose only purpose is to overwrite or remove data,
> such as a save or empty trash.

Apple also warns against reusing a colour across meanings
([Color](https://developer.apple.com/design/human-interface-guidelines/color),
2026-07-31): *"Avoid using the same color to mean different things. Use color
consistently throughout your interface, especially when you use it to help
communicate information like status or interactivity."*

**The sources are silent on a three- or four-level info/warning/error/success
scale.** Neither system publishes one. That scale is a convention of web
component libraries, not of either platform's guidelines.

---

## 6. Explicit statements about proximity to the causing action

Four, and they are the most quotable lines in the whole set.

1. **M3, snackbar accessibility on web** (2026-07-31) — *"Information in
   auto-dismissing snackbars must also be communicated using another accessible
   method **inline or near the action that triggered the snackbar**."* The caption
   under the illustration repeats it: *"Also communicate snackbar information near
   the action that triggered the snackbar."*
2. **M3, dialogs** (2026-07-31) — *"Errors about the dialog fields should always
   appear **inline where they occur**."*
3. **Apple, Feedback** (2026-07-31) — *"When status feedback is available **near
   the items it describes**, people get important information without having to
   take action or leave their current context."*
4. **Apple, Alerts** (2026-07-31) — *"If you need to provide only information,
   prefer finding an alternative way to communicate it **within the relevant
   context**."*

WCAG 3.3.3's worked example leans the same way without requiring it
([Understanding SC
3.3.3](https://www.w3.org/WAI/WCAG22/Understanding/error-suggestion.html),
2026-07-31): *"The result of a form that was not successfully submitted describes
an input error **in place in the page** along with the correct input and offers
additional help for the form field that caused the input error."*

---

## What the component APIs force

| API | What it forces |
|---|---|
| SwiftUI [`alert(_:isPresented:actions:)`](https://developer.apple.com/documentation/swiftui/view/alert(_:ispresented:actions:)) (fetched 2026-07-31) | Placement is not a parameter. The signature takes a title, a `Binding<Bool>`, and actions. The system positions it, dismisses it (*"the system sets this value to false and dismisses"*) and *"may reorder the buttons based on their role and prominence"*. You get an interruption or nothing — there is no lower rung in the API. |
| SwiftUI text input | No error API. Nothing in the HIG text-field page points at one, and there is no `errorText` equivalent. Field-error presentation is entirely the app's problem on Apple platforms. |
| [material-web `md-*-text-field`](https://github.com/material-components/material-web/blob/main/docs/components/text-field.md) (fetched 2026-07-31) | `error` (boolean) plus `errorText` (string), documented as *"The error message that **replaces supporting text** when `error` is true."* Also `reportValidity()`, which *"displays the error in the text field's supporting text"*. **The API has no way to render a field error anywhere but under its field.** |
| material-web snackbar | Does not exist. `docs/components/` in the repo holds button, checkbox, chip, dialog, divider, elevation, fab, focus-ring, icon-button, icon, list, menu, progress, radio, ripple, select, slider, switch, tabs, text-field (listed via the GitHub contents API, 2026-07-31). M3's own accessibility page confirms it: *"Note: Material Web doesn't yet include the snackbar component. This guidance still applies to custom-made snackbars."* |
| material-web banner | Does not exist, in the library or the spec. |

---

## Where the sources are silent

State these as unknowns, not as permissions.

- **Per-row errors in a dense table.** Apple's list/table page has no error
  guidance; M3 has no data-table component and its list page has none either.
- **Apple on form-error placement.** Timing only. No statement about where the
  message goes relative to the field.
- **A severity scale.** Neither system publishes info/warning/error/success as a
  message taxonomy. M3 ships one error colour role and no warning role.
- **Multiple simultaneous errors from one action, outside a form.** M3's *"Show
  all errors on the page at once"* is written for dialog fields. Nobody addresses
  a partial batch failure.
- **A persistent, dismissible, non-modal region for a condition that is neither
  transient nor blocking.** M2 had it (Banner); M3 deleted it and named no
  replacement; Apple never had it. This is the exact shape of a "panel could not
  load" message, and it is the one shape no current guideline covers.
- **Desktop density.** M3's placement rules are written against breakpoints and
  FABs. Its full-screen dialog is *"for compact breakpoints only […] For medium
  and expanded breakpoints, use a basic dialog."* Its snackbar placement section
  argues mainly about not covering navigation bars and FABs. A dense desktop table
  is not the case either page is reasoning about.

---

## What each source's rules would pick, for four concrete cases

Applying the rules above — not adding new ones.

**(a) A panel-level read failure (a section cannot load its data).**

- **Apple → inline, inside the panel.** This is the exact case the Alerts page
  answers twice: the Mail server-connection indicator, and *"show cached or
  placeholder data and a nonintrusive label that describes the problem."* Not an
  alert — it is informative, and the failure has a location.
- **M3 → inline, by elimination.** Not a dialog (*"Don't use dialogs for low- or
  medium-priority information"*, and it does not block). Not a snackbar (it is a
  persistent condition, not *"a process that an app has performed"*, and it must
  not auto-dismiss). The component M2 would have used is deleted. M3 names no
  component; its own proximity rule leaves the panel.
- **ARIA → announce via a live region without moving focus** (APG alert
  pattern), while the text stays in the panel.

**(b) A per-row deploy failure in a 36-row table.**

- **Both systems are formally silent.** The applicable rules converge on **the
  failing row, plus at most one summary**: WCAG 3.3.1 requires the item in error
  be identified; M3 forbids stacked or consecutive snackbars, which rules out one
  toast per failed row; M3 says show all errors at once; Apple says status
  feedback belongs near the items it describes.
- **Neither system blesses a single fixed region carrying 36 row identities.**

**(c) A form field validation error.**

- **M3 → under the field, in the supporting-text slot, with an error icon.**
  Stated in the text-fields page, restated in the dialogs page (*"always appear
  inline where they occur"*), and enforced by material-web's `error` /
  `errorText` API.
- **Apple → abstains on location.** It picks the *timing* (on blur for an email
  address, before blur for a username or password) and says nothing else.
- **WCAG → any location, as long as it is text and names the field.** Inline is
  one of three blessed options, not the required one.

**(d) A confirm-and-proceed warning inside a dialog.**

- **Apple → in the alert's own body text.** This is the alert's core use case:
  warn on an uncommon destructive action that cannot be undone, use the
  destructive button style, and reserve the caution symbol for *"an action that
  might result in unexpected loss of data."* The message and the buttons that act
  on it are the same object.
- **M3 → in the dialog's supporting text.** Headlines must *"avoid apologies […]
  alarm ('Warning!'), or ambiguity ('Are you sure?')"*, dialogs hold a maximum of
  two actions, and for extra detail *"an inline expansion can display more
  information"* rather than a third action that navigates away.
- **Neither system routes this to a separate region.** The warning lives where
  the decision is made.
