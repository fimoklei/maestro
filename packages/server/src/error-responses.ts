import type {
  CategoryError,
  ChooseFolderError,
  ConnectInventoryError,
  DeleteLocalError,
  DeploySkillError,
  DiscardChangeError,
  EditPromptError,
  HarnessStateError,
  ImportPromptError,
  ImportSkillError,
  LocalEditsError,
  PromoteDeletionError,
  PromoteError,
  ProposalActionError,
  PublishReleaseError,
  ReadPromptError,
  ReleasePlanError,
  RemoveDeployedSkillError,
  RemovePreflightError,
  RepoPathError,
  RestoreError,
  RetryTargetOperationError,
  ScaffoldHarnessError,
  UpdatePreviewError,
  UpdateRunError,
  WithdrawError,
  WithdrawFromReleaseError,
  WorktreeAmbiguity,
} from "@maestro/core";
import type { PromptFieldProblem } from "@maestro/core/prompt-file";

type ErrorStatus = 400 | 403 | 404 | 409 | 422 | 500 | 502 | 503 | 504;

// apm hung and the driver stopped it.
const TIMED_OUT = { status: 504 } as const;

// A status only: every sentence lives in its feature copy module in `packages/web`.
export type ErrorTable<TCode extends string> = Record<
  TCode,
  { status: ErrorStatus }
>;

export const deployErrorResponses: ErrorTable<DeploySkillError> = {
  "unsupported-primitive-type": { status: 422 },
  "invalid-name": { status: 400 },
  "unknown-skill": { status: 404 },
  "inventory-not-configured": { status: 409 },
  "inventory-unreadable": { status: 503 },
  "repo-not-registered": { status: 403 },
  "inventory-origin-unavailable": { status: 502 },
  "no-published-tag": { status: 422 },
  "not-at-target-release": { status: 409 },
  "target-pinned-per-skill": { status: 409 },
  "manifest-not-recognised": { status: 409 },
  "ref-unresolvable": { status: 409 },
  "operation-unfinished": { status: 409 },
  "deploy-incomplete": { status: 502 },
  "local-diverged-from-tag": { status: 409 },
  "deployed-diverged-from-lock": { status: 409 },
  "deployed-unverifiable": { status: 409 },
  "deployed-unreadable": { status: 409 },
  "lockfile-malformed": { status: 409 },
  "deploy-in-progress": { status: 409 },
  "no-supported-tool": { status: 409 },
  "auth-required": { status: 502 },
  "destination-symlinked": { status: 409 },
  "tag-check-timed-out": TIMED_OUT,
  "deploy-timed-out": TIMED_OUT,
  "deploy-failed": { status: 502 },
  "deploy-not-started": { status: 502 },
};

export const retryOperationErrorResponses: ErrorTable<RetryTargetOperationError> =
  {
    "repo-not-registered": { status: 403 },
    "nothing-to-retry": { status: 409 },
    "retry-in-progress": { status: 409 },
    "deployed-diverged-from-lock": { status: 409 },
    "deployed-unverifiable": { status: 409 },
    "deployed-unreadable": { status: 409 },
    "lockfile-malformed": { status: 409 },
    "manifest-not-recognised": { status: 409 },
    "retry-incomplete": { status: 502 },
    "retry-timed-out": TIMED_OUT,
    "retry-failed": { status: 502 },
  };

export const removeErrorResponses: ErrorTable<RemoveDeployedSkillError> = {
  "unsupported-primitive-type": { status: 422 },
  "invalid-name": { status: 400 },
  "repo-not-registered": { status: 403 },
  "no-supported-tool": { status: 409 },
  "not-deployed": { status: 404 },
  "lockfile-malformed": { status: 409 },
  "ref-unresolvable": { status: 409 },
  "deployed-unreadable": { status: 409 },
  "deployed-diverged-from-lock": { status: 409 },
  "deployed-diverged-pinned-per-skill": { status: 409 },
  // What it costs now travels beside this refusal, never inside it (#364).
  "cost-not-acknowledged": { status: 409 },
  "remove-in-progress": { status: 409 },
  "manifest-not-recognised": { status: 409 },
  "operation-unfinished": { status: 409 },
  "remove-incomplete": { status: 502 },
  "remove-timed-out": TIMED_OUT,
  "remove-timed-out-unrecorded": TIMED_OUT,
  "remove-failed": { status: 502 },
};

