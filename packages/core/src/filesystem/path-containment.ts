import { isAbsolute, relative } from "node:path";

export function isWithinRoot(candidate: string, root: string): boolean {
  if (candidate === root) {
    return true;
  }
  const rel = relative(root, candidate);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}
