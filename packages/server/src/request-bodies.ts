import {
  type BatchRequest,
  CATEGORIES_PREVIEW_KINDS,
  COPY_MODES,
  HARNESS_PRIMITIVE_TYPES,
  type ImportSkillsInput,
  type PromptImportDraft,
} from "@maestro/core";
import {
  type PromptFields,
  type PromptFile,
  promptFieldProblems,
  withinPromptLimit,
} from "@maestro/core/prompt-file";
import type { Context } from "hono";
import { z } from "zod";
import { refusalCodes } from "./error-responses";

export const registerBodySchema = z.object({ path: z.string() });

export const connectBodySchema = z.object({
  path: z.string(),
  parent: z.string().optional(),
  localOnly: z.boolean().optional(),
});

export const chooseFolderBodySchema = z.object({ path: z.string() });

export const importSkillsCheckBodySchema = z.object({ source: z.string() });

const folderEntry = z
  .string()
  .min(1)
  .refine((entry) => !/[/\\\0]/.test(entry) && entry !== "." && entry !== "..");

export const importSkillsBodySchema = z.object({
  source: z.string(),
  entries: z
    .array(z.object({ entry: folderEntry, replace: z.boolean() }))
    .min(1),
}) satisfies z.ZodType<ImportSkillsInput>;

const fieldsHold = (fields: PromptFields) =>
  promptFieldProblems(fields).length === 0;

const promptFileSchema = z.object({
  description: z.string().refine(withinPromptLimit),
  text: z.string().refine(withinPromptLimit),
  example: z.string().refine(withinPromptLimit),
}) satisfies z.ZodType<PromptFile>;

export const importPromptsBodySchema = z.object({
  prompts: z
    .array(
      z.object({
        name: z.string(),
        frontmatter: z.string(),
        description: z.string(),
        text: z.string(),
        example: z.string(),
        replace: z.boolean(),
      }),
    )
    .min(1),
}) satisfies z.ZodType<{ prompts: PromptImportDraft[] }>;

export const promptCheckBodySchema = z.object({ name: z.string() });

export const promptReadBodySchema = z.object({ name: z.string() });

export const promptEditBodySchema = promptFileSchema
  .extend({ name: z.string(), read: promptFileSchema })
  .refine(fieldsHold);

export const addCategoryBodySchema = z.object({ name: z.string() });

export const renameCategoryBodySchema = z.object({
  from: z.string(),
  to: z.string(),
});

export const deleteCategoryBodySchema = z.object({
  name: z.string(),
  moveTo: z.string().nullable(),
});

export const assignCategoryBodySchema = z.object({
  items: z
    .array(
      z.object({ type: z.enum(HARNESS_PRIMITIVE_TYPES), name: z.string() }),
    )
    .min(1),
  category: z.string().nullable(),
});

export const copyCategoriesBodySchema = z.object({
  mode: z.enum(COPY_MODES),
});

export const categoriesProposalBodySchema = z.object({
  previewed: z.enum(CATEGORIES_PREVIEW_KINDS),
});

const targetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("repo"), repoPath: z.string() }),
  z.object({ kind: z.literal("global") }),
]);

export const importLocalEditsCheckBodySchema = z.object({
  target: targetSchema,
});

export const importLocalEditsBodySchema = z.object({
  target: targetSchema,
  names: z.array(z.string()).min(1),
  undo: z.array(z.string()),
  selected: z.array(z.object({ name: z.string(), folder: z.string() })),
});

const consentTokenSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/)
  .optional();

export const deployBodySchema = z.object({
  type: z.string(),
  name: z.string(),
  target: targetSchema,
  confirmedCopyReceipt: consentTokenSchema,
});

export const retryOperationBodySchema = z.object({
  target: targetSchema,
  confirmedCopyReceipt: consentTokenSchema,
});

export const bulkDeployBodySchema = z.object({
  names: z.array(z.string()).min(1),
  target: targetSchema,
});

export const deployAgainBodySchema = z.object({
  target: targetSchema,
  held: z
    .array(
      z.object({
        name: z.string(),
        confirmedCopyReceipt: z.string().regex(/^[0-9a-f]{64}$/),
      }),
    )
    .min(1),
});

