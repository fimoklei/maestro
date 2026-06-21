// Join class-name parts, dropping falsy ones. A tiny local helper so owned
// components can compose a base class string with a caller's className without
// pulling in a dependency.
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
