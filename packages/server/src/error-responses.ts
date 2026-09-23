// Every error-code-to-HTTP-status table the routes answer refusals from.
// Business rules live in core; these tables only choose status codes, and the
// sentence for every code lives in its feature copy module in `packages/web`
// (ADR-0025).

import type {
  ChooseFolderError,
  ConnectInventoryError,
  DeleteLocalSkillError,
  DeploySkillError,
  HarnessStateError,
  ImportSkillError,
  PromoteDeletionError,
  PromoteSkillError,
  ProposalActionError,
  PublishReleaseError,
  ReleasePlanError,
  RemoveDeployedSkillError,
  RemovePreflightError,
  RepoPathError,
  RestoreSkillError,
  RetryTargetOperationError,
  ScaffoldHarnessError,
  UpdatePreviewError,
  UpdateRunError,
} from "@maestro/core";
import type { ErrorTable } from "./error-table";

// The sentence for every code lives in `deploy-state/notice-copy.ts` (ADR-0025).
export const deployErrorResponses: ErrorTable<DeploySkillError> = {
  "unsupported-primitive-type": { status: 422 },
  "invalid-name": { status: 400 },
  "unknown-skill": { status: 404 },
  "inventory-not-configured": { status: 409 },
  "inventory-unreadable": { status: 503 },
  "repo-not-registered": { status: 403 },
  "inventory-origin-unavailable": { status: 502 },
  "no-published-tag": { status: 422 },
  // 409: the skill exists, and moving the whole target to the release that
  // holds it is the reader's next step (ADR-0031).
  "not-at-target-release": { status: 409 },
  "target-pinned-per-skill": { status: 409 },
  "manifest-not-recognised": { status: 409 },
  "ref-unresolvable": { status: 409 },
  "operation-unfinished": { status: 409 },
  // 502: apm ran and what landed is not what was asked for, so the outcome is
  // apm's to answer for — and the retry is on the target card (#951).
  "deploy-incomplete": { status: 502 },
  "local-diverged-from-tag": { status: 409 },
  "deployed-diverged-from-lock": { status: 409 },
  "deployed-unverifiable": { status: 409 },
  "deployed-unreadable": { status: 409 },
  "lockfile-malformed": { status: 409 },
  "deploy-in-progress": { status: 409 },
  // 409, not 502: nothing to install is a precondition the user resolves,
  // not an apm failure (ADR-0011, #131).
  "no-supported-tool": { status: 409 },
  // 502, not 401: the failure is between apm and GitHub, not Maestro auth (#119).
  "auth-required": { status: 502 },
  // 409, not 502: apm refused on purpose — a conflict, not a failure (#180).
  "destination-symlinked": { status: 409 },
  // 409, not 502: apm installed something, and the package shape is the
  // user's to correct (#358).
  "deploy-failed": { status: 502 },
};

// The way out of an operation that never finished; its sentences sit beside the
// deploy and remove ones in `deploy-state/notice-copy.ts`.
export const retryOperationErrorResponses: ErrorTable<RetryTargetOperationError> =
  {
    "repo-not-registered": { status: 403 },
    // 409: the target has nothing unfinished, so the offer the reader acted on
    // is out of date.
    "nothing-to-retry": { status: 409 },
    "retry-in-progress": { status: 409 },
    "deployed-diverged-from-lock": { status: 409 },
    "deployed-unverifiable": { status: 409 },
    "deployed-unreadable": { status: 409 },
    "lockfile-malformed": { status: 409 },
    "manifest-not-recognised": { status: 409 },
    "retry-incomplete": { status: 502 },
    "retry-failed": { status: 502 },
  };

// The sentences live beside the deploy ones in `deploy-state/notice-copy.ts`:
// six codes refuse both, and each states its own way through.
export const removeErrorResponses: ErrorTable<RemoveDeployedSkillError> = {
  "unsupported-primitive-type": { status: 422 },
  "invalid-name": { status: 400 },
  "repo-not-registered": { status: 403 },
  // 409, mirroring the deploy table (ADR-0011).
  "no-supported-tool": { status: 409 },
  "not-deployed": { status: 404 },
  "lockfile-malformed": { status: 409 },
  "ref-unresolvable": { status: 409 },
  "deployed-unreadable": { status: 409 },
  // 409, as on the deploy table: apm would abort on the edited file after
  // deleting the rest, so the copy is the user's to reset first (#775).
  "deployed-diverged-from-lock": { status: 409 },
  "deployed-diverged-pinned-per-skill": { status: 409 },
  // 409: the request is well-formed, but the copy on disk is not the one it
  // agreed to lose — either it changed since, or nothing was agreed at all.
  // What it costs now travels beside this refusal, never inside it (#364).
  "cost-not-acknowledged": { status: 409 },
  "remove-in-progress": { status: 409 },
  "manifest-not-recognised": { status: 409 },
  "operation-unfinished": { status: 409 },
  // 502: apm ran and the skill, its files or its name are still there (#951).
  "remove-incomplete": { status: 502 },
  // 502: apm ran and didn't prove removal, so the outcome is unknown.
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

// The sentences live beside the deploy ones in `deploy-state/notice-copy.ts`:
// every code but the catch-all is already a refusal one of them can state.
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
  // 422, like no-published-tag: the release the target would adopt does not
  // hold the skill, and publishing one that does is the reader's next step.
  "skill-not-in-release": { status: 422 },
  "preview-failed": { status: 502 },
};

