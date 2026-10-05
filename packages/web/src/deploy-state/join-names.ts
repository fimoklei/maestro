import { namedList, plainText } from "../ui/phrase";

// Joins names into one readable clause: "", "a", "a and b", "a, b and c".
export function joinNames(names: readonly string[]): string {
  return plainText(namedList(names));
}
