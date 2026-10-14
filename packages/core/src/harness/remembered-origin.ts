import { join } from "node:path";
import type { GitOrigin } from "../deploy/git-origin";
import {
  type FileStamp,
  type FileSystemPort,
  sameStamp,
} from "../registry/file-system";

// The origin lives in the clone's `.git/config`, so an unchanged stamp of
// that file means an unchanged origin.
export function rememberOrigin(deps: {
  fs: Pick<FileSystemPort, "stamp">;
  readOrigin: (root: string) => Promise<GitOrigin | null>;
}): (root: string) => Promise<GitOrigin | null> {
  const remembered = new Map<
    string,
    { stamp: FileStamp; origin: GitOrigin | null }
  >();
  return async (root) => {
    // An unreadable stamp leaves nothing to compare against: ask git.
    const stamp = await deps.fs
      .stamp(join(root, ".git", "config"))
      .catch(() => null);
    const known = remembered.get(root);
    if (
      stamp !== null &&
      known !== undefined &&
      sameStamp(known.stamp, stamp)
    ) {
      return known.origin;
    }
    const origin = await deps.readOrigin(root);
    if (stamp === null) {
      remembered.delete(root);
    } else {
      remembered.set(root, { stamp, origin });
    }
    return origin;
  };
}
