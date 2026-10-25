// Every POST body the server accepts, and the request-shape refusals for a wrong one.

import { HARNESS_PRIMITIVE_TYPES } from "@maestro/core";
import {
  type PromptFields,
  promptFieldProblems,
  withinPromptLimit,
} from "@maestro/core/prompt-file";
import type { Context } from "hono";
import { z } from "zod";
import { refusalCodes } from "./error-responses";

export const registerBodySchema = z.object({ path: z.string() });

// `parent` is the folder a cloned Harness lands in — absent means the home
// ceiling, and it is ignored entirely on the local-path route (#555).
export const connectBodySchema = z.object({
  path: z.string(),
  parent: z.string().optional(),
  localOnly: z.boolean().optional(),
});

// The field's current value: the folder the chooser opens on.
export const chooseFolderBodySchema = z.object({ path: z.string() });

// The destination is never sent: the connected Harness is resolved server-side.
// `name` absent asks for Maestro's proposal (#576).
export const importBodySchema = z.object({
  source: z.string(),
  name: z.string().optional(),
});

// The edge applies the prompt field rules; core applies them again.
const fieldsHold = (fields: PromptFields) =>
  promptFieldProblems(fields).length === 0;

// "" carries no front matter, so a block with only the description is written.
export const importPromptBodySchema = z
  .object({
    name: z.string(),
    frontmatter: z.string(),
    description: z.string(),
    text: z.string(),
  })
  .refine(fieldsHold);

export const promptCheckBodySchema = z.object({ name: z.string() });

export const promptReadBodySchema = z.object({ name: z.string() });

// `read` is the prompt the dialog was filled with, as the read route gave it.
export const promptEditBodySchema = z
  .object({
    name: z.string(),
    description: z.string(),
    text: z.string(),
    read: z.object({
      description: z.string().refine(withinPromptLimit),
      text: z.string().refine(withinPromptLimit),
    }),
  })
  .refine(fieldsHold);

// Global carries no path, so no untrusted path crosses the boundary on it.
const targetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("repo"), repoPath: z.string() }),
  z.object({ kind: z.literal("global") }),
]);

// Target and skill names only: core resolves every folder from the target's record.
export const importLocalEditsCheckBodySchema = z.object({
  target: targetSchema,
});

export const importLocalEditsBodySchema = z.object({
  target: targetSchema,
  names: z.array(z.string()).min(1),
  undo: z.array(z.string()),
});

// Proves the confirmation came from this server's own preflight, not a client-built claim.
const consentTokenSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/)
  .optional();

export const deployBodySchema = z.object({
  // "skills only" is a core business rule, so a non-skill type is a 422, not a 400.
  type: z.string(),
  name: z.string(),
  target: targetSchema,
  // The receipt this deploy's own refusal minted, licensing the overwrite of
  // exactly the copies it named (#66, #952).
  confirmedCopyReceipt: consentTokenSchema,
});

export const retryOperationBodySchema = z.object({
  target: targetSchema,
  confirmedCopyReceipt: consentTokenSchema,
});

// No batch-wide consent: a copy with local edits always comes back as an
// attention row, overwritten only per item via the single-deploy route (#292).
export const bulkDeployBodySchema = z.object({
  names: z.array(z.string()).min(1),
  target: targetSchema,
});

export const removeBodySchema = z.object({
  type: z.string(),
  name: z.string(),
  target: targetSchema,
  confirmedReclaimToken: consentTokenSchema,
  confirmedRemovalReceipt: consentTokenSchema,
});

export const bulkRemoveBodySchema = z.object({
  name: z.string(),
  targets: z
    .array(
      z.object({
        target: targetSchema,
        confirmedReclaimToken: consentTokenSchema,
        confirmedRemovalReceipt: consentTokenSchema,
        refused: z.enum(refusalCodes).optional(),
      }),
    )
    .min(1),
});

// Which skills the release touches is the preview's answer, never the caller's claim.
export const updatePreflightBodySchema = z.object({
  target: targetSchema,
  add: z.string().optional(),
});

