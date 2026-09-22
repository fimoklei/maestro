// Every POST body the server accepts, and the request-shape refusals it
// answers a wrong one with — the only prose the server writes (ADR-0025 §8).

import type { Context } from "hono";
import { z } from "zod";
import { refusalCodes } from "./error-responses";

export const registerBodySchema = z.object({ path: z.string() });

// `parent` is the folder a cloned Harness lands in — absent means the home
// ceiling, and it is ignored entirely on the local-path route (#555).
export const connectBodySchema = z.object({
  path: z.string(),
  parent: z.string().optional(),
});

export const browseBodySchema = z.object({ path: z.string() });

// The field's current value: the folder the chooser opens on (ADR-0032 §2).
export const chooseFolderBodySchema = z.object({ path: z.string() });

// The destination is never sent: the connected Harness is resolved server-side.
// `name` absent asks for Maestro's proposal (#576).
export const importBodySchema = z.object({
  source: z.string(),
  name: z.string().optional(),
});

// One spelling for every route that names a target: global carries no path, so
// no untrusted path crosses the boundary on it (J07).
const targetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("repo"), repoPath: z.string() }),
  z.object({ kind: z.literal("global") }),
]);

// Proves the confirmation came from this server's own preflight, not a
// client-built claim. Shaped as core mints it (allowlist, security.md); which
// destruction a given token authorizes is core's business, not the edge's.
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
  // exactly the copies it named (ADR-0006, #66, #952).
  confirmedCopyReceipt: consentTokenSchema,
});

// Retrying names only the target: which operation, at which release and with
// which Selection, comes from the record the server itself wrote (#951).
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

// One skill, many targets — the mirror image of the bulk-deploy body. Each
// target carries its own preflight answer: the token that authorises its
// reclaim, or the allowlisted code that takes it out of the run.
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

// The whole target moves to one release, so the only skill name that travels is
// `add`: the one the Inventory's entrance asks for beside the move. Which skills
// the release itself touches is the preview's answer, never the caller's claim.
export const updatePreflightBodySchema = z.object({
  target: targetSchema,
  add: z.string().optional(),
});

// The confirm carries the two proofs and the same request: the token, the
// receipt, and the skill it was priced with. A different skill mints a
// different token (#954, #955).
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

// A name, never a path: the harness the skill belongs to is resolved
// server-side, so the browser cannot point a promotion at another repository.
export const promoteBodySchema = z.object({ name: z.string() });

// A proposal mutation names the skill and the request the row showed. The
// number is a claim, never an authorisation: the use case rechecks it against
// a fresh read before anything is closed or reopened (#827).
export const proposalBodySchema = z.object({
  name: z.string(),
  number: z.number().int().positive(),
});

// The confirmation the author gave: the skill, and the origin/HEAD tree hash
// the row stated it against. Compared against a freshly fetched remote, never
// used as the thing to remove (#580).
export const deletionBodySchema = z.object({
  name: z.string(),
  seenRemoteTree: z.string(),
});

// The confirmation the author gave: the skill, and the local HEAD commit the
// row read its eligibility at. Compared against a freshly read HEAD, never
// used as the thing to restore (ADR-0030).
export const restoreBodySchema = z.object({
  name: z.string(),
  seenHeadCommit: z.string(),
});

// The request-shape refusals — the only prose the server writes
// (ADR-0025 §8). The sentence states what did not happen and where to restart;
// the shape rides in `detail`, which is where the reader meets it.
export type RequestShape = { message: string; detail: string };

export const PROMOTE_BODY: RequestShape = {
  message:
    "Nothing was proposed. Reload the page, then propose the change again.",
  detail: "The request carries a skill name: { name: string }.",
};

export const PROPOSAL_CREATE_BODY: RequestShape = {
  message:
    "No pull request was created. Reload the page, then create it again.",
  detail: "The request carries a skill name: { name: string }.",
};

export const PROPOSAL_BODY: RequestShape = {
  message:
    "Maestro could not change the pull request. Reload the page, then try again.",
  detail:
    "The request carries a skill name and a pull-request number: { name: string, number: number }.",
};

export const DELETION_BODY: RequestShape = {
  message:
    "Nothing was proposed. Reload the page, then remove the skill again.",
  detail:
    "The request carries a skill name and the origin/HEAD tree it was confirmed against.",
};

// Removing a skill that exists nowhere else. Only the name travels: nothing is
// compared against a remote, because nothing reaches one (#798).
export const LOCAL_DELETION_BODY: RequestShape = {
  message: "Nothing was deleted. Reload the page, then delete the skill again.",
  detail: "The request carries a skill name: { name: string }.",
};

// Putting a deleted skill folder back. The commit travels only to be compared
// with a freshly read local HEAD (ADR-0030).
export const RESTORE_BODY: RequestShape = {
  message:
    "Nothing was restored. Reload the page, then restore the skill again.",
  detail:
    "The request carries a skill name and the local commit it was confirmed against.",
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

export const TARGET_BODY: RequestShape = {
  message:
    "Maestro could not start this change. Reload the page, then try again.",
  detail:
    'The request carries a type, a name and a target: { kind: "repo", repoPath } or { kind: "global" }.',
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
