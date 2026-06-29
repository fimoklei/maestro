// The path-safety predicate for the browse capability (ADR-0009). Both inputs
// must be already-resolved absolute paths (realpath output): with `..` and
// symlinks already collapsed, "is the candidate inside the root ceiling?"
// reduces to a prefix question that path.relative answers without string games.
import { isAbsolute, relative } from "node:path";

// True when `candidate` is the root itself or nested beneath it. Uses
// path.relative so a sibling like /home/user-evil is not mistaken for a child of
// /home/user (a naive startsWith would accept it).
export function isWithinRoot(candidate: string, root: string): boolean {
  if (candidate === root) {
    return true;
  }
  const rel = relative(root, candidate);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}