// A failed check is an error, never an empty warning — the cockpit must tell
// "nothing to lose" apart from "we could not look".
export const removePreflightErrorResponses: ErrorTable<RemovePreflightError> = {
  "unsupported-primitive-type":
    removeErrorResponses["unsupported-primitive-type"],
  "invalid-name": removeErrorResponses["invalid-name"],
  "repo-not-registered": removeErrorResponses["repo-not-registered"],
  "no-supported-tool": removeErrorResponses["no-supported-tool"],
  "deployed-diverged-from-lock":
    removeErrorResponses["deployed-diverged-from-lock"],
  "deployed-diverged-pinned-per-skill":
    removeErrorResponses["deployed-diverged-pinned-per-skill"],
  "preflight-failed": { status: 502 },
};

export const updatePreviewErrorResponses: ErrorTable<UpdatePreviewError> = {
  "repo-not-registered": removeErrorResponses["repo-not-registered"],
  "no-supported-tool": removeErrorResponses["no-supported-tool"],
  "not-deployed": removeErrorResponses["not-deployed"],
  "lockfile-malformed": removeErrorResponses["lockfile-malformed"],
  "deployed-unreadable": deployErrorResponses["deployed-unreadable"],
  "inventory-not-configured": deployErrorResponses["inventory-not-configured"],
  "inventory-unreadable": deployErrorResponses["inventory-unreadable"],
  "no-published-tag": deployErrorResponses["no-published-tag"],
  "inventory-origin-unavailable":
    deployErrorResponses["inventory-origin-unavailable"],
  "ref-unresolvable": deployErrorResponses["ref-unresolvable"],
  "skill-not-in-release": { status: 422 },
  "destination-symlinked": deployErrorResponses["destination-symlinked"],
  "preview-failed": { status: 502 },
};

export const updateRunErrorResponses: ErrorTable<UpdateRunError> = {
  ...updatePreviewErrorResponses,
  "status-out-of-date": { status: 409 },
  "update-in-progress": deployErrorResponses["deploy-in-progress"],
  "operation-unfinished": deployErrorResponses["operation-unfinished"],
  "deployed-diverged-from-lock":
    deployErrorResponses["deployed-diverged-from-lock"],
  "deployed-unverifiable": deployErrorResponses["deployed-unverifiable"],
  "manifest-not-recognised": deployErrorResponses["manifest-not-recognised"],
  "update-incomplete": { status: 502 },
  "update-timed-out": TIMED_OUT,
  "update-failed": { status: 502 },
};

// Exhaustive by construction: the table above is keyed by the error union
// itself, so a new refusal cannot be missing from the allowlist.
export const refusalCodes = Object.keys(removePreflightErrorResponses) as [
  RemovePreflightError,
  ...RemovePreflightError[],
];

const HEADED_REPO_PATH_RESPONSES: ErrorTable<RepoPathError> = {
  missing: { status: 400 },
  relative: { status: 400 },
  "not-found": { status: 400 },
  "not-a-directory": { status: 400 },
};

export const connectErrorResponses: ErrorTable<ConnectInventoryError> = {
  ...HEADED_REPO_PATH_RESPONSES,
  "not-a-github-url": { status: 400 },
  "not-a-folder-path": { status: 400 },
  "url-carries-credentials": { status: 400 },
  "invalid-parent": { status: 400 },
  "destination-occupied": { status: 409 },
  "destination-partial-clone": { status: 409 },
  "clone-in-progress": { status: 409 },
  // GitHub answers a missing, a private and a mistyped repository the same
  // way, so those three share one class (#555).
  "clone-auth-failed": { status: 422 },
  "clone-unavailable": { status: 422 },
  "clone-failed": { status: 422 },
  "not-an-inventory": { status: 422 },
  scaffoldable: { status: 422 },
  "no-usable-origin": { status: 422 },
  "no-default-branch": { status: 422 },
};

export const scaffoldErrorResponses: ErrorTable<ScaffoldHarnessError> = {
  ...HEADED_REPO_PATH_RESPONSES,
  "not-a-repository": { status: 422 },
  "already-a-harness": { status: 409 },
  "path-occupied": { status: 409 },
  "no-default-branch": { status: 422 },
  "not-on-default-branch": { status: 409 },
  "not-offered": { status: 409 },
  busy: { status: 409 },
  "write-failed": { status: 422 },
  "commit-failed": { status: 422 },
  "push-rejected": { status: 422 },
  "push-offline": { status: 502 },
  "connect-failed": { status: 422 },
};

export const harnessErrorResponses: ErrorTable<HarnessStateError> = {
  "not-configured": { status: 409 },
  "no-usable-origin": { status: 422 },
};

export const releasePlanErrorResponses: ErrorTable<ReleasePlanError> = {
  ...harnessErrorResponses,
  "no-answer": { status: 409 },
};

