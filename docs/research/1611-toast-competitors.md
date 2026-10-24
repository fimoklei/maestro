# Success toasts in other design systems (issue #1611)

Gathered 2026-10-24 from primary docs. Quotes are short and exact unless marked *paraphrase*. "Unverified" means only a search snippet or secondary source supported it.

## GitHub Primer

Sources: https://primer.style/accessibility/toasts/ , https://primer.style/product/ui-patterns/notification-messaging/

- **Stance:** toasts "pose significant accessibility concerns and are not recommended for use". GitHub recommends "other more established, effective, and accessible ways of communicating with users".
- **WCAG risks named:** 2.2.1 Timing Adjustable, 1.3.2 Meaningful Sequence (toast sits at DOM start/end, far from the trigger), 2.1.1 Keyboard, 4.1.3 Status Messages; secondary 1.4.4, 1.4.10, 2.4.3, 3.2.4.
- **Usability risks (paraphrase):** off-view on large screens, missed when distracted or tab-switching, covers content, outside a magnified view, gone when it auto-dismisses, far from the related content, Esc dismisses the wrong thing.
- **Simple success:** no extra confirmation; the result should be self-evident, e.g. the new issue appears in the list. *Paraphrase:* adding a toast there may reduce trust.
- **Complex success:** a persistent banner that summarises what was done, or show results progressively.
- **Notification-messaging page:** use success messaging "sparingly"; if success is evident on the page, add nothing; if not evident and the user stays on the page, show an InlineMessage near the save/submit button; if the action navigates and the URL change does not make success clear, show a Banner. For a dialog: show the message inside the dialog (Banner at the top of the dialog) instead of closing it.
- **Accessibility:** when success is evident visually, the state must still reach screen-reader users. "Always announce the results of unsuccessful user actions"; other changes case by case. Banners and dialogs persist; they do not auto-dismiss.
- **Data points:** none (no toast component recommended). An older page, https://primer.style/ui-patterns/messaging , still documented toasts that "should not receive focus" (seen via search snippet only: unverified that it is current).

## Atlassian Design System (flags)

Sources: https://atlassian.design/components/flag/usage , https://atlassian.design/components/flag/auto-dismiss-flag/examples , https://atlassian.design/components/flag/examples , https://atlassian.design/foundations/content/designing-messages/success-messages

- **Data points:** icon or avatar, title ("The title should always summarize the reason for the flag"), optional message (scrolls after 5 lines), up to two action links, dismiss X (default flags only), auto-dismiss variant. Position bottom left, newest on top, shown above an open modal.
- **Duration:** auto-dismiss flag is "dismissed automatically after eight seconds". Only for info and success. "Never set warning flags to auto dismiss"; same for errors. Many people cannot read and select a link within eight seconds: if the link matters, use a regular (persistent) flag.
- **Content:** success confirms the outcome and lets people continue. "If someone has created something give them an opportunity to view it." Titles 3-4 words, sentence case, no period; avoid "Success!" and "successfully". Messages 1-2 sentences. Frequent actions: brief. Example tone: "you've closed the ticket"; a deletion example points to recovery ("ask your space admin to restore the page").
- **When to use:** flag for confirmations and acknowledgments needing minimal interaction; banner for critical loss of data or function; inline message when information or action is needed in place; modal for critical, immediate action. Long content: link out or use banner/inline/modal.
- **Accessibility:** h2 title; don't mix dismissible and non-dismissible flags in one stack; auto-dismissing flags can disappear before people see them; never auto-dismiss critical warnings/errors; not color alone.

## Material Design 3 (snackbar)

Source: https://m3.material.io/components/snackbar/guidelines (read in browser; the page is client-rendered)

- **Data points:** container, supporting text, optional single action, optional close button. No icons ("Avoid adding icons to snackbars"). No inline links or styled text.
- **Content:** "Text labels are short, clear updates on processes that have been performed". One line where possible; two on mobile; desktop aims for one line (ideal line 40-60 characters).
- **Frequency/stacking:** "Only one snackbar may be displayed at a time." "Don't stack snackbars". A snackbar with updated information can replace an outdated one.
- **Duration:** "Snackbars without actions can auto-dismiss after 4–10 seconds". Snackbars with actions stay until acted on or dismissed.
- **Web accessibility (key rule):** "auto-dismissing snackbars are inaccessible for people with low vision". Fix 1: the same information "must also be communicated using another accessible method inline or near the action". Example: change the "Save" label to "Saved" and show the snackbar too. Fix 2: make it actionable so it does not auto-dismiss. "Avoid using auto-dismissing snackbars on web unless there's also inline feedback."
- **Action:** "To allow users to amend choices, display an "Undo" action". Snackbars "shouldn't be the only way to access a core use case".
- **When to use:** low priority, user action optional; dialog for high priority / required action.
- **Placement:** bottom, in front of content; never fully cover the focused element.

