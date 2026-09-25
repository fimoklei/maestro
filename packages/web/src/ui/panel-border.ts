// A confirmation panel's outline states its worst news.
export function panelBorderFor({
  failure,
  cost,
}: {
  failure: boolean;
  cost: boolean;
}): string {
  if (failure) {
    return "border-red-7";
  }
  return cost ? "border-amber-7" : "border-gray-7";
}