export const updateBodySchema = z.object({
  target: targetSchema,
  token: z.string().regex(/^[0-9a-f]{64}$/),
  add: z.string().optional(),
  confirmedCopyReceipt: consentTokenSchema,
});

// `previousTag` and `revision` prove the confirmation is against the plan the
// author saw: the server refuses when the freshly read remote no longer agrees
// with either, and computes what to tag from its own read (#520, #521).
export const publishReleaseBodySchema = z.object({
  step: z.enum(["major", "minor", "patch"]),
  previousTag: z.string().nullable(),
  previousTagCommit: z.string().nullable(),
  revision: z.string(),
});

// A type and a name, never a path: the harness the primitive belongs to is
// resolved server-side, so the browser cannot point a promotion at another
// repository.
const primitiveRefShape = {
  type: z.enum(HARNESS_PRIMITIVE_TYPES),
  name: z.string(),
};

export const promoteBodySchema = z.object(primitiveRefShape);

// The number is a claim, never an authorisation: it is rechecked against a fresh read (#827).
export const proposalBodySchema = z.object({
  ...primitiveRefShape,
  number: z.number().int().positive(),
});

// Null withdraws a branch with no open request (#1639).
export const withdrawBodySchema = z.object({
  ...primitiveRefShape,
  number: z.number().int().positive().nullable(),
});

// The hash is compared against a freshly fetched remote, never used as the
// thing to remove (#580).
export const deletionBodySchema = z.object({
  ...primitiveRefShape,
  seenRemoteTree: z.string(),
});

// The tree is compared against a freshly read working tree, never used as the
// thing to delete.
export const localDeletionBodySchema = z.object({
  ...primitiveRefShape,
  seenWorkingTree: z.string(),
});

// The tree is compared against a freshly read default branch, and is the copy
// that replaces the folder (#1375).
export const discardBodySchema = z.object({
  ...primitiveRefShape,
  seenRemoteTree: z.string(),
});

// The commit is compared against a freshly read HEAD, never used as the thing
// to restore.
export const restoreBodySchema = z.object({
  ...primitiveRefShape,
  seenHeadCommit: z.string(),
});

// The request-shape refusals, the only prose the server writes. The shape
// rides in `detail`.
export type RequestShape = { message: string; detail: string };

export const PROMOTE_BODY: RequestShape = {
  message:
    "Nothing was proposed. Reload the page, then propose the change again.",
  detail:
    'The request carries a type and a name: { type: "skill" | "prompt", name: string }.',
};

export const PROPOSAL_CREATE_BODY: RequestShape = {
  message:
    "No pull request was created. Reload the page, then create it again.",
  detail:
    'The request carries a type and a name: { type: "skill" | "prompt", name: string }.',
};

export const PROPOSAL_BODY: RequestShape = {
  message:
    "Maestro could not change the pull request. Reload the page, then try again.",
  detail:
    'The request carries a type, a name and a pull-request number: { type: "skill" | "prompt", name: string, number: number }.',
};

export const WITHDRAW_BODY: RequestShape = {
  message:
    "Nothing was withdrawn. Reload the page, then withdraw the proposal again.",
  detail:
    'The request carries a type, a name and a pull-request number or null: { type: "skill" | "prompt", name: string, number: number | null }.',
};

export const WITHDRAW_CHECK_BODY: RequestShape = {
  message:
    "Nothing was withdrawn. Reload the page, then withdraw the proposal again.",
  detail:
    'The request carries a type and a name: { type: "skill" | "prompt", name: string }.',
};

export const DELETION_BODY: RequestShape = {
  message:
    "Nothing was proposed. Reload the page, then propose the deletion again.",
  detail:
    'The request carries a type, a name and the origin/HEAD tree it was confirmed against: { type: "skill" | "prompt", name: string, seenRemoteTree: string }.',
};

export const LOCAL_DELETION_BODY: RequestShape = {
  message: "Nothing was deleted. Reload the page, then delete it again.",
  detail:
    'The request carries a type, a name and the working tree it was confirmed against: { type: "skill" | "prompt", name: string, seenWorkingTree: string }.',
};

