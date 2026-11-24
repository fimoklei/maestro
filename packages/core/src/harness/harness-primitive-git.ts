import { access, lstat, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gitOptions, indexOptions } from "../git/non-interactive";
import { runGit, runGitText } from "../git/run-git-text";
import {
  type ProcessOptions,
  runProcess,
  stdoutOf,
} from "../process/run-process";
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
  primitiveObject,
  primitivePath,
  primitivePathspec,
} from "./harness-primitive";
import { readBranchAuthorship, readCommitEmail } from "./proposal-branch-git";
import {
  type ListSubject,
  type ProposalSubject,
  subjectBranchLeaf,
  subjectKey,
  subjectObject,
  subjectPath,
  subjectPathspec,
} from "./proposal-subject";
import type { HarnessPromoteRef, ListProposalRefs } from "./read-harness-state";

const run = async (file: string, args: string[], options: ProcessOptions) => ({
  stdout: stdoutOf(await runProcess(file, args, options)),
});

const NO_CONVERSION = ["-c", "core.autocrlf=false", "-c", "core.eol=lf"];

const UNQUOTED_NAMES = "-z";

const PROPOSAL_FORMAT = `%(refname:lstrip=${PROPOSAL_REFS.split("/").length})\t%(objectname)`;

export type PrimitiveObject = { hash: string; mode: string };

const pathExists = (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false,
  );

const readRawOutput = async (
  root: string,
  args: string[],
): Promise<string | null> => {
  const outcome = await runProcess("git", ["-C", root, ...args], gitOptions());
  return outcome.ok ? outcome.stdout : null;
};

export const primitiveOnDisk = (
  root: string,
  ref: PrimitiveRef,
): Promise<boolean> =>
  lstat(join(root, primitivePath(ref))).then(
    () => true,
    () => false,
  );

