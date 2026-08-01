// A confirmation panel's outline states its worst news, so the weight of the
// dialog is visible before a word is read. One owner: two remove dialogs draw
// the same rule, and an outline that disagreed between them would teach the
// user nothing.
export function panelBorderFor({
  failure,
  cost,
}: {
  failure: boolean;
  cost: boolean;
}): string {
  if (failure) {
    return "border-danger-border";
  }
  return cost ? "border-line-drift" : "border-line";
}