## Shopify Polaris (toast, now deprecated) and App Bridge Toast API

Sources: https://github.com/Shopify/polaris/blob/main/polaris.shopify.com/content/components/deprecated/toast.mdx (raw file read), https://shopify.dev/docs/api/app-home/apis/toast

- **Status:** Polaris React Toast is deprecated in favor of App Bridge `shopify.toast.show()`.
- **Data points:** message, optional action (+ onAction), duration, isError, dismiss icon (built in), onDismiss.
- **Duration:** default 5,000 ms; toasts with an action at least 10,000 ms "for accessibility".
- **Content:** "three words or fewer"; "short and affirmative"; noun + verb: "Product updated", "Collection added". Avoid "We were unable to save the customer".
- **Action:** only if the same action exists elsewhere on the page (Undo, Retry). Single verb label. No Cancel/OK.
- **When to use:** mainly success; rarely errors (non-critical, not merchant-caused, e.g. connection). Banner for persistent errors and for conditions needing attention in page context. App Bridge use cases: success after save/create/update; Undo after destructive actions; a shortcut to view a result.
- **Accessibility:** live region `aria-live="assertive"`. Not for critical information: they disappear, are hard to reach by keyboard, "may appear away from the user's focus". Ensure a toast's action can be done another way.

## IBM Carbon (notifications)

Sources: https://carbondesignsystem.com/components/notification/usage/ , https://carbondesignsystem.com/patterns/notification-pattern/

- **Variants:** inline, toast, actionable, callout (plus modal in the pattern).
- **Toast data points:** icon, title, body, close button, optional timestamp (all or none), actionable variant with one tertiary button.
- **Duration:** toasts persist by default; can be set to "dismiss automatically after five seconds". If auto-dismissed, the information must be reachable elsewhere. Actionable notifications persist until dismissed.
- **Content:** title short, no period; body 1-2 short sentences, don't repeat the title; toast max two lines (pattern page says three); action label 1-2 words; one action per notification.
- **When to use:** inline for status near the related item, does not auto-dismiss; toast is best for "system-generated messages that do not correspond to a specific section of the UI"; toasts are "more disruptive than inline notifications"; task-generated notifications "should be placed in the region of the page the user is working in". Banner for product/system level. Modal only when critical.
- **Accessibility:** "Don't use notifications that dismiss on a timer for critical or emergency messages." Actionable notifications take focus and "can be highly disruptive". Esc closes. ARIA roles not specified.

## Adobe Spectrum (toast)

Sources: https://react-spectrum.adobe.com/Toast , https://react-spectrum.adobe.com/react-spectrum/Toast.html , https://opensource.adobe.com/spectrum-design-data/components/toast . The design page spectrum.adobe.com/page/toast returned 404.

- **Data points:** text, variant (neutral, positive/informative, negative, info), optional action button (actionLabel/onAction, shouldCloseOnAction), close, timeout, placement (default bottom center; top, top end, bottom, bottom end), queue (newest at the bottom of the stack).
- **Duration:** "toasts have a minimum timeout of 5 seconds, and actionable toasts will not auto dismiss." Timers pause on focus or hover. Design data: `isAutoDismissible` default false. Auto-dismiss only when the information is not important.
- **Design-page guidance (unverified, search snippet only):** if an actionable toast auto-dismisses, its action must also be reachable elsewhere.
- **Accessibility:** landmark region labeled "Notifications"; F6 / Shift+F6 move focus into it; focus restored after the last toast closes. Use toasts sparingly.
- **Content rules:** none found.

## Microsoft Fluent 2 (toast)

Source: https://fluent2.microsoft.design/components/web/react/core/toast/usage (accessibility subpage 404)

