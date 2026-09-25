import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { gitOptions, indexOptions } from "../git/non-interactive";
import { runGitText } from "../git/run-git-text";
import { harnessSkillSubpath } from "../inventory/harness-layout";

const run = promisify(execFile);

// No line-ending rewrite: a CRLF clone would get bytes the commit never held
// (#914). A `.gitattributes` smudge filter still applies.
const NO_CONVERSION = ["-c", "core.autocrlf=false", "-c", "core.eol=lf"];

const wasKilled = (error: unknown): boolean =>
  (error as { killed?: boolean }).killed === true;

// The clone's own HEAD, not `origin/HEAD`.
export const readLocalHeadCommit = (root: string): Promise<string | null> =>
  runGitText(root, ["rev-parse", "HEAD"]);

// Exit 1 is a staged difference; anything but 0 or 1, a killed run included, is no answer (#888).
export async function readStagedSkillDifference(
  root: string,
  name: string,
): Promise<boolean | null> {
  try {
    await run(
      "git",
      [
        "-C",
        root,
        "diff-index",
        "--cached",
        "--quiet",
        "HEAD",
        "--",
        harnessSkillSubpath(name),
      ],
      gitOptions(),
    );
    return false;
  } catch (error) {
    return !wasKilled(error) && (error as { code?: number }).code === 1
      ? true
      : null;
  }
}

// A throwaway index, so nothing the author staged moves (#888).
export async function writeSkillTreeInto(
  root: string,
  name: string,
  commit: string,
  into: string,
): Promise<"written" | "missing" | "failed"> {
  const indexDir = await mkdtemp(join(tmpdir(), "maestro-harness-restore-"));
  const options = indexOptions(join(indexDir, "index"));
  try {
    try {
      await run(
        "git",
        [
          "-C",
          root,
          "read-tree",
          `--prefix=${name}/`,
          `${commit}:${harnessSkillSubpath(name)}`,
        ],
        options,
      );
    } catch (error) {
      // Only a git that ran and refused says `missing`; a cut-off run never reads as absence.
      return wasKilled(error) ? "failed" : "missing";
    }
    await run(
      "git",
      [
        "-C",
        root,
        ...NO_CONVERSION,
        "checkout-index",
        "-a",
        "-f",
        `--prefix=${into}/`,
      ],
      options,
    );
    return "written";
  } catch {
    return "failed";
  } finally {
    await rm(indexDir, { recursive: true, force: true });
  }
}
