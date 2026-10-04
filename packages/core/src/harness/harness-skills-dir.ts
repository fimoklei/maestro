import { join } from "node:path";
import { isWithinRoot } from "../filesystem/path-containment";
import { HARNESS_SKILLS_DIR } from "../inventory/harness-layout";
import type { FileSystemPort } from "../registry/file-system";

export type ResolvedSkillsDir =
  | { ok: true; skills: string }
  | { ok: false; reason: "unreadable" | "outside-root" };

// Never creates the folder: a caller that writes into it ensures it first.
export async function resolveHarnessSkillsDir(
  fs: Pick<FileSystemPort, "realpath">,
  root: string,
): Promise<ResolvedSkillsDir> {
  let realRoot: string;
  let skills: string;
  try {
    realRoot = await fs.realpath(root);
    skills = await fs.realpath(join(root, HARNESS_SKILLS_DIR));
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  return isWithinRoot(skills, realRoot)
    ? { ok: true, skills }
    : { ok: false, reason: "outside-root" };
}