export const publishReleaseErrorResponses: ErrorTable<PublishReleaseError> = {
  ...harnessErrorResponses,
  "no-answer": { status: 409 },
  "empty-delta": { status: 409 },
  "root-skill-file": { status: 409 },
  "already-released": { status: 409 },
  "plan-changed": { status: 409 },
  "publish-failed": { status: 502 },
  "publish-in-progress": { status: 409 },
};

export const promoteErrorResponses: ErrorTable<PromoteError> = {
  ...harnessErrorResponses,
  "invalid-skill": { status: 400 },
  "no-answer": { status: 409 },
  "skill-missing": { status: 422 },
  "destination-unsafe": { status: 409 },
  "push-elsewhere": { status: 422 },
  "source-changed": { status: 409 },
  "concurrent-change": { status: 409 },
  "extra-requests": { status: 409 },
  "proposed-by-other": { status: 409 },
  "promote-failed": { status: 502 },
  "promote-in-progress": { status: 409 },
};

export const proposalErrorResponses: ErrorTable<ProposalActionError> = {
  ...harnessErrorResponses,
  "invalid-skill": { status: 400 },
  "no-answer": { status: 409 },
  "review-unavailable": { status: 409 },
  "review-unknown": { status: 409 },
  "request-gone": { status: 409 },
  "extra-requests": { status: 409 },
  "request-exists": { status: 409 },
  "proposed-by-other": { status: 409 },
  "action-failed": { status: 502 },
};

// Every Harness write that reads the working tree refuses these alike.
const worktreeAmbiguityResponses: ErrorTable<WorktreeAmbiguity> = {
  "sparse-checkout": { status: 409 },
  "merge-in-progress": { status: 409 },
  "rebase-in-progress": { status: 409 },
  "unresolved-conflicts": { status: 409 },
  unreadable: { status: 409 },
};

export const withdrawErrorResponses: ErrorTable<WithdrawError> = {
  ...proposalErrorResponses,
  ...worktreeAmbiguityResponses,
  "destination-unsafe": { status: 409 },
  "destination-unreadable": { status: 409 },
  "push-elsewhere": promoteErrorResponses["push-elsewhere"],
  "withdraw-in-progress": { status: 409 },
  "branch-by-other": { status: 409 },
  "commit-email-missing": { status: 409 },
  "branch-authors-unknown": { status: 409 },
  "replace-failed": { status: 500 },
  "close-failed": { status: 502 },
  "branch-delete-failed": { status: 502 },
};

export const deletionErrorResponses: ErrorTable<PromoteDeletionError> = {
  ...harnessErrorResponses,
  "invalid-skill": promoteErrorResponses["invalid-skill"],
  "no-answer": { status: 409 },
  "confirmation-stale": { status: 409 },
  "not-deleted": { status: 422 },
  ...worktreeAmbiguityResponses,
  "push-elsewhere": promoteErrorResponses["push-elsewhere"],
  "source-changed": { status: 409 },
  "extra-requests": promoteErrorResponses["extra-requests"],
  "proposed-by-other": promoteErrorResponses["proposed-by-other"],
  "promote-failed": { status: 502 },
  "promote-in-progress": promoteErrorResponses["promote-in-progress"],
};

export const localDeletionErrorResponses: ErrorTable<DeleteLocalError> = {
  "not-configured": { status: 409 },
  "invalid-skill": { status: 400 },
  "already-gone": { status: 409 },
  "no-answer": { status: 409 },
  "confirmation-stale": { status: 409 },
  "destination-unsafe": { status: 409 },
  "destination-unreadable": { status: 409 },
  "delete-failed": { status: 500 },
  "delete-in-progress": { status: 409 },
};

export const restoreErrorResponses: ErrorTable<RestoreError> = {
  "not-configured": { status: 409 },
  "invalid-skill": { status: 400 },
  "head-moved": { status: 409 },
  "staged-changes": { status: 409 },
  "not-in-commit": { status: 422 },
  "destination-exists": { status: 409 },
  "destination-unsafe": { status: 409 },
  "destination-unreadable": { status: 409 },
  "source-unreadable": { status: 409 },
  ...worktreeAmbiguityResponses,
  "restore-in-progress": { status: 409 },
  "restore-failed": { status: 500 },
};

export const discardErrorResponses: ErrorTable<DiscardChangeError> = {
  "not-configured": { status: 409 },
  "invalid-skill": { status: 400 },
  ...worktreeAmbiguityResponses,
  "no-answer": { status: 409 },
  "already-proposed": { status: 409 },
  "nothing-to-discard": { status: 409 },
  "confirmation-stale": { status: 409 },
  "destination-unsafe": { status: 409 },
  "destination-unreadable": { status: 409 },
  "discard-in-progress": { status: 409 },
  "discard-failed": { status: 500 },
};

