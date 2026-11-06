// jsdom maps a td to "cell" even inside a grid, so the role is stated here once.
export function GridCell(props: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: a cell of a role="grid" table is a gridcell (WAI-ARIA grid pattern)
    // biome-ignore lint/a11y/useFocusableInteractive: the grid holds focus and points at its active row with aria-activedescendant
    <td role="gridcell" {...props} />
  );
}