export const RESTORE_BODY: RequestShape = {
  message: "Nothing was restored. Reload the page, then restore it again.",
  detail:
    'The request carries a type, a name and the local commit it was confirmed against: { type: "skill" | "prompt", name: string, seenHeadCommit: string }.',
};

export const DISCARD_BODY: RequestShape = {
  message:
    "Nothing was discarded. Reload the page, then discard the change again.",
  detail:
    'The request carries a type, a name and the default-branch tree it was confirmed against: { type: "skill" | "prompt", name: string, seenRemoteTree: string }.',
};

export const RELEASE_BODY: RequestShape = {
  message:
    "Nothing was released. Reload the page, then publish the release again.",
  detail:
    'The request carries a version step and the plan\'s previous tag, that tag\'s commit and its revision: { step: "major" | "minor" | "patch", previousTag, previousTagCommit, revision }.',
};

export const PATH_BODY: RequestShape = {
  message:
    "Maestro did not receive a folder. Reload the page, then choose a folder again.",
  detail: "The request carries a path: { path: string }.",
};

export const IMPORT_BODY: RequestShape = {
  message:
    "Nothing was imported. Reload the page, then import the skill again.",
  detail:
    "The request carries a source folder and an optional name: { source: string, name?: string }.",
};

export const IMPORT_PROMPT_BODY: RequestShape = {
  message:
    "Nothing was imported. Reload the page, then import the prompt again.",
  detail:
    "The request carries a name, front matter, a description and a text: { name: string, frontmatter: string, description: string, text: string }.",
};

export const PROMPT_CHECK_BODY: RequestShape = {
  message:
    "Nothing was checked. Reload the page, then check the prompt name again.",
  detail: "The request carries a name: { name: string }.",
};

export const PROMPT_READ_BODY: RequestShape = {
  message: "Nothing was read. Reload the page, then select Edit prompt again.",
  detail: "The request carries a name: { name: string }.",
};

export const PROMPT_EDIT_BODY: RequestShape = {
  message:
    "Nothing was edited. Reload the page, then select Edit prompt again.",
  detail:
    "The request carries a name, a description, a text and the prompt as read: { name: string, description: string, text: string, read: { description: string, text: string } }.",
};

export const TARGET_BODY: RequestShape = {
  message:
    "Maestro could not start this change. Reload the page, then try again.",
  detail:
    'The request carries a type, a name and a target: { kind: "repo", repoPath } or { kind: "global" }.',
};

export const IMPORT_LOCAL_EDITS_CHECK_BODY: RequestShape = {
  message:
    "Nothing was checked. Reload the page, then select Import local edits again.",
  detail:
    'The request carries a target: { kind: "repo", repoPath } or { kind: "global" }.',
};

export const IMPORT_LOCAL_EDITS_BODY: RequestShape = {
  message:
    "Nothing was imported. Reload the page, then select Import local edits again.",
  detail:
    "The request carries a target, a non-empty names array and an undo array.",
};

export const UPDATE_TARGET_BODY: RequestShape = {
  message:
    "Nothing was previewed. Reload the page, then start the update again.",
  detail:
    'The request carries a target: { kind: "repo", repoPath } or { kind: "global" }.',
};

export const UPDATE_BODY: RequestShape = {
  message: "Nothing was updated. Reload the page, then start the update again.",
  detail:
    "The request carries a target and the token the preview answered with.",
};

export const BULK_DEPLOY_BODY: RequestShape = {
  message:
    "Nothing was deployed. Reload the page, then stage the skills again.",
  detail:
    'The request carries a non-empty names array and a target: { kind: "repo", repoPath } or { kind: "global" }.',
};

export const BULK_REMOVE_BODY: RequestShape = {
  message:
    "Nothing was removed. Reload the page, then start the removal again.",
  detail:
    "The request carries a skill name and a non-empty targets array, each entry carrying a target.",
};

// Every POST route's front door: unparsable JSON and a wrong shape are the
// same 400, so a route only supplies its schema and its own wording.
export async function parseBody<T>(
  c: Context,
  schema: z.ZodType<T>,
  shape: RequestShape,
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  const body = await c.req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      response: c.json({ error: "invalid-body", ...shape }, 400),
    };
  }
  return { ok: true, data: parsed.data };
}
