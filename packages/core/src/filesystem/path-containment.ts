import { isAbsolute, relative } from "node:path";

// Both inputs must already be realpath output: `..` and symlinks are not
// collapsed. path.relative, not startsWith, which accepts /home/user-evil.
export function isWithinRoot(candidate: string, root: string): boolean {
  if (candidate === root) {
    return true;
  }
  const rel = relative(root, candidate);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}
