// The git steps that differ by primitive type: a skill is a folder (a tree),
// a prompt one file (a blob). Nothing leaves as stdout or stderr.
import { execFile } from "node:child_process";
import { access, lstat, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { gitOptions, indexOptions } from "../git/non-interactive";
import { runGitText } from "../git/run-git-text";
import {
  HARNESS_PRIMITIVE_TYPES,
  type HarnessObject,
  type HarnessPrimitiveType,
  PROPOSAL_REFS,
  type PrimitiveRef,
  parsePrimitiveListing,
  parseProposalBranch,
  primitiveDir,
  primitiveEntry,
  primitiveKey,
  primitiveObject,
  primitivePath,
} from "./harness-primitive";
import { readBranchAuthorship, readCommitEmail } from "./proposal-branch-git";
import type { HarnessPromoteRef } from "./read-harness-state";

const run = promisify(execFile);

// No line-ending rewrite: a CRLF clone would get bytes the commit never held
// (#914). A `.gitattributes` smudge filter still applies.
const NO_CONVERSION = ["-c", "core.autocrlf=false", "-c", "core.eol=lf"];

// Tab-separated so a name containing spaces stays one field.
const PROPOSAL_FORMAT = `%(refname:lstrip=${PROPOSAL_REFS.split("/").length})\t%(objectname)`;

/** One primitive's object in a tree: its hash and the mode git records. */
export type PrimitiveObject = { hash: string; mode: string };

const wasKilled = (error: unknown): boolean =>
  (error as { killed?: boolean }).killed === true;

const pathExists = (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false,
  );

// Null only when the command failed; raw stdout, since `-z` names must stay untouched.
const readOutput = async (
  root: string,
  args: string[],
): Promise<string | null> => {
  try {
    const { stdout } = await run("git", ["-C", root, ...args], gitOptions());
    return stdout;
  } catch {
    return null;
  }
};

/** Whether anything, a link included, sits at the primitive's path; never follows a link. */
export const primitiveOnDisk = (
  root: string,
  ref: PrimitiveRef,
): Promise<boolean> =>
  lstat(join(root, primitivePath(ref))).then(
    () => true,
    () => false,
  );

// Null on an unreadable ref or a listing the parser does not recognise. A
// missing type folder is zero primitives of that type, never null.
export async function listPrimitivesAt(
  root: string,
  ref: string,
): Promise<HarnessObject[] | null> {
  const listed: HarnessObject[] = [];
  for (const type of HARNESS_PRIMITIVE_TYPES) {
    // `-z`: otherwise git quotes any non-ASCII name.
    const listing = await readOutput(root, [
      "ls-tree",
      "-z",
      `${ref}:${primitiveDir(type)}`,
    ]);
    if (listing === null) {
      // Tells an unresolvable ref from one without this folder. `^{tree}`:
      // the working listing passes a bare tree hash (#580).
      const resolves = await readOutput(root, [
        "rev-parse",
        "--verify",
        "--quiet",
        `${ref}^{tree}`,
      ]);
      if (resolves === null) {
        return null;
      }
      continue;
    }
    const parsed = parsePrimitiveListing(type, listing);
    if (parsed === null) {
      return null;
    }
    listed.push(...parsed);
  }
  return listed;
}

// One throwaway index covers every type folder, so all types come from one
// snapshot. Seeded from HEAD: git exempts only tracked files from the ignore
// rules, so an index built from nothing would drop tracked-but-ignored files.
export async function listWorkingPrimitives(
  root: string,
): Promise<HarnessObject[] | null> {
  const dirs = HARNESS_PRIMITIVE_TYPES.map(primitiveDir);
  const present = (
    await Promise.all(
      dirs.map(async (dir) =>
        (await pathExists(join(root, dir))) ? [dir] : [],
      ),
    )
  ).flat();
  // Every other failure below must throw: read as "nothing on disk" it would
  // show the whole harness as locally deleted.
  if (present.length === 0) {
    return [];
  }
  const absent = dirs.filter((dir) => !present.includes(dir));

  const indexDir = await mkdtemp(join(tmpdir(), "maestro-harness-index-"));
  const options = indexOptions(join(indexDir, "index"));
  try {
    // Only an unborn HEAD fails here.
    await run("git", ["-C", root, "read-tree", "HEAD"], options).catch(
      () => {},
    );
    // A folder gone from disk is gone from the snapshot, not left as HEAD has it.
    if (absent.length > 0) {
      await run(
        "git",
        [
          "-C",
          root,
          "rm",
          "-r",
          "-q",
          "--cached",
          "--ignore-unmatch",
          "--",
          ...absent,
        ],
        options,
      );
    }
    await run("git", ["-C", root, "add", "-A", "--", ...present], options);
    const { stdout } = await run("git", ["-C", root, "write-tree"], options);
    return await listPrimitivesAt(root, stdout.trim());
  } finally {
    await rm(indexDir, { recursive: true, force: true });
  }
}

// The same throwaway-index snapshot as `listWorkingPrimitives`, for the named
// paths only, compared with `commit`. A file only the commit holds is not
// lost work, so it is left out.
export async function readWorkingDifferences(
  root: string,
  refs: readonly PrimitiveRef[],
  commit: string,
): Promise<string[] | null> {
  const paths = refs.map(primitivePath);
  const onDisk = await Promise.all(
    refs.map((ref) => primitiveOnDisk(root, ref)),
  );
  const literal = (path: string) => `:(literal)${path}`;
  const present = paths.filter((_, at) => onDisk[at]).map(literal);
  const absent = paths.filter((_, at) => !onDisk[at]).map(literal);

  const indexDir = await mkdtemp(join(tmpdir(), "maestro-harness-index-"));
  const options = indexOptions(join(indexDir, "index"));
  try {
    await run("git", ["-C", root, "read-tree", "HEAD"], options).catch(
      () => {},
    );
    if (absent.length > 0) {
      await run(
        "git",
        [
          "-C",
          root,
          "rm",
          "-r",
          "-q",
          "--cached",
          "--ignore-unmatch",
          "--",
          ...absent,
        ],
        options,
      );
    }
    if (present.length > 0) {
      await run("git", ["-C", root, "add", "-A", "--", ...present], options);
    }
    const { stdout } = await run(
      "git",
      [
        "-C",
        root,
        "diff",
        "--cached",
        "-z",
        "--name-only",
        "--no-renames",
        "--diff-filter=AMT",
        `${commit}^{commit}`,
        "--",
        ...paths.map(literal),
      ],
      options,
    );
    return stdout
      .split("\0")
      .filter((path) => path !== "")
      .sort();
  } catch {
    return null;
  } finally {
    await rm(indexDir, { recursive: true, force: true });
  }
}

// Throws where the primitive is not on disk.
export async function hashWorkingPrimitive(
  root: string,
  ref: PrimitiveRef,
  indexDir: string,
): Promise<PrimitiveObject> {
  const path = primitivePath(ref);
  const options = indexOptions(join(indexDir, "working"));
  await run("git", ["-C", root, "read-tree", "HEAD"], options).catch(() => {});
  await run("git", ["-C", root, "add", "-A", "--", path], options);
  const { stdout: tree } = await run(
    "git",
    ["-C", root, "write-tree"],
    options,
  );
  const object = (await readObjectAt(root, tree.trim(), path))?.object ?? null;
  if (object === null) {
    throw new Error("primitive not in the working tree");
  }
  return object;
}

// The outer null is a failed read; `object: null` is a path the tree lacks.
const readObjectAt = async (
  root: string,
  treeish: string,
  path: string,
): Promise<{ object: PrimitiveObject | null } | null> => {
  const listing = await readOutput(root, [
    "ls-tree",
    "-z",
    treeish,
    "--",
    path,
  ]);
  if (listing === null) {
    return null;
  }
  const [meta = ""] = listing.split("\t");
  const [mode, , hash] = meta.split(" ");
  return { object: mode && hash ? { hash, mode } : null };
};

/** The primitive's hash on a ref, or null where the ref lacks it. */
export const readPrimitiveHash = (
  root: string,
  treeish: string,
  ref: PrimitiveRef,
): Promise<string | null> =>
  runGitText(root, ["rev-parse", `${treeish}:${primitivePath(ref)}`]);

// The base's copy is dropped first: `read-tree --prefix` refuses a path the
// index already holds. `object: null` stops there (a removal). `parent` is the
// proposal branch's tip when one exists, so the push fast-forwards (#578).
export async function commitPrimitiveOnto(
  root: string,
  change: { ref: PrimitiveRef; object: PrimitiveObject | null },
  treeBase: string,
  parent: string,
  indexDir: string,
  subject: string,
): Promise<string> {
  const path = primitivePath(change.ref);
  const options = indexOptions(join(indexDir, "promote"));
  await run("git", ["-C", root, "read-tree", treeBase], options);
  await run(
    "git",
    [
      "-C",
      root,
      "rm",
      "-r",
      "-f",
      "-q",
      "--cached",
      "--ignore-unmatch",
      "--",
      path,
    ],
    options,
  );
  if (change.object !== null) {
    const add =
      primitiveObject(change.ref.type) === "tree"
        ? ["read-tree", `--prefix=${path}/`, change.object.hash]
        : [
            "update-index",
            "--add",
            "--cacheinfo",
            `${change.object.mode},${change.object.hash},${path}`,
          ];
    await run("git", ["-C", root, ...add], options);
  }
  const { stdout: tree } = await run(
    "git",
    ["-C", root, "write-tree"],
    options,
  );
  // No author, no signing flag: the author's own git config applies (#574).
  const { stdout: commit } = await run(
    "git",
    ["-C", root, "commit-tree", tree.trim(), "-p", parent, "-m", subject],
    options,
  );
  return commit.trim();
}

const emptyByType = <T>(): Record<HarnessPrimitiveType, Record<string, T>> => ({
  skill: {},
  prompt: {},
});

// Each branch is read only for the primitive it is named for; a null tree is
// a branch proposing to delete it. A branch of no known family is skipped.
export async function readProposalRefs(
  root: string,
  base: string,
): Promise<Record<HarnessPrimitiveType, Record<string, HarnessPromoteRef>>> {
  const refs = emptyByType<HarnessPromoteRef>();
  const listing = await runGitText(root, [
    "for-each-ref",
    `--format=${PROPOSAL_FORMAT}`,
    PROPOSAL_REFS,
  ]);
  if (listing === null) {
    return refs;
  }
  const email = await readCommitEmail(root);
  await Promise.all(
    listing.split("\n").map(async (line) => {
      const [leaf = "", commit = ""] = line.split("\t");
      const ref = parseProposalBranch(leaf);
      if (ref === null) {
        return;
      }
      refs[ref.type][ref.name] = {
        tree: await readPrimitiveHash(root, `${PROPOSAL_REFS}/${leaf}`, ref),
        commit: commit || null,
        authorship: await readBranchAuthorship(root, ref, base, email),
      };
    }),
  );
  return refs;
}

// The newest commit on `ref` that touched each primitive, keyed by `primitiveKey`.
export async function readAuthors(
  root: string,
  ref: string,
  refs: PrimitiveRef[],
): Promise<Record<string, string | null>> {
  const authors = await Promise.all(
    refs.map(async (each) => [
      primitiveKey(each),
      await runGitText(root, [
        "log",
        "-1",
        "--format=%an",
        ref,
        "--",
        primitivePath(each),
      ]),
    ]),
  );
  return Object.fromEntries(authors);
}

// Exit 1 is a staged difference; anything but 0 or 1, a killed run included, is no answer (#888).
export async function readStagedDifference(
  root: string,
  ref: PrimitiveRef,
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
        primitivePath(ref),
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

// Writes the primitive into `into` under its own folder or file name. A
// throwaway index, so nothing the author staged moves (#888).
export async function writePrimitiveInto(
  root: string,
  ref: PrimitiveRef,
  commit: string,
  into: string,
): Promise<"written" | "missing" | "failed"> {
  const indexDir = await mkdtemp(join(tmpdir(), "maestro-harness-restore-"));
  const options = indexOptions(join(indexDir, "index"));
  const path = primitivePath(ref);
  try {
    if (primitiveObject(ref.type) === "tree") {
      try {
        await run(
          "git",
          [
            "-C",
            root,
            "read-tree",
            `--prefix=${primitiveEntry(ref)}/`,
            `${commit}:${path}`,
          ],
          options,
        );
      } catch (error) {
        // Only a git that ran and refused says `missing`; a cut-off run never reads as absence.
        return wasKilled(error) ? "failed" : "missing";
      }
    } else {
      const read = await readObjectAt(root, commit, path);
      if (read === null) {
        return "failed";
      }
      const { object } = read;
      if (object === null) {
        return "missing";
      }
      await run(
        "git",
        [
          "-C",
          root,
          "update-index",
          "--add",
          "--cacheinfo",
          `${object.mode},${object.hash},${primitiveEntry(ref)}`,
        ],
        options,
      );
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
