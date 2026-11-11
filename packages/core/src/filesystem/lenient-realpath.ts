// Like Python's `Path.resolve(strict=False)`, which apm uses: resolves the
// symlinks of the longest existing prefix and keeps the rest as written.
import { realpathSync } from "node:fs";
import { basename, dirname, join } from "node:path";

export function lenientRealpath(path: string): string {
  try {
    return realpathSync.native(path);
  } catch {
    const parent = dirname(path);
    return parent === path
      ? path
      : join(lenientRealpath(parent), basename(path));
  }
}
