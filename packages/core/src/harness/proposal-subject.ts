// What a proposal carries: one primitive, or the categories list. Everything
// that differs by subject (path, branch) is answered here.
import { isValidSkillSlug } from "../deploy/package-ref";
import { HARNESS_CATEGORIES_FILE } from "../inventory/harness-layout";
import {
  PROPOSAL_NAMESPACE,
  type PrimitiveRef,
  primitiveKey,
  primitiveObject,
  primitivePath,
  proposalBranchLeaf,
} from "./harness-primitive";

export type ProposalSubject = PrimitiveRef | { type: "categories" };

export type ListSubject = Extract<ProposalSubject, { type: "categories" }>;

export const CATEGORIES_SUBJECT: ListSubject = { type: "categories" };

// Dotted outside the prompt family, so no skill or prompt read takes it.
const CATEGORIES_BRANCH_LEAF = "list.categories";

// The list carries no name; a primitive's name must be a valid slug.
export const hasValidName = (subject: ProposalSubject): boolean =>
  subject.type === "categories" || isValidSkillSlug(subject.name);

export const subjectPath = (subject: ProposalSubject): string =>
  subject.type === "categories"
    ? HARNESS_CATEGORIES_FILE
    : primitivePath(subject);

// Literal, so git never reads a glob character in a name as a pattern.
export const subjectPathspec = (subject: ProposalSubject): string =>
  `:(literal)${subjectPath(subject)}`;

export const subjectObject = (subject: ProposalSubject): "tree" | "blob" =>
  subject.type === "categories" ? "blob" : primitiveObject(subject.type);

/** A map key for one subject; it never crosses HTTP. */
export const subjectKey = (subject: ProposalSubject): string =>
  subject.type === "categories" ? subject.type : primitiveKey(subject);

/** The branch name under `maestro/`, as fetched into `refs/remotes/origin/maestro/`. */
export const subjectBranchLeaf = (subject: ProposalSubject): string =>
  subject.type === "categories"
    ? CATEGORIES_BRANCH_LEAF
    : proposalBranchLeaf(subject);

export const subjectBranch = (subject: ProposalSubject): string =>
  `${PROPOSAL_NAMESPACE}/${subjectBranchLeaf(subject)}`;
