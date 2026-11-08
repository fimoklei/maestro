# Do Vercel, Linear and Circle fold a group of rows inside a list, and how?

Serves [#1815](https://github.com/fimoklei/maestro/issues/1815), the design
gate of [#1811](https://github.com/fimoklei/maestro/issues/1811) § Fold.
Its findings shape [#1820](https://github.com/fimoklei/maestro/issues/1820).

## Method

Read 2026-11-08 in the operator's logged-in Chrome profile at 1470px wide.
Measures come from `getBoundingClientRect`, computed styles and DOM
attributes; screenshots confirmed what shows. Only display state changed: one
Linear group was closed and opened again, one Vercel section opened and closed
again. Nothing was created, edited or saved.

## Findings

| Product | Folded group inside a list? | Where |
|---|---|---|
| **Linear** | **Yes** | Team issue list, grouped by status (`Todo 4`, `Backlog 1`) |
| **Vercel** | No | Nearest: the deployment page's stacked sections; the Usage card's clipped list |
| **Circle** | Not measured | `app.circle.so` and `app.circleci.com` both showed a sign-in page; the profile is not logged in to either |

### Linear: status group in the issue list

- **Same list.** The group header and its issue rows are siblings in one
  container (`data-list-row`, keys `GROUP_…` then `ITEM_…`). Neither has a
  list role. Closing a group removes its rows from the DOM; the header stays.
- **Row height.** Header 36px; issue row 44px. The header has a grey
  background with rounded corners.
- **Toggle place.** A 20×20px chevron at the row's leading edge, 16px in.
  Then the status icon (14px), then the title at 66px from the edge.
- **Toggle in the Tab order.** Yes, but only the chevron: a `div` with
  `role="button"` and `tabindex="0"`. The rest of the header is not a button.
- **Accessible name.** `Collapse group`, named by action. The name does not
  change when the group is closed. No `aria-expanded`; open state sits in
  `data-open` only, so a screen reader hears no state.
- **Count.** Beside the title, about 8px after it: `4` in Inter 13px
  regular, muted ink. The title is Inter 13px medium. The count is a `button`
  with `tabindex="-1"`, out of the Tab order.
- **Other controls.** A 24px `Create new issue` button at the trailing edge.

### Vercel: no folded group of rows

- **Deployment page sections** (`Build Logs`, `Deployment Summary`,
  `Deployment Checks`, `Assigning Custom Domains`) stack as 56–57px
  disclosure rows. Each opens a panel of content (logs, settings), not rows
  of the same list. The trigger is a `div` with `aria-expanded` but no role
  and `tabindex="-1"`: out of the Tab order. Only the warning count inside
  it is a focusable button, named `1 build warnings`. `Deployment Settings`
  is a real `button` (`tabindex="0"`, `aria-expanded`), its name the visible
  text plus a `2 Recommendations` badge. Chevron 16px at the leading edge.
- **Usage card.** A `ul` of ten 32px rows clipped to a 180px card. An
  icon-only 24px button outside the list, `Show More Usage`, leads to the
  Usage page. No count, no `aria-expanded`, nothing folds in place.
- **Domains fact.** `paint-buddy.vercel.app +1`: the `+1` is plain text, not
  focusable.

## Reading

- One product of three has the pattern: Linear. The gate is met; #1820 can
  build the fold.
- **What #1820 copies from Linear:**
  - The group header is an item of the same list as its rows, and its rows
    leave the list while closed. Linear's header leads its rows; Maestro's
    group is the list's last item, after the rows that need work.
  - The chevron sits in the leading slot, before the title.
  - The title, then the count right after it in the body font, regular
    weight, muted ink. Not mono, not a badge.
- **What #1820 does not copy, as #1811 already decides:**
  - Linear's header is taller than its rows (36 vs 44px, a different shape);
    Maestro keeps the 32px sub-list row.
  - Linear makes only the 20px chevron a button, named by action
    (`Collapse group`) with no `aria-expanded`. #1811 makes the whole row one
    button named `Up to date, 11` with `aria-expanded`, which meets the
    accessible-label rule in `.claude/rules/design.md`.
  - Linear's count is a separate, unfocusable button; in Maestro it is part
    of the one button's name.
  - Linear's rows are flat siblings of the header with no list role; #1811
    nests the folded rows in a list inside the group item, so the heading
    count matches the items a screen reader hears.
- Vercel shows the keyboard failure to avoid: its section triggers carry
  `aria-expanded` but cannot take focus.
- Circle stays open. Re-measure if the operator logs the profile in.
