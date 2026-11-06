const NAME_REM = 8;

// Which columns a table `available` rem wide hides, and which sized columns
// drop their width to share what is left: the name once no column without a
// width shows, then, once hiding is spent, every column wider than the name's
// floor, widest first, until the table fits.
export function fitColumns(
  columns: { id: string; width?: number; priority?: number }[],
  available: number | null,
): { hidden: string[]; fluid: string[] } {
  let shown = columns;
  const hidden: string[] = [];
  const freed: string[] = [];
  const fillerOf = (set: typeof columns) =>
    set.some((column) => column.width === undefined)
      ? null
      : (set.find((column) => column.priority === undefined)?.id ?? null);
  const needed = (set: typeof columns) => {
    const filler = fillerOf(set);
    return set.reduce(
      (sum, column) =>
        sum +
        (column.width === undefined ||
        column.id === filler ||
        freed.includes(column.id)
          ? NAME_REM
          : column.width / 4),
      0,
    );
  };
  const byPriority = columns
    .filter((column) => column.priority !== undefined)
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  for (const column of byPriority) {
    if (available === null || needed(shown) <= available) break;
    hidden.push(column.id);
    shown = shown.filter((each) => each !== column);
  }
  const filler = fillerOf(shown);
  const wide = shown
    .filter(
      (column) =>
        column.id !== filler &&
        column.width !== undefined &&
        column.width / 4 > NAME_REM,
    )
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  for (const column of wide) {
    if (available === null || needed(shown) <= available) break;
    freed.push(column.id);
  }
  return { hidden, fluid: filler === null ? freed : [filler, ...freed] };
}
