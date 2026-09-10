// The three git reads local skill restoration needs (ADR-0030), kept beside
// `harness-git.ts` rather than in it: that file is already at its size ceiling.
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { gitOptions, indexOptions } from "../git/non-interactive";
import { runGitText } from "../git/run-git-text";
import { harnessSkillSubpath } from "../inventory/harness-layout";

const run = promisify(execFile);

// Content as committed, with no line-ending rewrite: a clone configured for
// CRLF would otherwise get bytes the commit never held (#914). A smudge filter
// declared in `.gitattributes` still applies — checkout-index has no switch.
const NO_CONVERSION = ["-c", "core.autocrlf=false", "-c", "core.eol=lf"];

const wasKilled = (error: unknown): boolean =>
  (error as { killed?: boolean }).killed === true;

// The clone's own HEAD, not `origin/HEAD`: a restoration is confirmed against
// the author's last local commit (ADR-0030).
export const readLocalHeadCommit = (root: string): Promise<string | null> =>
  runGitText(root, ["rev-parse", "HEAD"]);

// Exit 0 is a clean entry, exit 1 is a staged difference, and anything else
// — a killed run included — is a question that got no answer (#888).
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

// git writes the bytes and the mode bits from the commit itself, through a
// throwaway index, so nothing here is re-implemented and nothing the author
// staged moves. The caller publishes the result with one rename (#888).
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
      // A run we cut off answered nothing, and a read that broke must never be
      // reported as absence: only a git that ran and refused says `missing`.
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