export const removeBodySchema = z.object({
  type: z.string(),
  name: z.string(),
  target: targetSchema,
  confirmedRemovalReceipt: consentTokenSchema,
});

export const bulkRemoveBodySchema = z.object({
  name: z.string(),
  targets: z
    .array(
      z.object({
        target: targetSchema,
        confirmedRemovalReceipt: consentTokenSchema,
        refused: z.enum(refusalCodes).optional(),
      }),
    )
    .min(1),
});

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

export const publishReleaseBodySchema = z.object({
  step: z.enum(["major", "minor", "patch"]),
  previousTag: z.string().nullable(),
  previousTagCommit: z.string().nullable(),
  revision: z.string(),
});

const primitiveRefShape = {
  type: z.enum(HARNESS_PRIMITIVE_TYPES),
  name: z.string(),
};

export const primitiveRefBodySchema = z.object(primitiveRefShape);

const listSubjectShape = { type: z.literal("categories") };

export const proposeBatchBodySchema = z.object({
  items: z
    .array(
      z.object({
        ...primitiveRefShape,
        seenRemoteTree: z.string().optional(),
      }),
    )
    .min(1),
}) satisfies z.ZodType<{ items: BatchRequest[] }>;

export const proposalBodySchema = z.object({
  ...primitiveRefShape,
  number: z.number().int().positive(),
});

const withdrawNumber = z.number().int().positive().nullable();
export const withdrawBodySchema = z.union([
  z.object({ ...primitiveRefShape, number: withdrawNumber }),
  z.object({ ...listSubjectShape, number: withdrawNumber }),
]);

export const deletionBodySchema = z.object({
  ...primitiveRefShape,
  seenRemoteTree: z.string(),
});

export const localDeletionBodySchema = z.object({
  ...primitiveRefShape,
  seenWorkingTree: z.string(),
});

export const discardBodySchema = z.object({
  ...primitiveRefShape,
  seenRemoteTree: z.string(),
});

export const releaseWithdrawalCheckBodySchema = z.union([
  primitiveRefBodySchema,
  z.object(listSubjectShape),
]);

export const releaseWithdrawalBodySchema = z.union([
  z.object({ ...primitiveRefShape, confirmation: z.string() }),
  z.object({ ...listSubjectShape, confirmation: z.string() }),
]);

export const restoreBodySchema = z.object({
  ...primitiveRefShape,
  seenHeadCommit: z.string(),
});

export type RequestShape = { message: string; detail: string };

export const PROMOTE_BODY: RequestShape = {
  message:
    "Nothing was proposed. Reload the page, then propose the change again.",
  detail:
    'The request carries a type and a name: { type: "skill" | "prompt", name: string }.',
};

export const PROPOSE_BATCH_BODY: RequestShape = {
  message:
    "Nothing was proposed. Reload the page, then propose the changes again.",
  detail:
    'The request carries a non-empty items array, each item a type and a name, and a seenRemoteTree for a deletion: { items: { type: "skill" | "prompt", name: string, seenRemoteTree?: string }[] }.',
};

export const PROPOSAL_CREATE_BODY: RequestShape = {
  message:
    "No pull request was created. Reload the page, then create it again.",
  detail:
    'The request carries a type and a name: { type: "skill" | "prompt", name: string }.',
};

export const PROPOSAL_BODY: RequestShape = {
  message:
    "Maestro couldn't change the pull request. Reload the page, then try again.",
  detail:
    'The request carries a type, a name and a pull-request number: { type: "skill" | "prompt", name: string, number: number }.',
};