// The confirm's own refusals. Every code it shares with deploy, remove or the
// preview is answered the same way; its sentences live beside theirs in
// `deploy-state/notice-copy.ts` (#954).
export const updateRunErrorResponses: ErrorTable<UpdateRunError> = {
  ...updatePreviewErrorResponses,
  // 409: the state the reader confirmed is not the state on disk, and a fresh
  // preview is the way through.
  "status-out-of-date": { status: 409 },
  "update-in-progress": deployErrorResponses["deploy-in-progress"],
  "operation-unfinished": deployErrorResponses["operation-unfinished"],
  "deployed-diverged-from-lock":
    deployErrorResponses["deployed-diverged-from-lock"],
  "deployed-unverifiable": deployErrorResponses["deployed-unverifiable"],
  "manifest-not-recognised": deployErrorResponses["manifest-not-recognised"],
  "destination-symlinked": deployErrorResponses["destination-symlinked"],
  // 502: apm ran and what landed is not what was asked for; the retry is on
  // the target card (#951).
  "update-incomplete": { status: 502 },
  "update-failed": { status: 502 },
};

// Exhaustive by construction: the table above is keyed by the error union
// itself, so a new refusal cannot be missing from the allowlist.
export const refusalCodes = Object.keys(removePreflightErrorResponses) as [
  RemovePreflightError,
  ...RemovePreflightError[],
];

// The same four failures under a Notice heading, which already names the
// subject. The sentences live in `inventory/connect-notice.ts` (#465,
// decision 9).
const HEADED_REPO_PATH_RESPONSES: ErrorTable<RepoPathError> = {
  missing: { status: 400 },
  relative: { status: 400 },
  "not-found": { status: 400 },
  "not-a-directory": { status: 400 },
};

// Path-shape failures are 400; a real directory that isn't an inventory is
// 422; a destination something else already holds is a 409 the user clears by
// choosing elsewhere. The sentences live in `inventory/connect-notice.ts`.
export const connectErrorResponses: ErrorTable<ConnectInventoryError> = {
  ...HEADED_REPO_PATH_RESPONSES,
  "not-a-github-url": { status: 400 },
  "url-carries-credentials": { status: 400 },
  "invalid-parent": { status: 400 },
  "destination-occupied": { status: 409 },
  "destination-partial-clone": { status: 409 },
  "clone-in-progress": { status: 409 },
  // GitHub answers a missing, a private and a mistyped repository the same
  // way, so those three share one class (#555).
  "clone-auth-failed": { status: 422 },
  "clone-unavailable": { status: 422 },
  // Nothing about the repository was in question, so nothing here blames it.
  "clone-failed": { status: 422 },
  "not-an-inventory": { status: 422 },
  // A refusal that carries an offer: the body adds the path the scaffold would
  // write to (#556).
  scaffoldable: { status: 422 },
  "no-usable-origin": { status: 422 },
  "no-default-branch": { status: 422 },
};

// Accepting the offer the connect table hands out. A push the remote refused
// is a 422 like any other precondition the user resolves — Maestro pre-checks
// no permission, so it has nothing earlier to say (#556).
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

// Mirrors the connect table: nothing connected is a 409, a connected clone
// whose origin apm could never resolve is a 422. The sentences live in
// `harness/notice-copy.ts`.
export const harnessErrorResponses: ErrorTable<HarnessStateError> = {
  "not-configured": { status: 409 },
  "no-usable-origin": { status: 422 },
};

// A plan shares the state read's two refusals and adds one: `no-answer` is a
// remote nothing has fetched, so there is no delta to plan against. A 409, like
// nothing-connected — a precondition the author clears with Refresh.
export const releasePlanErrorResponses: ErrorTable<ReleasePlanError> = {
  ...harnessErrorResponses,
  "no-answer": { status: 409 },
};

// Confirmation is its own remote read, so its `no-answer` covers both a
// failed re-fetch and a push that could not reach the remote — either way,
// nothing was published and a retry is the way forward (#520).
export const publishReleaseErrorResponses: ErrorTable<PublishReleaseError> = {
  ...harnessErrorResponses,
  "no-answer": { status: 409 },
  // Nothing to release is a precondition, not a dead end: the reply carries
  // the recomputed plan the author's dialog would show instead (#970).
  "empty-delta": { status: 409 },
  // Both are ordinary races, not dead ends: nothing was overwritten, and the
  // reply carries the recomputed plan the author confirms instead (#521).
  "already-released": { status: 409 },
  "plan-changed": { status: 409 },
  "publish-failed": { status: 502 },
  "publish-in-progress": { status: 409 },
};

