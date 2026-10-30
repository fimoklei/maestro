// Everything about a Harness primitive that differs by type. A name is unique
// within its type only, so every identity is a type plus a name.
import type { GitOrigin } from "../deploy/git-origin";
import {
  HARNESS_PROMPTS_DIR,
  HARNESS_SKILLS_DIR,
} from "../inventory/harness-layout";

export const HARNESS_PRIMITIVE_TYPES = ["skill", "prompt"] as const;

export type HarnessPrimitiveType = (typeof HARNESS_PRIMITIVE_TYPES)[number];

export type PrimitiveRef = { type: HarnessPrimitiveType; name: string };

// `hash` is a tree hash for a skill and a blob hash for a prompt.
export type HarnessObject = PrimitiveRef & { hash: string };

const PROMPT_EXTENSION = ".md";

const PROPOSAL_NAMESPACE = "maestro";

// A skill name holds no dot, so no prompt branch can clash with a skill branch.
const PROMPT_BRANCH_PREFIX = "prompt.";

export const primitiveDir = (type: HarnessPrimitiveType): string =>
  type === "skill" ? HARNESS_SKILLS_DIR : HARNESS_PROMPTS_DIR;

/** The folder or file name a primitive takes inside its type's folder. */
export const primitiveEntry = ({ type, name }: PrimitiveRef): string =>
  type === "skill" ? name : `${name}${PROMPT_EXTENSION}`;

export const primitivePath = (ref: PrimitiveRef): string =>
  `${primitiveDir(ref.type)}/${primitiveEntry(ref)}`;

// Literal, so git never reads a glob character in a name as a pattern.
export const primitivePathspec = (ref: PrimitiveRef): string =>
  `:(literal)${primitivePath(ref)}`;

export const primitiveObject = (type: HarnessPrimitiveType): "tree" | "blob" =>
  type === "skill" ? "tree" : "blob";

/** A map key for one primitive; it never crosses HTTP. */
export const primitiveKey = ({ type, name }: PrimitiveRef): string =>
  `${type}:${name}`;

/** The branch name under `maestro/`, as fetched into `refs/remotes/origin/maestro/`. */
export const proposalBranchLeaf = ({ type, name }: PrimitiveRef): string =>
  type === "skill" ? name : `${PROMPT_BRANCH_PREFIX}${name}`;

export const proposalBranch = (ref: PrimitiveRef): string =>
  `${PROPOSAL_NAMESPACE}/${proposalBranchLeaf(ref)}`;

/** The remote-tracking ref every proposal branch is fetched into. */
export const PROPOSAL_REFS = `refs/remotes/origin/${PROPOSAL_NAMESPACE}`;

// Null for a dotted name of no known family: it is skipped, never read as a skill.
export const parseProposalBranch = (leaf: string): PrimitiveRef | null => {
  if (!leaf.includes(".")) {
    return { type: "skill", name: leaf };
  }
  const name = leaf.slice(PROMPT_BRANCH_PREFIX.length);
  return leaf.startsWith(PROMPT_BRANCH_PREFIX) && name !== ""
    ? { type: "prompt", name }
    : null;
};

// GitHub's pull-request form, built without the GitHub API (#574).
export const proposalCompareUrl = (
  origin: GitOrigin,
  defaultBranch: string,
  ref: PrimitiveRef,
): string =>
  `https://${origin.host}/${origin.ownerRepo}/compare/${encodeURIComponent(defaultBranch)}...${PROPOSAL_NAMESPACE}/${encodeURIComponent(proposalBranchLeaf(ref))}?expand=1`;

type ListingEntry = { mode: string; object: string; file: string };

// A prompt is a plain or executable `.md` file directly in its folder, never a
// symlink. Every tree counts as a skill. Validity is never filtered here.
const listedName = (
  type: HarnessPrimitiveType,
  { mode, object, file }: ListingEntry,
): string | null => {
  if (type === "skill") {
    return object === "tree" ? file : null;
  }
  const isFile = object === "blob" && (mode === "100644" || mode === "100755");
  return isFile &&
    file.endsWith(PROMPT_EXTENSION) &&
    file.length > PROMPT_EXTENSION.length
    ? file.slice(0, -PROMPT_EXTENSION.length)
    : null;
};

// Parses `git ls-tree -z <ref>:<dir>`. Null on a listing this parser does not
// recognise: skipping a line would read as a removal nobody made.
export const parsePrimitiveListing = (
  type: HarnessPrimitiveType,
  listing: string,
): HarnessObject[] | null => {
  const listed: HarnessObject[] = [];
  for (const line of listing.split("\0")) {
    if (line === "") {
      continue;
    }
    const [meta = "", file = ""] = line.split("\t");
    const [mode, object, hash] = meta.split(" ");
    if (!mode || !object || !hash || !file) {
      return null;
    }
    const name = listedName(type, { mode, object, file });
    if (name !== null) {
      listed.push({ type, name, hash });
    }
  }
  return listed;
};