export const releaseWithdrawalErrorResponses: ErrorTable<WithdrawFromReleaseError> =
  {
    "not-configured": { status: 409 },
    "invalid-skill": { status: 400 },
    ...worktreeAmbiguityResponses,
    "no-answer": { status: 409 },
    "not-pending-release": { status: 409 },
    "proposal-open": { status: 409 },
    "confirmation-stale": { status: 409 },
    "clone-not-current": { status: 409 },
    offline: { status: 502 },
    "push-elsewhere": promoteErrorResponses["push-elsewhere"],
    "withdraw-in-progress": { status: 409 },
    "withdraw-failed": { status: 502 },
  };

// Never a filesystem message, and never the path it read (#576).
export const importErrorResponses: ErrorTable<ImportSkillError> = {
  "not-configured": { status: 409 },
  "source-unreadable": { status: 422 },
  // 403: outside the home ceiling, and the reply names no path.
  "outside-root": { status: 403 },
  "deployed-copy": { status: 409 },
  "origin-unproven": { status: 409 },
  "missing-manifest": { status: 422 },
  "invalid-frontmatter": { status: 422 },
  "empty-description": { status: 422 },
  "invalid-name": { status: 400 },
  "name-taken": { status: 409 },
  "not-found": { status: 422 },
  "not-a-directory": { status: 422 },
  "destination-exists": { status: 409 },
  "unsafe-link": { status: 422 },
  "hard-linked-file": { status: 422 },
  "special-file": { status: 422 },
  "too-many-files": { status: 422 },
  "too-large": { status: 422 },
  "source-changed": { status: 409 },
  "copy-failed": { status: 500 },
  "destination-unsafe": { status: 409 },
  "harness-copy-uncommitted": { status: 409 },
  "harness-unreadable": { status: 422 },
  "nothing-to-carry-back": { status: 409 },
};

// Never a filesystem message, and never the path it wrote.
// A broken field never gets here: the request schema refuses it first. Only
// core sees the front matter the file keeps, so it refuses that file's size.
type ImportPromptRefusal = Exclude<
  ImportPromptError,
  Exclude<PromptFieldProblem, "long-text">
>;

export const importPromptErrorResponses: ErrorTable<ImportPromptRefusal> = {
  "long-text": { status: 422 },
  "not-configured": { status: 409 },
  "destination-unsafe": { status: 409 },
  "destination-unreadable": { status: 409 },
  "import-in-progress": { status: 409 },
  "write-failed": { status: 500 },
};

export const isImportPromptRefusal = (
  code: ImportPromptError,
): code is ImportPromptRefusal =>
  Object.hasOwn(importPromptErrorResponses, code);

export const readPromptErrorResponses: ErrorTable<ReadPromptError> = {
  "not-configured": importPromptErrorResponses["not-configured"],
  "invalid-name": { status: 400 },
  "prompt-missing": { status: 404 },
  "destination-unsafe": importPromptErrorResponses["destination-unsafe"],
  "destination-unreadable":
    importPromptErrorResponses["destination-unreadable"],
};

// As on the import, a broken field never gets here.
type EditPromptRefusal = Exclude<
  EditPromptError,
  Exclude<PromptFieldProblem, "long-text">
>;

export const editPromptErrorResponses: ErrorTable<EditPromptRefusal> = {
  ...importPromptErrorResponses,
  "prompt-missing": readPromptErrorResponses["prompt-missing"],
  "prompt-changed": { status: 409 },
};

export const isEditPromptRefusal = (
  code: EditPromptError,
): code is EditPromptRefusal => Object.hasOwn(editPromptErrorResponses, code);

// A per-skill refusal is data in a 200; only a refused run is a status.
export const importLocalEditsErrorResponses: ErrorTable<LocalEditsError> = {
  "not-configured": { status: 409 },
  "repo-not-registered": { status: 403 },
  "unfinished-operation": { status: 409 },
  "target-unreadable": { status: 422 },
  "import-in-progress": { status: 409 },
};

export const chooseFolderErrorResponses: ErrorTable<ChooseFolderError> = {
  "chooser-unavailable": { status: 409 },
  "chooser-busy": { status: 409 },
  "chooser-failed": { status: 502 },
};

// `name-exists` carries the existing category's name beside its code.
export const categoryErrorResponses: ErrorTable<CategoryError> = {
  "name-invalid": { status: 400 },
  "name-exists": { status: 409 },
  "category-not-found": { status: 404 },
  "item-not-found": { status: 404 },
  "not-configured": { status: 409 },
  "categories-unreadable": { status: 500 },
};