- **Types:** confirmation (direct result of the user's action), progress, communication (others' actions).
- **Data points:** title, optional body, close, action buttons/links, spinner or progress bar, status text ("X of X [unit]", "X% complete"), intent (sets icon, role, aria-live).
- **Duration:** timed toast "will time out after seven seconds" when there's no action; hover pauses. Conditional (until condition met). Close only if content is findable elsewhere.
- **Stacking:** "Don't show more than four toasts in a toaster." Combine similar in-progress operations into one toast.
- **Position:** consistent, "usually the top-right or bottom-right".
- **Content:** passive voice title: "File saved"; progress: "Uploading file". Sentence case, no final period. Body about 60 characters. Buttons 1-2 words, max 36 characters.
- **When:** "useful and relevant, but not critical". Not for necessary actions; critical → Dialog, field error, message bar.
- **Accessibility:** all intents except info use assertive aria-live; avoid overloading with assertive toasts; toasts without actions get no keyboard focus.

## Apple HIG

Source: https://developer.apple.com/design/human-interface-guidelines/feedback

- No toast component. Principles: match feedback to significance. "Consider integrating status feedback into your interface" near the items it describes. Confirm completion only for significant actions: "people typically expect their action or task to succeed, they only need to know when it doesn't." Don't warn when data loss is the expected result (Finder deleting a file). Use several channels (color, text, sound, haptics).

## GOV.UK Design System (notification banner)

Source: https://design-system.service.gov.uk/components/notification-banner/

- **Use:** outcome "of something they've just done on a previous page"; green success version to "confirm that something they're expecting to happen has happened". Not in linear services (use a confirmation page). Remove it when the user moves on.
- **Content:** heading such as "Success" for consistent identification; example "Training outcome recorded and trainee withdrawn" (names what happened).
- **Not for:** validation errors; information directly relevant to the page task (use inset/warning text). Max one banner per page. Use sparingly; people miss them.
- **Placement:** immediately before the page h1 (in-page, persistent, not floating, not timed).
- **Accessibility:** success banner gets `role="alert"` and focus moves to it on page load.

## SAP Fiori (message toast; added as a strong bulk-action source)

Sources: https://www.sap.com/design-system/fiori-design-web/v1-148/ui-elements/message-toast , https://www.sap.com/design-system/fiori-design-web/v1-148/foundations/best-practices/global-patterns/messaging/processing-multiple-items

- **Use:** short success message, no interruption. Don't use for errors/warnings, when the user must read it before leaving the page, or when they must copy content (IDs): use a success message box.
- **Navigation:** "always navigate first, and then show the message toast on the target page."
- **Data points:** text + container only. Duration standard 3,000 ms, never less. Users can hold it with Ctrl/Cmd+Shift+M. Bottom center.
- **Content patterns:** `[object] [action taken]` "Sales order created"; name needed: `[name] [action taken]`; multiple: `[item count] [objects] [action taken]` "2 sales orders were deleted."; mixed: "2 products added, 3 products removed". "Do not list names of multiple items." No "successfully". Frequent actions: as brief as possible ("Order deleted").
- **Bulk:** all succeeded → toast `<number of items> <item name> were <action>.`; none processed → message view in a dialog; partial success → dialog summary `<n> of <total> <item name> were <action>` plus per-item messages. Keep the items selected after the action.

## Sonner

Sources: https://sonner.emilkowal.ski/toast , https://sonner.emilkowal.ski/toaster , https://github.com/emilkowalski/sonner/blob/main/src/index.tsx

- **Data points:** title (first arg), description, icon, action, cancel, closeButton (default false), duration (default 4000 ms), dismissible (default true), id (update/replace in place), promise (loading → success/error), onDismiss, onAutoClose, richColors, position (default bottom-right), visibleToasts (default 3), expand (false), hotkey alt+T.
- **Accessibility (source):** section `aria-live="polite"`, `aria-atomic="false"`, `aria-relevant="additions text"`; timer pauses when expanded (hover), during pointer interaction, and when the document is hidden; close button label "Close toast"; container label "Notifications". No content guidance.

## Radix Toast

Source: https://www.radix-ui.com/primitives/docs/components/toast

- **Data points:** Title (optional), Description, Action (requires `altText`), Close; duration default 5000; swipe to dismiss; type foreground/background.
- **Timing:** pauses on hover, focus and window blur.
- **Accessibility:** foreground "announced immediately"; background "at the next graceful opportunity". Avoid stacking several foreground toasts. Action must be "safe to ignore"; `altText` describes an alternative way to do it; if a response is required use an AlertDialog. F8 focuses the viewport.

