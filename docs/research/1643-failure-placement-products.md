# Where comparable products place a failure (issue #1643)

Serves [#1643](https://github.com/fimoklei/maestro/issues/1643). Extends
`465-notice-placement-apple-google.md` (Apple, Material 3, W3C) to six products
the operator knows. Purpose: test the placement table in
`.claude/rules/design.md` → **Feedback and dialogs** against how these
products state a failure. §5 is the only part that asks for a decision.

## 1. Method

| Product | What was read | How |
|---|---|---|
| GitHub | Primer: notification messaging, forms, saving, degraded experiences, Banner guidelines and accessibility | `curl`, text extracted |
| Vercel | Geist: Error, Modal, Note, Input, Toast; docs on a failed build | `curl`, text extracted |
| VS Code | UX guidelines (notifications); `vscode.d.ts`; `inputBox.ts`, `dialog.ts` on `main` | `curl` of the page and raw source |
| Raycast | `developers.raycast.com/llms-full.txt` (the API reference, best practices and debugging pages in one file); `raycast/utils` `showFailureToast.ts` | `curl` |
| Docker Desktop | Troubleshoot and diagnose; troubleshooting topics; Extensions SDK dashboard API | `curl`, text extracted |
| Linear | `linear.app/docs`, `/method`, `/changelog` | WebFetch (summarised) |

Documentation and source only; no product was opened live. Quotes were matched
against the raw page text, except Linear, whose lines came back through a
summarising fetch and are marked *paraphrase*. "Not found" means the sources
read do not say it, not that the product lacks it.

Each cell gives placement, then facts (cause, object, next step, code), then
the action and focus.

## 2. Findings, per product

### GitHub (Primer)

Read 2026-10-25: [notification messaging](https://primer.style/product/ui-patterns/notification-messaging/) (NM),
[forms](https://primer.style/product/ui-patterns/forms/) (F),
[saving](https://primer.style/product/ui-patterns/saving/) (S),
[degraded experiences](https://primer.style/product/ui-patterns/degraded-experiences/) (DE),
[Banner accessibility](https://primer.style/product/components/banner/accessibility/) (BA).

- **Dialog.** The dialog stays open: "Prioritize showing messaging inside the
  Dialog after an action rather than closing the Dialog". A Banner "at the top
  of the dialog", "below the Dialog header" (NM). Facts: "Include guidance to
  correct the error" (NM). Action: a critical Banner takes at most two, one
  recommended. Focus: not stated for a dialog.
- **Form.** An inline message per field, tied with `aria-describedby`. With
  three or more errors: "In a Banner at the top of the form, list the invalid
  inputs as anchor links." Data a field could not load: "show an error message
  below those fields" (F). Facts: the message "should explain why the value is
  invalid"; the caption is not repeated (F). After a failed save, "the user's
  data should be preserved in the form" (S). Focus: "the first invalid input
  should be focused"; with a summary, "When the Banner appears, it should be
  focused" (F).
- **Screen.** A message about a page or section: "place it at the top of the
  body content" (NM). Main content cannot load: "show an error page instead";
  "Never suppress rendering of the global navigation header" (DE). Facts:
  "Don't try to conceal or downplay that something is wrong" (DE); no code.
  Focus: "If a user is blocked from proceeding if they miss the Banner, moving
  focus is usually preferred" (BA).

### Vercel (Geist)

Read 2026-10-25: [Error](https://vercel.com/geist/error) (E),
[Modal](https://vercel.com/geist/modal) (M), [Note](https://vercel.com/geist/note) (N),
[Input](https://vercel.com/geist/input) (I), [Toast](https://vercel.com/geist/toast) (T),
[troubleshoot a build](https://vercel.com/docs/deployments/troubleshoot-a-build) (B).

- **Dialog.** Placement: not stated. Facts: the general rules under Screen.
  Focus: "After an error inside the Modal, keep focus inside so the user can
  retry" (M).
- **Form.** An `error` prop on the Input; its position: not stated. Facts:
  "Validation names the field and the constraint, ends in a period" (I). A
  Note is "inline contextual feedback next to the field, card, or section it
  describes" (N). Action and focus: not stated.
- **Screen.** "Use the Error component as a block surface when a section or
  page-level resource failed to load: a panel, a dashboard card, a route
  boundary" (E): the block sits where the content failed. A failed build shows
  an error status on the deployment row and a summary on its page (B). Facts:
  "State what happened and what to do next, in that order"; "Always pair
  platform or system errors with a stable identifier (request ID …)" (E).
  Action: a full-page error returns focus to `Try Again` (E); a failed build
  offers **Redeploy** (B). A toast is not enough: "Don't use a toast alone for
  billing failures, permission denials, or build failures the user has to
  triage" (T).

### VS Code

Read 2026-10-25: [notifications](https://code.visualstudio.com/api/ux-guidelines/notifications) (UX),
[`vscode.d.ts`](https://github.com/microsoft/vscode/blob/main/src/vscode-dts/vscode.d.ts) (D),
[`inputBox.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/base/browser/ui/inputbox/inputBox.ts) (IB),
[`dialog.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/base/browser/ui/dialog/dialog.ts) (DL).

- **Dialog.** The error is itself a modal dialog (`showErrorMessage` with
  `modal: true`): message, a less prominent `detail` ("detail is only shown for
  modal messages", D), then a separate button row (DL). Cause, object, code:
  not specified. Focus returns to the previous element on close (DL).
- **Form.** A box anchored to the input (`getAnchor: () => this.element`,
  `AnchorAlignment.RIGHT`), announced as "Error: {0}" (IB). With an error,
  "the user will not be able to accept" the input (D). Focus stays in the
  input; no action.
- **Screen.** A notification "surfaced from the bottom right of VS Code"; the
  page shows "a failure notification with an action to resolve the issue" and
  lists "Show actions if there aren't any" under Don't (UX). A view's
  `TreeView.message` is "rendered in the view" (D); position not documented.
  Focus: not found.

### Raycast

Read 2026-10-25: [`llms-full.txt`](https://developers.raycast.com/llms-full.txt) (R),
[`showFailureToast.ts`](https://github.com/raycast/utils/blob/main/src/showFailureToast.ts) (FT).

- **Dialog.** `Alert` has a title and a message; no error use is documented (R).
- **Form.** "If the `error` is present, the Form Item will be highlighted with
  red border and will show an error message on the right." With any error,
  "the Action.SubmitForm onSubmit callback won't be triggered" (R). Facts and
  focus: not stated.
- **Screen.** "All unhandled exceptions and Promise rejections are shown with
  an error overlay"; "In production, only the error message is shown" (R).
  Expected failures go to a toast: "You should aim not to disrupt the user's
  flow just because something went wrong" (R). Facts: the toast title defaults
  to `"Something went wrong"`, the error's message sits below (FT); the docs'
  example names the action: "Could not run AppleScript" (R). Action: `Copy
  Logs` or `Report Error` (FT); data hooks default to "a generic failure toast
  with an action to retry"; error screens gained an action "to open a bug
  report" (R). Focus: not found.

### Docker Desktop

Read 2026-10-25: [troubleshoot](https://docs.docker.com/desktop/troubleshoot-and-support/troubleshoot/) (TS),
[topics](https://docs.docker.com/desktop/troubleshoot-and-support/troubleshoot/topics/) (TP),
[dashboard API](https://docs.docker.com/extensions/extensions-sdk/dev/api/dashboard/) (DA).

- **Dialog.** A native dialog titled, for example, "Docker Desktop -
  Unexpected WSL error", "mentioning the error code" (TP). Cause and fix live
  in the docs, not the dialog. Placement inside it, action and focus: not
  found.
- **Form.** Not found.
- **Screen.** Placement: not found. Action and fact: "When an error message
  appears, select **Gather diagnostics** […] Docker Desktop prints a
  diagnostic ID. Copy this ID." (TS). Extensions get only
  `toast.error(message)`, with no title, action or code (DA). Focus: not found.

### Linear

Read 2026-10-25: [get the app](https://linear.app/docs/get-the-app),
[changelog](https://linear.app/changelog).

Linear publishes no error guidance; dialog and form are not found. The one
documented failure state is sync: "Syncing" appears "next to the workspace
name at the top of your sidebar", with a count of waiting changes; no action.
The changelog shows a direction, not a placement (*paraphrase*): a failed
create keeps the draft (2026-10-22); boards show an error instead of an empty
state when too many issues match (2026-07-30); setup names a blocking IP allow
list instead of a generic error (2026-07-20).

## 3. Across the six

| | Dialog failure | Field failure | Screen failure |
|---|---|---|---|
| GitHub | In the dialog, top of content | At the field; summary Banner at form top for 3+ | Top of body content; error page in place |
| Vercel | In the modal; place not stated | At the field; place not stated | Error block where the content failed |
| VS Code | The error is the dialog | Box anchored to the input | Notification, bottom right |
| Raycast | Not used for errors | Right of the field | Toast; overlay for an unhandled error |
| Docker Desktop | Native error dialog | Not found | Not found |
| Linear | Not found | Not found | Label in the sidebar (sync only) |

What recurs:

1. **A failed dialog stays open with the failure inside it** (GitHub, Vercel).
   No product closes the dialog and reports the failure elsewhere.
2. **A field failure sits at its field and blocks submit** (GitHub, Raycast,
   VS Code). No product states "under the field"; Raycast and VS Code put it
   beside the field.
3. **A screen failure heads or replaces the content it is about**, and the
   frame stays (GitHub's navigation rule, Vercel's block at the failed panel).
4. **A system failure carries an identifier** in Vercel (request ID), Docker
   (diagnostic ID, error code) and Raycast (logs). GitHub and VS Code name none.
5. **Focus moves to a blocking failure** in GitHub (Banner, first invalid
   field) and Vercel (stays in the modal; `Try Again` on a page error).

## 4. Compared with #465 and the placement table

**#465.** No product uses one fixed failure region, as #465 found for Apple
and Material 3. The products add a dialog rule #465 lacked: Material 3 says a
general error should "appear in a basic dialog when the confirming action
fails" without saying whether that is the open dialog; GitHub and Vercel keep
the open dialog and put the failure in it. For a field, Material 3 puts the
error in the supporting-text slot under the field (#465 §2); that remains the
only source for "under".

**The placement table.** The products agree with every failure row on the
region: the dialog, the field, the top of the content. They differ on one
position. GitHub puts a dialog's failure at the *top* of the content; the
table puts it *above the footer*. No other product states a dialog position.
The table's choice applies its own rule "after its cause" (the action that
failed sits in the footer); that is this note's reading, not a source.

**The Failures rules.** "Never move focus to a notice when it appears"
differs from GitHub and Vercel (§3 point 5). This rule sits outside the
placement table and outside this ticket.

## 5. Recommendation, per placement-table row

| Row | Recommendation |
|---|---|
| Failure or warning about one control, row or region → after its cause; in a dialog above the footer; in the detail pane after the facts | **Keep.** GitHub and Vercel keep the failure in the dialog; only GitHub states a position (top), with no reason given. "Above the footer" keeps it beside the action that failed. |
| Screen-wide failure → top of the panel content | **Keep.** Matches GitHub ("top of the body content") and Vercel's block at the failed region. |
| Field hint → between label and field | **Keep.** No finding bears on it. |
| Field error → under the field | **Keep.** Every product that states it puts the error at the field. "Under" rests on Material 3 (#465); neither Raycast nor VS Code gives a reason for its side position. |
| Information → in the region it describes | **Keep.** Matches Vercel's Note, "next to the field, card, or section it describes". |
| Status of data → the row | **Keep.** No finding bears on it. |
| Busy → the pressed button, the row's ⋮ icon, or the re-read control | **Keep.** No finding bears on it. |
| Success in view → the row | **Keep.** No finding bears on it; success forms are #1611. |
| Success not in view → toast, success only | **Keep.** No finding bears on success. On failures the products agree with "success only": Vercel forbids a toast alone for a failure to triage. |
| Confirmation → dialog, 480px | **Keep.** No finding bears on it. |
| Outcome of a run in a dialog → Report, dialog stays open | **Keep.** Matches GitHub and Vercel keeping a failed dialog open. |

## 6. Not verified

- Linear: every changelog line (summarised fetch).
- Vercel: where a toast and a Modal error sit on screen.
- Docker Desktop: error dialog buttons, the Dashboard's failed-load view, any
  field validation.
- Raycast: toast position on screen, focus after any failure,
  `manual.raycast.com` (not read).
- VS Code: where `TreeView.message` renders in a view.
- Primer: the Dialog and InlineMessage component pages (not read).
