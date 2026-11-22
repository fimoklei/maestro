import type { GitOrigin } from "../deploy/git-origin";
import {
  HARNESS_PROMPTS_DIR,
  HARNESS_SKILLS_DIR,
} from "../inventory/harness-layout";

export const HARNESS_PRIMITIVE_TYPES = ["skill", "prompt"] as const;

export type HarnessPrimitiveType = (typeof HARNESS_PRIMITIVE_TYPES)[number];

export type PrimitiveRef = { type: HarnessPrimitiveType; name: string };

export type HarnessObject = PrimitiveRef & { hash: string };

const PROMPT_EXTENSION = ".md";

export const PROPOSAL_NAMESPACE = "maestro";

const PROMPT_BRANCH_PREFIX = "prompt.";

export const primitiveDir = (type: HarnessPrimitiveType): string =>
  type === "skill" ? HARNESS_SKILLS_DIR : HARNESS_PROMPTS_DIR;

export const primitiveEntry = ({ type, name }: PrimitiveRef): string =>
  type === "skill" ? name : `${name}${PROMPT_EXTENSION}`;

export const primitivePath = (ref: PrimitiveRef): string =>
  `${primitiveDir(ref.type)}/${primitiveEntry(ref)}`;

export const primitivePathspec = (ref: PrimitiveRef): string =>
  `:(literal)${primitivePath(ref)}`;

export const primitiveObject = (type: HarnessPrimitiveType): "tree" | "blob" =>
  type === "skill" ? "tree" : "blob";

/** A map key for one primitive; it never crosses HTTP. */
export const primitiveKey = ({ type, name }: PrimitiveRef): string =>
  `${type}:${name}`;

export const proposalBranchLeaf = ({ type, name }: PrimitiveRef): string =>
  type === "skill" ? name : `${PROMPT_BRANCH_PREFIX}${name}`;

export const proposalBranch = (ref: PrimitiveRef): string =>
  `${PROPOSAL_NAMESPACE}/${proposalBranchLeaf(ref)}`;

export const PROPOSAL_REFS = `refs/remotes/origin/${PROPOSAL_NAMESPACE}`;

export const parseProposalBranch = (leaf: string): PrimitiveRef | null => {
  if (!leaf.includes(".")) {
    return { type: "skill", name: leaf };
  }
  const name = leaf.slice(PROMPT_BRANCH_PREFIX.length);
  return leaf.startsWith(PROMPT_BRANCH_PREFIX) && name !== ""
    ? { type: "prompt", name }
    : null;
};

export const proposalCompareUrl = (
  origin: GitOrigin,
  defaultBranch: string,
  ref: PrimitiveRef,
): string =>
  `https://${origin.host}/${origin.ownerRepo}/compare/${encodeURIComponent(defaultBranch)}...${PROPOSAL_NAMESPACE}/${encodeURIComponent(proposalBranchLeaf(ref))}?expand=1`;

type ListingEntry = { mode: string; object: string; file: string };

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