## Developer products

- **Vercel Geist** (https://vercel.com/geist/toast): non-blocking confirmation of user-initiated actions. `{Noun} {past participle}`: "Domain added", "Blob deleted"; never "successfully"; no trailing period; match the destructive button verb ("Delete Project" → "Project deleted"). Undo: exactly "Undo", 5-10 s, only when rollback is safe. For failures the user must act on: "Pair a short toast with a persistent row" showing the recovery step (*paraphrase of the page*). One toast per async flow, at the final step. `aria-live="polite"`; assertive only for blocking errors. `preserve: true` keeps it until dismissed.
- **Linear** (https://linear.app/changelog/undo-actions): undo via Cmd+Z or command menu, including batch operations ("modifying hundreds of issues"); after undo it returns to the page and selects the affected items. No toast behaviour documented publicly (unverified beyond this).
- **GitHub.com:** follows Primer (above); no separate public doc found.
- **GNOME HIG** (https://developer.gnome.org/hig/patterns/feedback/toasts.html): toasts suit "individual events, as opposed to ongoing states"; common use: "an undo button after a destructive action"; short title; a button only when "directly relevant".

## WCAG 2.2 and WAI-ARIA

- **SC 2.2.1 Timing Adjustable** (https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html): any automatic timed process is a time limit. Content on a timer "does not need to be time adjustable if there is an alternative that does not rely on a timer". The Understanding doc's example: an email toast that vanishes after 5 s passes because the Inbox shows the same news. Without such an alternative, "each message would need to meet this success criterion".
- **SC 4.1.3 Status Messages** (https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html): a status message reports success/results of an action without a change of context and must be announced without taking focus. "Your form was successfully submitted." is an example; ARIA22 (role=status) and G199 (success feedback). Search results themselves are not status messages; "18 results returned" is.
- **APG Alert** (https://www.w3.org/WAI/ARIA/apg/patterns/alert/): alerts "do not affect keyboard focus"; "avoid designing alerts that disappear automatically" (cites 2.2.3); frequent interruptions hurt usability (2.2.4).
- **role=status** (MDN, https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/status_role): implicit `aria-live="polite"` and `aria-atomic="true"`; "Do not give focus to the status".

## Comparison table

Legend: Y = supported/recommended, N = not supported or advised against, opt = optional, – = not covered.

| Data point | Primer | Atlassian | M3 | Polaris/App Bridge | Carbon | Spectrum | Fluent 2 | GOV.UK | SAP Fiori | Sonner | Radix | Geist |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Title | – (no toast) | Y | N (one text label) | N (one message) | Y | N (text) | Y | Y heading "Success" | N (text) | Y | opt | N (text) |
| Description/body | – | opt, ≤5 lines | – | – | Y, 1-2 sentences | – | opt, ~60 chars | Y | – | opt | Y | – |
| Subject name | – | – | – | noun+verb | – | – | "File saved" | Y (example names it) | single item: name only if needed; never list multiple names | – | – | `{Noun} {past participle}` |
| Count | – | – | – | – | – | – | progress "X of X [unit]" | – | `[n] [objects] [action]` | – | – | – |
| Icon/status | – | Y | N ("Avoid adding icons") | isError | Y | variant | intent | colour + heading | N | opt | – | method |
| Action (Undo/View) | – | ≤2 links; View after create | 1, Undo | 1 (must exist elsewhere) | 1 (actionable) | 1 | 1-2 buttons | – | N (use message box) | action + cancel | Action + altText | Undo only |
| Dismiss control | – | default flags only | opt | built-in X | Y | Y | only if findable elsewhere | – | – | opt (default off) | Y | Y |
| Default duration | n/a (persist) | 8 s (auto-dismiss variant) | 4-10 s, none with action | 5 s; ≥10 s with action | persist; opt 5 s | ≥5 s; none with action | 7 s | persistent until next page | 3 s minimum | 4 s | 5 s | 5-10 s for Undo |
| Persistent option | banners | Y (default flag) | with action | – | default | default off auto-dismiss | conditional | Y | auto-close off | duration Infinity | – | `preserve` |
| Pause on hover/focus | – | – | – | – | – | Y | hover | n/a | hotkey to hold | hover, pointer, hidden tab | hover, focus, blur | – |
| Stack limit | – | stack, newest on top | 1 | – | – | queue | 4 | 1 per page | – | 3 visible | avoid stacking | 1 per flow |
| Position | in page | bottom left | bottom | bottom | top | bottom center | top/bottom right | before h1 | bottom center | bottom right | – | – |
| Progress | – | loading flag | – | – | – | – | spinner/bar | – | – | promise | – | – |
| Live region | announce | h2 title | auto (Android) | assertive | – | landmark, F6 | assertive (except info) | role=alert + focus | no focus | polite | foreground/background | polite |

## Patterns that recur across sources

1. **A timed toast must not be the only record.** M3 (web: inline feedback too, "Saved" button label), Carbon (information reachable elsewhere), Fluent (close only if findable elsewhere), Polaris and Radix (action must exist elsewhere), Geist (pair with a persistent row), WCAG 2.2.1 Understanding (timer is fine when an alternative exists, e.g. the Inbox). This is the strongest and most-repeated rule.
2. **Visible result → little or no extra message.** Primer (self-evident result, no toast), Apple (people expect success; confirm only significant actions), M3's inline-first web rule. The result itself is the feedback; the announcement for screen readers still has to happen (Primer, WCAG 4.1.3).
3. **Short past-tense object + verb, no "successfully", no period.** Polaris "Product updated", Fluent "File saved", Geist "Domain added", SAP "Sales order created", Atlassian (no "successfully", no period in titles), Carbon (title no period).
4. **One action at most, and Undo is the canonical one** (M3, Polaris, GNOME, Geist, App Bridge). An action toast stays longer or until dismissed (M3, Spectrum, Polaris ≥10 s, Atlassian: use a persistent flag if the link matters).
5. **Never a toast for errors needing action, critical info, or required decisions.** Atlassian, Carbon, Fluent, Polaris, SAP, Radix, Geist, M3.
6. **Duration floor around 4-5 s, pause on hover/focus** (Sonner 4 s, Radix 5 s, Spectrum ≥5 s, Polaris 5 s, Carbon 5 s, Fluent 7 s, Atlassian 8 s, SAP ≥3 s).
7. **Result on another screen → message lands on the target screen.** SAP (navigate first, then toast), GOV.UK (banner on the next page), Primer (banner if the URL change doesn't make success clear).
8. **Bulk = one message with a count, not a list of names.** SAP is the only source with explicit rules: `[n] [objects] [action]`, "Do not list names of multiple items", partial success goes to a dialog summary. Fluent: combine similar operations into one toast; Geist: one toast per flow.

## Where sources disagree

- **Toasts at all:** Primer says not recommended; everyone else ships one. GOV.UK uses an in-page banner instead of a floating toast.
- **Politeness:** Polaris and Fluent use assertive for success; Sonner, Geist, ARIA `role=status` use polite. APG/MDN favor polite for advisory info.
- **Default persistence:** Carbon persists by default and Spectrum's design data defaults auto-dismiss off; Sonner, Radix, Polaris, Atlassian (auto-dismiss variant), SAP, Fluent auto-dismiss by default.
- **Duration:** 3 s (SAP minimum) to 10 s (M3 maximum); actionable toasts: no timeout (M3, Spectrum) vs ≥10 s (Polaris) vs 5-10 s (Geist Undo) vs use a persistent flag (Atlassian).
- **Title + body vs single line:** Atlassian, Carbon, Fluent use title + body; M3, Polaris, SAP, Geist use one text label.
- **Icons:** M3 says avoid icons; Atlassian, Carbon, Fluent use status icons.
- **Naming the object:** SAP says name it only when needed and never list multiple names; Geist and Polaris lead with the noun; Atlassian/GOV.UK examples name the thing. Nobody gives a rule on quoting a user-chosen name versus a type.
- **Tense/voice:** passive past participle (Fluent, Geist, Polaris, SAP) vs present perfect second person (Atlassian "you've closed the ticket", GOV.UK).
- **Dialog results:** Primer keeps feedback inside the dialog (banner at the top) instead of closing it; SAP and others imply close then toast. Spectrum/Polaris note toasts must be announced while a modal is open.

## Gaps (not found in any primary source)

- An explicit rule for "a removed row": only Apple (don't warn on expected deletion) and Undo-after-destructive-action guidance (M3, GNOME, Geist, App Bridge) touch it. No source states whether a vanished row counts as a visible result.
- Pluralisation rules for counts ("1 skill removed" vs "3 skills removed") beyond SAP's template.