export async function listPrimitivesAt(
  root: string,
  ref: string,
): Promise<HarnessObject[] | null> {
  const listed: HarnessObject[] = [];
  for (const type of HARNESS_PRIMITIVE_TYPES) {
    const listing = await readRawOutput(root, [
      "ls-tree",
      UNQUOTED_NAMES,
      `${ref}:${primitiveDir(type)}`,
    ]);
    if (listing === null) {
      const resolves = await readRawOutput(root, [
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

export async function readWorkingDifferences(
  root: string,
  refs: readonly PrimitiveRef[],
  commit: string,
): Promise<string[] | null> {
  const onDisk = await Promise.all(
    refs.map((ref) => primitiveOnDisk(root, ref)),
  );
  const present = refs.filter((_, at) => onDisk[at]).map(primitivePathspec);
  const absent = refs.filter((_, at) => !onDisk[at]).map(primitivePathspec);

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
        UNQUOTED_NAMES,
        "--name-only",
        "--no-renames",
        "--diff-filter=AMT",
        `${commit}^{commit}`,
        "--",
        ...refs.map(primitivePathspec),
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

const readObjectAt = async (
  root: string,
  treeish: string,
  path: string,
): Promise<{ object: PrimitiveObject | null } | null> => {
  const listing = await readRawOutput(root, [
    "ls-tree",
    UNQUOTED_NAMES,
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

export const readSubjectObject = (
  root: string,
  commit: string,
  subject: ProposalSubject,
): Promise<{ object: PrimitiveObject | null } | null> =>
  readObjectAt(root, commit, subjectPath(subject));

export const readPrimitiveHash = (
  root: string,
  treeish: string,
  ref: PrimitiveRef,
): Promise<string | null> =>
  runGitText(root, ["rev-parse", `${treeish}:${primitivePath(ref)}`]);

export type SubjectChange = {
  subject: ProposalSubject;
  object: PrimitiveObject | null;
};

export async function commitSubjectsOnto(
  root: string,
  changes: readonly SubjectChange[],
  {
    treeBase,
    parents,
    indexDir,
    message,
  }: {
    treeBase: string;
    parents: readonly string[];
    indexDir: string;
    message: string;
  },
): Promise<string> {
  const options = indexOptions(join(indexDir, "promote"));
  await run("git", ["-C", root, "read-tree", treeBase], options);
  for (const change of changes) {
    const path = subjectPath(change.subject);
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
        subjectObject(change.subject) === "tree"
          ? ["read-tree", `--prefix=${path}/`, change.object.hash]
          : [
              "update-index",
              "--add",
              "--cacheinfo",
              `${change.object.mode},${change.object.hash},${path}`,
            ];
      await run("git", ["-C", root, ...add], options);
    }
  }
  const { stdout: tree } = await run(
    "git",
    ["-C", root, "write-tree"],
    options,
  );
  // No author, no signing flag: the author's own git config applies (#574).
  const { stdout: commit } = await run(
    "git",
    [
      "-C",
      root,
      "commit-tree",
      tree.trim(),
      ...parents.flatMap((parent) => ["-p", parent]),
      "-m",
      message,
    ],
    options,
  );
  return commit.trim();
}

const emptyByType = <T>(): Record<HarnessPrimitiveType, Record<string, T>> => ({
  skill: {},
  prompt: {},
});

const hasLanded = async (
  root: string,
  ref: ProposalSubject,
  branch: string,
  tree: string | null,
  base: string,
): Promise<boolean> => {
  const onBase = await runGit(root, [
    "merge-base",
    "--is-ancestor",
    branch,
    base,
  ]);
  if (onBase.ok) {
    return true;
  }
  const commits = await runGitText(root, [
    "rev-list",
    "--full-history",
    `${branch}..${base}`,
    "--",
    subjectPathspec(ref),
  ]);
  if (commits === null) {
    return false;
  }
  for (const commit of commits.split("\n")) {
    const read = await readObjectAt(root, commit, subjectPath(ref));
    if (read !== null && (read.object?.hash ?? null) === tree) {
      return true;
    }
  }
  return false;
};

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
      const branch = `${PROPOSAL_REFS}/${leaf}`;
      const tree = await readPrimitiveHash(root, branch, ref);
      refs[ref.type][ref.name] = {
        tree,
        commit: commit || null,
        authorship: await readBranchAuthorship(root, ref, base, email),
        landed: await hasLanded(root, ref, branch, tree, base),
      };
    }),
  );
  return refs;
}

export async function readListProposal(
  root: string,
  subject: ListSubject,
  base: string,
): Promise<ListProposalRefs | null> {
  const remote = await readSubjectObject(root, base, subject);
  if (remote === null) {
    return null;
  }
  const branch = `${PROPOSAL_REFS}/${subjectBranchLeaf(subject)}`;
  const tip = await runGit(root, [
    "rev-parse",
    "--verify",
    "--quiet",
    `${branch}^{commit}`,
  ]);
  if (!tip.ok) {
    return { remote: remote.object?.hash ?? null, promote: null };
  }
  const tree = (await readSubjectObject(root, branch, subject))?.object ?? null;
  return {
    remote: remote.object?.hash ?? null,
    promote: {
      tree: tree?.hash ?? null,
      commit: tip.stdout,
      authorship: await readBranchAuthorship(
        root,
        subject,
        base,
        await readCommitEmail(root),
      ),
      landed: await hasLanded(root, subject, branch, tree?.hash ?? null, base),
    },
  };
}

export async function readAuthors(
  root: string,
  ref: string,
  refs: ProposalSubject[],
): Promise<Record<string, string | null>> {
  const authors = await Promise.all(
    refs.map(async (each) => [
      subjectKey(each),
      await runGitText(root, [
        "log",
        "-1",
        "--format=%an",
        ref,
        "--",
        subjectPathspec(each),
      ]),
    ]),
  );
  return Object.fromEntries(authors);
}

export async function readListHash(
  root: string,
  ref: string,
  subject: ListSubject,
): Promise<{ hash: string | null } | null> {
  const read = await readSubjectObject(root, ref, subject);
  return read === null ? null : { hash: read.object?.hash ?? null };
}

// Exit 1 is a staged difference; anything but 0 or 1, a killed run included, is no answer (#888).
export async function readStagedDifference(
  root: string,
  ref: PrimitiveRef,
): Promise<boolean | null> {
  const outcome = await runProcess(
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
  if (outcome.ok) {
    return false;
  }
  return outcome.failure === "failed" && outcome.exitCode === 1 ? true : null;
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
      const read = await runProcess(
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
      if (!read.ok) {
        // Only a git that ran and refused says `missing`; a cut-off run never reads as absence.
        return read.failure === "killed" ? "failed" : "missing";
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