export const WITHDRAW_BODY: RequestShape = {
  message:
    "Nothing was withdrawn. Reload the page, then withdraw the proposal again.",
  detail:
    'The request carries a type, a name and a pull-request number or null: { type: "skill" | "prompt", name: string, number: number | null }, or the categories list and a number or null: { type: "categories", number: number | null }.',
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

export const RELEASE_WITHDRAWAL_CHECK_BODY: RequestShape = {
  message:
    "Nothing was withdrawn. Reload the page, then withdraw it from release again.",
  detail:
    'The request carries a type and a name: { type: "skill" | "prompt", name: string }, or the categories list: { type: "categories" }.',
};

export const RELEASE_WITHDRAWAL_BODY: RequestShape = {
  message:
    "Nothing was withdrawn. Reload the page, then withdraw it from release again.",
  detail:
    'The request carries a type, a name and the confirmation it was given: { type: "skill" | "prompt", name: string, confirmation: string }, or the categories list and its confirmation: { type: "categories", confirmation: string }.',
};

export const RELEASE_BODY: RequestShape = {
  message:
    "Nothing was released. Reload the page, then publish the release again.",
  detail:
    'The request carries a version step and the plan\'s previous tag, that tag\'s commit and its revision: { step: "major" | "minor" | "patch", previousTag, previousTagCommit, revision }.',
};

export const ADD_CATEGORY_BODY: RequestShape = {
  message: "Nothing was added. Reload the page, then add the category again.",
  detail: "The request carries a name: { name: string }.",
};

export const RENAME_CATEGORY_BODY: RequestShape = {
  message:
    "Nothing was renamed. Reload the page, then rename the category again.",
  detail:
    "The request carries the current and the new name: { from: string, to: string }.",
};

export const DELETE_CATEGORY_BODY: RequestShape = {
  message:
    "Nothing was deleted. Reload the page, then delete the category again.",
  detail:
    "The request carries a name and the category its items move to, or null: { name: string, moveTo: string | null }.",
};

export const ASSIGN_CATEGORY_BODY: RequestShape = {
  message: "Nothing was changed. Reload the page, then set the category again.",
  detail:
    'The request carries the items and a category or null: { items: { type: "skill" | "prompt", name: string }[], category: string | null }.',
};

export const COPY_CATEGORIES_BODY: RequestShape = {
  message:
    "Nothing was copied. Reload the page, then copy the Harness categories again.",
  detail: 'The request carries how to copy: { mode: "add" | "replace" }.',
};

export const CATEGORIES_PROPOSAL_BODY: RequestShape = {
  message:
    "Nothing was pushed. Reload the page, then propose your categories again.",
  detail:
    'The request carries the kind of preview the dialog showed: { previewed: "changes" | "unchanged" | "uncompared" | "update" | "after-close" }.',
};

export const PATH_BODY: RequestShape = {
  message:
    "Maestro didn't receive a folder. Reload the page, then choose a folder again.",
  detail: "The request carries a path: { path: string }.",
};

export const IMPORT_SKILLS_CHECK_BODY: RequestShape = {
  message: "Nothing was read. Reload the page, then select the folder again.",
  detail: "The request carries a folder: { source: string }.",
};

export const IMPORT_SKILLS_BODY: RequestShape = {
  message:
    "Nothing was imported. Reload the page, then import the skills again.",
  detail:
    "The request carries a folder and the folders directly inside it to import: { source: string, entries: { entry: string, replace: boolean }[] }, at least one entry.",
};

export const IMPORT_PROMPTS_BODY: RequestShape = {
  message:
    "Nothing was imported. Reload the page, then import the prompts again.",
  detail:
    "The page must send at least one prompt: { prompts: { name, frontmatter, description, text, example, replace }[] }, with replace a boolean.",
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
    "The page must send these strings: { name, description, text, example, read: { description, text, example } }. The read values are the ones from when the dialog opened.",
};

export const TARGET_BODY: RequestShape = {
  message:
    "Maestro couldn't start this change. Reload the page, then try again.",
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
    "The request carries a target, a non-empty names array, an undo array and a selected array of { name, folder }.",
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

export const DEPLOY_AGAIN_BODY: RequestShape = {
  message:
    "Nothing was deployed. Reload the page, then stage the skills again.",
  detail:
    "The request carries a target and a non-empty held array of { name, confirmedCopyReceipt }.",
};

export const BULK_REMOVE_BODY: RequestShape = {
  message:
    "Nothing was removed. Reload the page, then start the removal again.",
  detail:
    "The request carries a skill name and a non-empty targets array, each entry carrying a target.",
};

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