// Promotion shares the state read's two refusals. Nothing here is a dead end:
// every refusal leaves the clone as it was, so a retry is another press (#577).
export const promoteErrorResponses: ErrorTable<PromoteSkillError> = {
  ...harnessErrorResponses,
  "invalid-skill": { status: 400 },
  // The rule that closes Release: with no answer from the remote, the tip this
  // commit would be built on is unknown.
  "no-answer": { status: 409 },
  "skill-missing": { status: 422 },
  "push-elsewhere": { status: 422 },
  "source-changed": { status: 409 },
  "concurrent-change": { status: 409 },
  // Two open requests match the branch: which proposal an update belongs to is
  // the author's to settle on GitHub (#827).
  "extra-requests": { status: 409 },
  "promote-failed": { status: 502 },
  "promote-in-progress": { status: 409 },
};

// The three GitHub-side mutations. Every refusal leaves both the clone and the
// pull request as they were, so a retry is another press (#827).
export const proposalErrorResponses: ErrorTable<ProposalActionError> = {
  ...harnessErrorResponses,
  "invalid-skill": { status: 400 },
  "no-answer": { status: 409 },
  // A capability that cannot answer and one whose answer proves nothing are
  // both preconditions the author clears with Retry check, never dead ends.
  "review-unavailable": { status: 409 },
  "review-unknown": { status: 409 },
  "request-gone": { status: 409 },
  "extra-requests": { status: 409 },
  "request-exists": { status: 409 },
  "action-failed": { status: 502 },
};

// Promotion's refusals plus the ones only a removal has: a confirmation the
// remote moved past, a movement that is no longer a deletion, and four working
// trees that cannot answer (#580).
export const deletionErrorResponses: ErrorTable<PromoteDeletionError> = {
  ...harnessErrorResponses,
  "invalid-skill": promoteErrorResponses["invalid-skill"],
  "no-answer": { status: 409 },
  "confirmation-stale": { status: 409 },
  "not-deleted": { status: 422 },
  "sparse-checkout": { status: 409 },
  "merge-in-progress": { status: 409 },
  "rebase-in-progress": { status: 409 },
  "unresolved-conflicts": { status: 409 },
  unreadable: { status: 409 },
  "push-elsewhere": promoteErrorResponses["push-elsewhere"],
  "source-changed": { status: 409 },
  "extra-requests": promoteErrorResponses["extra-requests"],
  "promote-failed": { status: 502 },
  "promote-in-progress": promoteErrorResponses["promote-in-progress"],
};

// Removing a skill that exists nowhere else. Nothing here reaches GitHub, so
// none of the remote refusals appear: every code is a local precondition the
// author clears and presses again (#798).
export const localDeletionErrorResponses: ErrorTable<DeleteLocalSkillError> = {
  "not-configured": { status: 409 },
  "invalid-skill": { status: 400 },
  "already-gone": { status: 409 },
  "not-local-only": { status: 409 },
  "destination-unsafe": { status: 409 },
  "delete-failed": { status: 500 },
  "delete-in-progress": { status: 409 },
};

// Putting a deleted skill folder back from local HEAD. Nothing here reaches
// GitHub either: every code is a local precondition the author clears and
// presses again (ADR-0030, #888).
export const restoreErrorResponses: ErrorTable<RestoreSkillError> = {
  "not-configured": { status: 409 },
  "invalid-skill": { status: 400 },
  "head-moved": { status: 409 },
  "staged-changes": { status: 409 },
  "not-in-commit": { status: 422 },
  "destination-exists": { status: 409 },
  "destination-unsafe": { status: 409 },
  "destination-unreadable": { status: 409 },
  "source-unreadable": { status: 409 },
  // The same four working trees the deletion route refuses under, answered the
  // same way: a state the author leaves, then presses again (#580).
  "sparse-checkout": deletionErrorResponses["sparse-checkout"],
  "merge-in-progress": deletionErrorResponses["merge-in-progress"],
  "rebase-in-progress": deletionErrorResponses["rebase-in-progress"],
  "unresolved-conflicts": deletionErrorResponses["unresolved-conflicts"],
  unreadable: deletionErrorResponses.unreadable,
  "restore-in-progress": { status: 409 },
  "restore-failed": { status: 500 },
};

// The sentences live in `harness/notice-copy.ts` — never a filesystem message,
// and never the path it read (#576, security.md).
export const importErrorResponses: ErrorTable<ImportSkillError> = {
  "not-configured": { status: 409 },
  "source-unreadable": { status: 422 },
  // 403: outside the home ceiling, and the reply names no path.
  "outside-root": { status: 403 },
  "deployed-copy": { status: 409 },
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
  // The harness moved under the author, like name-taken and source-changed.
  "harness-copy-uncommitted": { status: 409 },
  // In bounds and connected, but unreadable — 422.
  "harness-unreadable": { status: 422 },
  "nothing-to-carry-back": { status: 409 },
};

// The sentences live in `ui/path-field-copy.ts`. 502 for a failure: the helper
// ran and its answer did not hold (ADR-0032 §6).
export const chooseFolderErrorResponses: ErrorTable<ChooseFolderError> = {
  "chooser-unavailable": { status: 409 },
  "chooser-busy": { status: 409 },
  "chooser-failed": { status: 502 },
};
