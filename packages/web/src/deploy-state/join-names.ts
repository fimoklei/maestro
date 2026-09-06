// Joins names into one readable clause: "", "a", "a and b", "a, b and c".
// en-GB fixes the form to no Oxford comma, whatever locale the reader runs.
const listFormat = new Intl.ListFormat("en-GB");

export function joinNames(names: readonly string[]): string {
  return listFormat.format(names);
}
