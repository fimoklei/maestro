import { join } from "node:path";
import { isWithinRoot } from "../filesystem/path-containment";
import type { FileSystemPort } from "../registry/file-system";
import { type HarnessPrimitiveType, primitiveDir } from "./harness-primitive";

export type ResolvedPrimitiveDir =
  | { ok: true; dir: string }
  | { ok: false; reason: "unreadable" | "outside-root" };

// The type's folder, resolved inside the Harness root. Never creates the
// folder: a caller that writes into it ensures it first.
export async function resolveHarnessPrimitiveDir(
  fs: Pick<FileSystemPort, "realpath">,
  root: string,
  type: HarnessPrimitiveType,
): Promise<ResolvedPrimitiveDir> {
  let realRoot: string;
  let dir: string;
  try {
    realRoot = await fs.realpath(root);
    dir = await fs.realpath(join(root, primitiveDir(type)));
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  return isWithinRoot(dir, realRoot)
    ? { ok: true, dir }
    : { ok: false, reason: "outside-root" };
}
