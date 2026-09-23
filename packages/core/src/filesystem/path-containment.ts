// Both inputs must already be realpath output — this only answers the prefix
// question, it does not collapse `..` or symlinks (ADR-0009).
import { isAbsolute, relative } from "node:path";

// path.relative, not startsWith: the latter accepts /home/user-evil as a child
// of /home/user.
export function isWithinRoot(candidate: string, root: string): boolean {
  if (candidate === root) {
    return true;
  }
  const rel = relative(root, candidate);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}
