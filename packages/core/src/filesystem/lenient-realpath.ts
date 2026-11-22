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
