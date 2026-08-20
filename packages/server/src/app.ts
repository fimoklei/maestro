import { homedir } from "node:os";
import {
  ApmCliDriver,
  type BrowseError,
  BrowseFilesystem,
  type BrowseSuccess,
  BulkDeploySkills,
  BulkRemoveDeployedSkill,
  CheckVersionDrift,
  ConfigStore,
  ConnectInventory,
  type ConnectInventoryError,
  CopySkillFolder,
  DeployedCleanupAdapter,
  DeployedContentAdapter,
  DeployedLocation,
  DeployedRefAdapter,
  DeploySkill,
  type DeploySkillError,
  GitCloneAdapter,
  GitHarnessScaffoldAdapter,
  GlobalDeployStateReader,
  HarnessFreshnessStore,
  HarnessGitAdapter,
  type HarnessStateError,
  type HarnessStateResult,
  ImportSkill,
  type ImportSkillError,
  InFlightLocks,
  InventoryGitAdapter,
  InventoryReader,
  isRepositoryRoot,
  NodeCopyTreeFs,
  NodeFileSystem,
  type PromoteDeletionError,
  type PromoteDeletionResult,
  PromoteSkill,
  PromoteSkillDeletion,
  type PromoteSkillError,
  type PromoteSkillResult,
  PublishRelease,
  type PublishReleaseError,
  type PublishReleaseResult,
  probeHead,
  ReadHarnessState,
  RecordedPackageAdapter,
  Registry,
  type ReleasePlanError,
  type ReleasePlanResult,
  RemoveDeployedSkill,
  type RemoveDeployedSkillError,
  type RemovePreflightError,
  type RepoPathError,
  readConfiguredGitOriginUrl,
  readGitOriginUrl,
  resolveApmGlobalRoot,
  resolveApmScratchCwd,
  resolveDefaultBranch,
  resolveInventoryPath,
  resolveMaestroConfigPath,
  ScaffoldHarness,
  type ScaffoldHarnessError,
  ScaffoldOffers,
  ToolPresenceAdapter,
} from "@maestro/core";
import { type Context, Hono } from "hono";
import { z } from "zod";
import type { ErrorTable } from "./error-table";
import { originHostGuard } from "./origin-host-guard";

const registerBodySchema = z.object({ path: z.string() });

// `parent` is the folder a cloned Harness lands in — absent means the home
// ceiling, and it is ignored entirely on the local-path route (#555).
const connectBodySchema = z.object({
  path: z.string(),
  parent: z.string().optional(),
});

const browseBodySchema = z.object({ path: z.string() });

// The destination is never sent: the connected Harness is resolved server-side.
// `name` absent asks for Maestro's proposal (#576).
const importBodySchema = z.object({
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

const deployBodySchema = z.object({
  // "skills only" is a core business rule, so a non-skill type is a 422, not a 400.
  type: z.string(),
  name: z.string(),
  target: targetSchema,
  // Deliberate override of the destination guard (ADR-0006, #66).
  force: z.boolean().optional(),
});

// No batch-wide force: a diverged copy always comes back as an attention row,
// overridden only per item via the single-deploy route (#292).
const bulkDeployBodySchema = z.object({
  names: z.array(z.string()).min(1),
  target: targetSchema,
});

const removeBodySchema = z.object({
  type: z.string(),
  name: z.string(),
  target: targetSchema,
  confirmedReclaimToken: consentTokenSchema,
  confirmedRemovalReceipt: consentTokenSchema,
});

// `previousTag` and `revision` prove the confirmation is against the plan the
// author saw: the server refuses when the freshly read remote no longer agrees
// with either, and computes what to tag from its own read (#520, #521).
const publishReleaseBodySchema = z.object({
  step: z.enum(["major", "minor", "patch"]),
  previousTag: z.string().nullable(),
  previousTagCommit: z.string().nullable(),
  revision: z.string(),
});

// A name, never a path: the harness the skill belongs to is resolved
// server-side, so the browser cannot point a promotion at another repository.
const promoteBodySchema = z.object({ name: z.string() });

// The confirmation the author gave: the skill, and the origin/HEAD tree hash
// the row stated it against. Compared against a freshly fetched remote, never
// used as the thing to remove (#580).
const deletionBodySchema = z.object({
  name: z.string(),
  seenRemoteTree: z.string(),
});

const PROMOTE_BODY_MESSAGE = "Expected a JSON body with a skill name.";

const DELETION_BODY_MESSAGE =
  "Expected a JSON body with a skill name and the origin/HEAD tree it was confirmed against.";

const RELEASE_BODY_MESSAGE =
  'Expected a JSON body with a version step and the plan\'s previous tag, that tag\'s commit, and its revision ({ step: "major" | "minor" | "patch", previousTag: string | null, previousTagCommit: string | null, revision: string }).';

const PATH_BODY_MESSAGE = "Expected a JSON body with a path.";

const IMPORT_BODY_MESSAGE =
  "Expected a JSON body with a source folder and an optional name.";

const TARGET_BODY_MESSAGE =
  'Expected a JSON body with type, name, and target ({ kind: "repo", repoPath } or { kind: "global" }).';

const BULK_BODY_MESSAGE =
  'Expected a JSON body with a non-empty names array and a target ({ kind: "repo", repoPath } or { kind: "global" }).';

// Read through the same InventoryReader the primitives route uses, so the two
// cannot drift. Degrades to 0: a read failure must not turn an
// already-successful connect or scaffold into a 500.
async function countPrimitives(inventory: InventoryReader): Promise<number> {
  try {
    const read = await inventory.read();
    return read.ok ? read.primitives.length : 0;
  } catch {
    return 0;
  }
}

// Every POST route's front door: unparsable JSON and a wrong shape are the
// same 400, so a route only supplies its schema and its own wording.
async function parseBody<T>(
  c: Context,
  schema: z.ZodType<T>,
  message: string,
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  const body = await c.req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      response: c.json({ error: "invalid-body", message }, 400),
    };
  }
  return { ok: true, data: parsed.data };
}

// A failed check is a 200 the web maps to a badge, never an HTTP error — a
// screen reading "up-to-date" when the check failed would falsely reassure.
const driftFailureBody = (result: { reason?: "unverified" }) =>
  result.reason
    ? { ok: false as const, reason: result.reason }
    : { ok: false as const };

// Business rules live in core; this table only chooses status codes and
// readable messages (none echo paths or raw apm output).
const deployErrorResponses: ErrorTable<DeploySkillError> = {
  "unsupported-primitive-type": {
    status: 422,
    message: "Only skills can be deployed yet.",
  },
  "invalid-name": {
    status: 400,
    message: "Skill name must be a lowercase slug.",
  },
  "unknown-skill": {
    status: 404,
    message: "That skill is not in the inventory.",
  },
  "inventory-not-configured": {
    status: 409,
    message: "No inventory is configured. Set the Harness source path.",
  },
  "repo-not-registered": {
    status: 403,
    message: "That repo is not registered with Maestro.",
  },
  "inventory-origin-unavailable": {
    status: 502,
    message:
      "The inventory clone's origin remote is missing, unreadable, or in a form apm cannot resolve. Maestro deploys from GitHub tags, so it needs a GitHub origin over https or ssh.",
  },
  "no-published-tag": {
    status: 422,
    message:
      "No published tag contains this skill. Tag and push the central harness first.",
  },
  "local-diverged-from-tag": {
    status: 409,
    message:
      "The local skill differs from its latest published tag. Tag and push the change first.",
  },
  "deployed-diverged-from-lock": {
    status: 409,
    message:
      "The deployed copy has local changes that never went through central. Updating discards them and reinstalls at the latest tag.",
  },
  "deployed-unverifiable": {
    status: 409,
    message:
      "This copy predates content tracking, so local changes can't be checked. Updating reinstalls fresh at the latest tag; any local changes are discarded.",
  },
  "deployed-unreadable": {
    status: 409,
    message:
      "The deployed copy exists but could not be read. Check its permissions and that it is a directory, then try again.",
  },
  "lockfile-malformed": {
    status: 409,
    message:
      "The repo's lockfile (apm.lock.yaml) is present but could not be parsed. Fix or remove it, then try again.",
  },
  "deploy-in-progress": {
    status: 409,
    message: "A deploy to this repo is already running. Wait for it to finish.",
  },
  "no-supported-tool": {
    // 409, not 502: nothing to install is a precondition the user resolves,
    // not an apm failure (ADR-0011, #131).
    status: 409,
    message:
      "No supported tool (Claude Code or Codex) was found on this machine, so there is nothing to deploy to globally.",
  },
  "auth-required": {
    // 502, not 401: the failure is between apm and GitHub, not Maestro auth (#119).
    status: 502,
    message:
      "GitHub authentication is missing or expired. Run 'gh auth login' (or set GITHUB_TOKEN) and try again.",
  },
  "destination-symlinked": {
    // 409, not 502: apm refused on purpose — a conflict, not a failure (#180).
    status: 409,
    message:
      "The skill's destination directory is a symlink, and apm refuses to deploy into one. Replace that per-skill link with a real directory, or move the link one level up so the whole skills directory is the symlink (for example .claude/skills -> .agents/skills), then try again.",
  },
  "deployed-unsupported-package-type": {
    // 409, not 502: apm installed something, and the package shape is the
    // user's to correct (#358).
    status: 409,
    message:
      "apm installed this package but recorded it as a type Maestro cannot manage as a skill. Its files were left in place. Correct the package shape in the harness, release a corrected tag, and deploy again.",
  },
  "deploy-recorded-invalid": {
    status: 502,
    message:
      "apm recorded this deployment as invalid and placed no files, even though it reported success. Fix the package shape in the harness (a skill needs a SKILL.md), release a corrected tag, and deploy again.",
  },
  "deploy-unverified": {
    status: 502,
    message:
      "apm reported the install as done, but Maestro could not confirm it from the lockfile (apm.lock.yaml), so the deploy is not treated as proven. Check the target's lockfile, then try again.",
  },
  "deploy-failed": {
    status: 502,
    message: "The deploy could not be completed. Check apm and try again.",
  },
};

const removeErrorResponses: ErrorTable<RemoveDeployedSkillError> = {
  "unsupported-primitive-type": {
    status: 422,
    message: "Only skills can be removed yet.",
  },
  "invalid-name": {
    status: 400,
    message: "Skill name must be a lowercase slug.",
  },
  "repo-not-registered": {
    status: 403,
    message: "That repo is not registered with Maestro.",
  },
  "no-supported-tool": {
    // 409, mirroring the deploy table (ADR-0011).
    status: 409,
    message:
      "No supported tool (Claude Code or Codex) was found on this machine, so there is no global deployment to remove.",
  },
  "not-deployed": {
    status: 404,
    message:
      "That skill is not deployed on this target, so there is nothing to remove.",
  },
  "lockfile-malformed": {
    status: 409,
    message:
      "The repo's lockfile (apm.lock.yaml) is present but could not be parsed, so Maestro cannot tell apm what to remove. Fix or remove it, then try again.",
  },
  "ref-unresolvable": {
    status: 409,
    message:
      "The lockfile entry for this skill does not name it the way a Maestro deploy would, so the package reference apm needs cannot be trusted to point at it. Remove it with apm directly.",
  },
  "deployed-unreadable": {
    status: 409,
    message:
      "The deployed copy exists but could not be read, so Maestro cannot tell whether removing it would delete local changes. Check its permissions and that it is a directory, then try again.",
  },
  "cost-not-acknowledged": {
    // 409: the request is well-formed, but the copy on disk is not the one it
    // agreed to lose — either it changed since, or nothing was agreed at all.
    // What it costs now travels beside this message, never inside it (#364).
    status: 409,
    message:
      "Maestro checked the deployed copy again, and this request has not agreed to what removing it would delete now. Nothing was removed — confirm what the check found to go ahead.",
  },
  "remove-in-progress": {
    status: 409,
    message:
      "Another change to this repo is already running. Wait for it to finish.",
  },
  "remove-failed": {
    // 502: apm ran and didn't prove removal, so the outcome is unknown.
    status: 502,
    message: "apm did not confirm the removal. Check apm and try again.",
  },
};

// A failed check is an error, never an empty warning — the cockpit must tell
// "nothing to lose" apart from "we could not look".
const removePreflightErrorResponses: ErrorTable<RemovePreflightError> = {
  "unsupported-primitive-type":
    removeErrorResponses["unsupported-primitive-type"],
  "invalid-name": removeErrorResponses["invalid-name"],
  "repo-not-registered": removeErrorResponses["repo-not-registered"],
  "no-supported-tool": removeErrorResponses["no-supported-tool"],
  "preflight-failed": {
    status: 502,
    message:
      "Maestro could not check the deployed copy for local changes. Check the repo's permissions and try again.",
  },
};

// Exhaustive by construction: the table above is keyed by the error union
// itself, so a new refusal cannot be missing from the allowlist.
const refusalCodes = Object.keys(removePreflightErrorResponses) as [
  RemovePreflightError,
  ...RemovePreflightError[],
];

// One skill, many targets — the mirror image of the bulk-deploy body. Each
// target carries its own preflight answer: the token that authorises its
// reclaim, or the allowlisted code that takes it out of the run.
const bulkRemoveBodySchema = z.object({
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

const repoPathErrorMessages: Record<
  RepoPathError | "central-inventory",
  string
> = {
  missing: "Path is required.",
  relative: "Path must be an absolute path.",
  "not-found": "No directory exists at that path.",
  "not-a-directory": "That path is not a directory.",
  "central-inventory":
    "The central inventory cannot be registered as a consuming repo.",
};

// A malformed path is a 400 wherever it arrives, so every path-taking table
// spreads this rather than re-spelling it.
const REPO_PATH_RESPONSES: ErrorTable<RepoPathError> = {
  missing: { status: 400, message: repoPathErrorMessages.missing },
  relative: { status: 400, message: repoPathErrorMessages.relative },
  "not-found": { status: 400, message: repoPathErrorMessages["not-found"] },
  "not-a-directory": {
    status: 400,
    message: repoPathErrorMessages["not-a-directory"],
  },
};

// Path-shape failures are 400; a real directory that isn't an inventory is
// 422; a destination something else already holds is a 409 the user clears by
// choosing elsewhere. No message echoes the path — it may be a misconfigured
// secret.
const connectErrorResponses: ErrorTable<ConnectInventoryError> = {
  ...REPO_PATH_RESPONSES,
  "not-a-github-url": {
    status: 400,
    message:
      "That is not a GitHub repository URL. Maestro clones a Harness from a GitHub repository over https or ssh, or connects a local clone by its path.",
  },
  "url-carries-credentials": {
    status: 400,
    message:
      "That URL carries a username or token. Maestro never stores credentials, and git would write them into the clone. Paste the plain repository URL and let your own git credentials do the rest.",
  },
  "invalid-parent": {
    status: 400,
    message:
      "That is not a folder Maestro can clone into. Choose an existing folder inside your home area, and the Harness will land in it under its own name.",
  },
  "destination-occupied": {
    status: 409,
    message:
      "Something else already sits where that Harness would land. Maestro never renames or deletes what it finds, so choose another folder to clone into.",
  },
  "destination-partial-clone": {
    status: 409,
    message:
      "A half-finished clone is already there, left by an interrupted attempt. Maestro left it untouched: delete that folder yourself, or clone into another one.",
  },
  "clone-in-progress": {
    status: 409,
    message:
      "Maestro is already cloning that Harness into that folder. Wait for it to finish, then try again.",
  },
  // GitHub answers a missing, a private and a mistyped repository the same
  // way, so those three share one class (#555).
  "clone-auth-failed": {
    status: 422,
    message:
      "Git could not prove who you are to GitHub. Maestro uses your own git credentials and never stores any, so sign in with git (or add your SSH key) and try again.",
  },
  "clone-unavailable": {
    status: 422,
    message:
      "That repository is not available to you. It may not exist, may be private, or the URL may be mistyped — GitHub answers all three the same way, so Maestro will not guess which.",
  },
  // Nothing about the repository was in question, so nothing here blames it.
  "clone-failed": {
    status: 422,
    message:
      "Git could not finish the clone. That is usually local — no disk space, no write access to the folder, or a connection that dropped. Check those and try again.",
  },
  "not-an-inventory": {
    status: 422,
    message: "That directory has no apm.yml, so it is not an inventory.",
  },
  // A refusal that carries an offer: the body adds the path the scaffold would
  // write to (#556).
  scaffoldable: {
    status: 422,
    message:
      "That GitHub repository has no apm.yml, so it is not a Harness yet. Maestro can scaffold the canonical empty Harness into it and push that first commit to the repository's default branch.",
  },
  "no-usable-origin": {
    status: 422,
    message:
      "That folder has an apm.yml, but its git origin is missing, unreadable, or in a form apm cannot resolve. Deploys read versions from GitHub tags, so point Maestro at a clone whose origin is a GitHub repo over https or ssh.",
  },
  "no-default-branch": {
    status: 422,
    message:
      "That folder is a Harness, but Maestro cannot tell which branch its origin treats as the default, and it will not guess one. Run `git fetch origin` and `git remote set-head origin --auto` in the clone, then connect again.",
  },
};

// Accepting the offer the connect table hands out. A push the remote refused
// is a 422 like any other precondition the user resolves — Maestro pre-checks
// no permission, so it has nothing earlier to say (#556).
const scaffoldErrorResponses: ErrorTable<ScaffoldHarnessError> = {
  ...REPO_PATH_RESPONSES,
  "not-a-repository": {
    status: 422,
    message:
      "That folder is not a GitHub repository clone, so there is nothing to scaffold a Harness into.",
  },
  "already-a-harness": {
    status: 409,
    message: "That repository already has an apm.yml, so it is a Harness.",
  },
  "path-occupied": {
    status: 409,
    message:
      "The scaffold would overwrite something already in that repository, so it wrote nothing.",
  },
  "no-default-branch": {
    status: 422,
    message:
      "Maestro cannot tell which branch that repository's origin treats as the default, and it will not guess one. Run `git fetch origin` and `git remote set-head origin --auto` in the clone, then try again.",
  },
  "not-on-default-branch": {
    status: 409,
    message:
      "That clone is checked out on a branch other than its default. Switch to the default branch and try again.",
  },
  "not-offered": {
    status: 409,
    message:
      "Maestro only scaffolds a repository it has just offered to scaffold. Connect that repository again to get the offer.",
  },
  busy: {
    status: 409,
    message:
      "That repository is already being scaffolded. Wait for the first attempt to finish.",
  },
  "write-failed": {
    status: 422,
    message:
      "Maestro could not write the Harness files into that repository, so it removed the ones it had written. Check that you can write to that folder, then try again.",
  },
  "commit-failed": {
    status: 422,
    message:
      "Maestro wrote the Harness files but git would not commit them. Check that git has an author identity configured in that repository, then try again.",
  },
  "push-rejected": {
    status: 422,
    message:
      "The Harness is committed in your clone, but GitHub refused the push. Check that you can push to that repository's default branch, then push the commit yourself.",
  },
  "push-offline": {
    status: 502,
    message:
      "The Harness is committed in your clone, but GitHub could not be reached. Push the commit yourself once you are back online.",
  },
  "connect-failed": {
    status: 422,
    message:
      "The Harness was scaffolded and pushed, but Maestro could not connect it. Connect it by its path.",
  },
};

// Mirrors the connect table: nothing connected is a 409, a connected clone
// whose origin apm could never resolve is a 422.
const harnessErrorResponses: ErrorTable<HarnessStateError> = {
  "not-configured": {
    status: 409,
    message: "No Harness is connected. Set the Harness source path.",
  },
  "no-usable-origin": {
    status: 422,
    message:
      "The harness clone's origin remote is missing, unreadable, or in a form apm cannot resolve. Maestro releases to GitHub tags, so it needs a GitHub origin over https or ssh.",
  },
};

// A plan shares the state read's two refusals and adds one: `no-answer` is a
// remote nothing has fetched, so there is no delta to plan against. A 409, like
// nothing-connected — a precondition the author clears with Refresh.
const releasePlanErrorResponses: ErrorTable<ReleasePlanError> = {
  ...harnessErrorResponses,
  "no-answer": {
    status: 409,
    message:
      "Maestro has not fetched the remote yet, so it cannot plan a release. Refresh the harness and try again.",
  },
};

// Confirmation is its own remote read, so its `no-answer` covers both a
// failed re-fetch and a push that could not reach the remote — either way,
// nothing was published and a retry is the way forward (#520).
const publishReleaseErrorResponses: ErrorTable<PublishReleaseError> = {
  ...harnessErrorResponses,
  "no-answer": {
    status: 409,
    message:
      "Maestro could not reach the remote to confirm this release. Refresh and try again.",
  },
  // Both are ordinary races, not dead ends: nothing was overwritten, and the
  // reply carries the recomputed plan the author confirms instead (#521).
  "already-released": {
    status: 409,
    message:
      "Someone else took that version first. Check the recomputed plan and confirm again.",
  },
  "plan-changed": {
    status: 409,
    message:
      "The remote moved while you were deciding, so this plan no longer stands. Check the recomputed plan and confirm again.",
  },
  "publish-failed": {
    status: 502,
    message: "The tag could not be pushed. Check the remote and try again.",
  },
  "publish-in-progress": {
    status: 409,
    message:
      "A release for this harness is already being confirmed. Wait for it to finish.",
  },
};

// Promotion shares the state read's two refusals and states the rest in
// Maestro's own words — never git's, and never the path it ran in
// (security.md). Nothing here is a dead end: every refusal leaves the clone as
// it was, so a retry is another press (#577).
const promoteErrorResponses: ErrorTable<PromoteSkillError> = {
  ...harnessErrorResponses,
  "invalid-skill": {
    status: 400,
    message:
      "A skill name is lowercase letters, digits and single hyphens, like code-review.",
  },
  // The rule that closes Release: with no answer from the remote, the tip this
  // commit would be built on is unknown.
  "no-answer": {
    status: 409,
    message:
      "Maestro could not reach the remote to promote this skill. Refresh and try again.",
  },
  "skill-missing": {
    status: 422,
    message: "That skill is no longer in the Harness working tree.",
  },
  "push-elsewhere": {
    status: 422,
    message:
      "The harness clone pushes somewhere other than the origin it fetches from, so Maestro will not publish this skill.",
  },
  "source-changed": {
    status: 409,
    message:
      "The skill changed on disk while Maestro was reading it. Nothing was pushed — try again.",
  },
  "concurrent-change": {
    status: 409,
    message:
      "A teammate's change landed on this skill. Nothing was pushed — pull it into the harness clone, then try promoting again.",
  },
  "promote-failed": {
    status: 502,
    message: "The skill could not be pushed. Check the remote and try again.",
  },
  "promote-in-progress": {
    status: 409,
    message:
      "A promotion for this harness is already running. Wait for it to finish.",
  },
};

// Promotion's refusals plus the ones only a removal has: a confirmation the
// remote moved past, a movement that is no longer a deletion, and four working
// trees that cannot answer. Maestro's own words (#580, security.md).
const deletionErrorResponses: ErrorTable<PromoteDeletionError> = {
  ...harnessErrorResponses,
  "invalid-skill": promoteErrorResponses["invalid-skill"],
  "no-answer": {
    status: 409,
    message:
      "Maestro could not reach the remote to publish this removal. Refresh and try again.",
  },
  "confirmation-stale": {
    status: 409,
    message:
      "The skill on the default branch is no longer the one you confirmed removing. Nothing was pushed — refresh and confirm again.",
  },
  "not-deleted": {
    status: 422,
    message:
      "That skill is not deleted in the Harness working tree, so there is no removal to publish.",
  },
  "sparse-checkout": {
    status: 409,
    message:
      "The Harness clone uses a sparse checkout, so a missing skill is not proof it was deleted. Maestro will not publish a removal from it.",
  },
  "merge-in-progress": {
    status: 409,
    message:
      "A merge is in progress in the Harness clone. Finish or abort it, then confirm the removal again.",
  },
  "rebase-in-progress": {
    status: 409,
    message:
      "A rebase is in progress in the Harness clone. Finish or abort it, then confirm the removal again.",
  },
  "unresolved-conflicts": {
    status: 409,
    message:
      "The Harness clone has unresolved conflicts, so its working tree does not state your intent. Resolve them, then confirm the removal again.",
  },
  unreadable: {
    status: 409,
    message:
      "Maestro could not read the state of the Harness working tree, so it will not publish a removal from it.",
  },
  "push-elsewhere": promoteErrorResponses["push-elsewhere"],
  "source-changed": {
    status: 409,
    message:
      "The skill came back on disk while Maestro was reading it. Nothing was pushed — try again.",
  },
  "promote-failed": {
    status: 502,
    message: "The removal could not be pushed. Check the remote and try again.",
  },
  "promote-in-progress": promoteErrorResponses["promote-in-progress"],
};

// Import states every refusal in Maestro's own words — never a filesystem
// message, and never the path it read (#576, security.md). The copy's own
// refusals come through unchanged from core's typed set.
const importErrorResponses: ErrorTable<ImportSkillError> = {
  "not-configured": {
    status: 409,
    message: "No Harness is connected. Set the Harness source path.",
  },
  "source-unreadable": {
    status: 422,
    message: "Maestro could not read that folder.",
  },
  // 403 like browse: the same ceiling, and the reply names no path.
  "outside-root": {
    status: 403,
    message: "That folder is outside the area Maestro can read.",
  },
  "deployed-copy": {
    status: 409,
    message:
      "That folder is a copy Maestro deployed. Import the skill from where you author it, not from a deployed target.",
  },
  "missing-manifest": {
    status: 422,
    message: "That folder has no SKILL.md, so it is not a skill.",
  },
  "invalid-frontmatter": {
    status: 422,
    message: "The SKILL.md frontmatter does not parse. Fix it and try again.",
  },
  "empty-description": {
    status: 422,
    message: "The SKILL.md description is empty. Fill it in and try again.",
  },
  "invalid-name": {
    status: 400,
    message:
      "A skill name is lowercase letters, digits and single hyphens, like code-review.",
  },
  "name-taken": {
    status: 409,
    message: "The Harness already has a skill with that name.",
  },
  "not-found": {
    status: 422,
    message: "That folder no longer exists.",
  },
  "not-a-directory": { status: 422, message: "That path is not a folder." },
  "destination-exists": {
    status: 409,
    message: "The Harness already has a skill with that name.",
  },
  "unsafe-link": {
    status: 422,
    message:
      "That folder holds a symbolic link Maestro will not follow. Nothing was copied.",
  },
  "hard-linked-file": {
    status: 422,
    message:
      "That folder holds a file shared with somewhere else on disk. Nothing was copied.",
  },
  "special-file": {
    status: 422,
    message:
      "That folder holds something that is not a plain file or folder. Nothing was copied.",
  },
  "too-many-files": {
    status: 422,
    message: "That folder holds over 1,000 files. Nothing was copied.",
  },
  "too-large": {
    status: 422,
    message: "That folder is over 50 MiB. Nothing was copied.",
  },
  "source-changed": {
    status: 409,
    message:
      "The folder changed while it was being copied. Nothing was copied.",
  },
  "copy-failed": {
    status: 500,
    message: "The copy did not finish. Nothing was left in the Harness.",
  },
  "destination-unsafe": {
    status: 409,
    message:
      "The Harness's skills folder does not sit inside the Harness. Nothing was copied.",
  },
};

// outside-root is 403 (the info-disclosure boundary); no message echoes the
// path (security.md).
const browseErrorResponses: ErrorTable<BrowseError> = {
  "outside-root": {
    status: 403,
    message: "That path is outside the area Maestro can browse.",
  },
  "not-found": { status: 404, message: "No directory exists at that path." },
  "not-a-directory": {
    status: 400,
    message: "That path is not a directory.",
  },
  // In bounds and a directory, but unreadable — 422, not 403/404.
  unreadable: {
    status: 422,
    message: "That directory could not be read.",
  },
};

// Built from injected dependencies so routes are testable in isolation
// (tests/integration). Production uses realDeps() below.
export type AppDeps = {
  registry: Registry;
  inventory: InventoryReader;
  harness: ReadHarnessState;
  importSkill: ImportSkill;
  publish: PublishRelease;
  promote: PromoteSkill;
  promoteDeletion: PromoteSkillDeletion;
  connect: ConnectInventory;
  scaffold: ScaffoldHarness;
  browse: BrowseFilesystem;
  // Serves both per-repo and global routes, so tool presence is required —
  // omitting it is a compile error here, not a 500 discovered later (#187).
  deployState: GlobalDeployStateReader;
  deploy: DeploySkill;
  remove: RemoveDeployedSkill;
  drift: CheckVersionDrift;
  // Tests inject a sandbox so the real ~/.apm is never touched (apm-driver.md).
  resolveGlobalRoot: () => string;
  // Production always enables the guard; tests construct it disabled. No
  // static bypass header.
  enforceOriginHost: boolean;
};

export function createApp(deps: AppDeps) {
  const app = new Hono();

  // Reachability only: that the route answers at all is the signal.
  app.get("/api/health", (c) => c.json({ ok: true, component: "server" }));

  // App-wide, so a new write route is protected by default.
  if (deps.enforceOriginHost) {
    const safeMethods = new Set(["GET", "HEAD"]);
    app.use("*", async (c, next) => {
      if (safeMethods.has(c.req.method)) {
        return next();
      }
      return originHostGuard(c, next);
    });
  }

  app.get("/api/inventory/primitives", async (c) => {
    const result = await deps.inventory.read();
    if (!result.ok) {
      // 409: unset/missing/not-a-directory. Never echoes the path.
      return c.json(
        {
          error: result.error,
          message: "No inventory is configured. Set the Harness source path.",
        },
        409,
      );
    }
    return c.json({ primitives: result.primitives });
  });

  // A GET, so it bypasses the Origin/Host guard — returning the user's own
  // configured path is intentional, not an attacker probe.
  app.get("/api/inventory/config", async (c) => {
    return c.json({ inventoryPath: await deps.inventory.configuredPath() });
  });

  // The Harness home base's two operations. Neither takes a path: both resolve
  // and canonicalize the single connected harness server-side, so no request
  // can point git at a directory of its choosing (security.md).
  const harnessResponse = (c: Context, result: HarnessStateResult) => {
    if (!result.ok) {
      const { status, message } = harnessErrorResponses[result.error];
      return c.json({ error: result.error, message }, status);
    }
    return c.json(result.state);
  };

  app.get("/api/harness", async (c) =>
    harnessResponse(c, await deps.harness.execute()),
  );

  // A POST: fetching reaches the network and writes refs, so it belongs behind
  // the Origin/Host guard, never on a GET.
  app.post("/api/harness/refresh", async (c) =>
    harnessResponse(c, await deps.harness.refresh(new Date())),
  );

  // The release plan for the consequences-first dialog. A GET: it reads the
  // already-fetched refs and writes nothing — the network re-check at
  // confirmation belongs to a later job (#520). Resolves the harness
  // server-side like the reads above, so no path crosses from the browser.
  app.get("/api/harness/release-plan", async (c) => {
    const result: ReleasePlanResult = await deps.harness.planRelease();
    if (!result.ok) {
      const { status, message } = releasePlanErrorResponses[result.error];
      return c.json({ error: result.error, message }, status);
    }
    return c.json(result.plan);
  });

  // Confirming a release: a POST behind the Origin/Host guard, since it
  // reaches the network and pushes a tag. Takes only the chosen step and the
  // plan's previous tag — never a path or a revision — so the server
  // re-reads the remote and computes the exact commit to tag itself, rather
  // than trusting what the browser saw at plan time (#520).
  app.post("/api/harness/release", async (c) => {
    const body = await parseBody(
      c,
      publishReleaseBodySchema,
      RELEASE_BODY_MESSAGE,
    );
    if (!body.ok) {
      return body.response;
    }
    const result: PublishReleaseResult = await deps.publish.execute(
      body.data,
      new Date(),
    );
    if (!result.ok) {
      const { status, message } = publishReleaseErrorResponses[result.error];
      // The refusal carries the plan that replaces it, so the dialog can take
      // a new confirmation without the author leaving it (#521).
      return c.json(
        { error: result.error, message, plan: result.recomputed },
        status,
      );
    }
    return c.json({ tag: result.tag, revision: result.revision });
  });

  // Promoting one skill: a POST behind the Origin/Host guard, since it fetches
  // and pushes. Takes the skill's name and nothing else — the harness is
  // resolved server-side, and the reply carries the branch and the link that
  // opens GitHub's own pull-request flow (#577).
  app.post("/api/harness/promote", async (c) => {
    const body = await parseBody(c, promoteBodySchema, PROMOTE_BODY_MESSAGE);
    if (!body.ok) {
      return body.response;
    }
    const result: PromoteSkillResult = await deps.promote.execute(
      body.data.name,
      new Date(),
    );
    if (!result.ok) {
      const { status, message } = promoteErrorResponses[result.error];
      return c.json({ error: result.error, message }, status);
    }
    return c.json({
      branch: result.branch,
      pullRequestUrl: result.pullRequestUrl,
    });
  });

  // Publishing a skill's removal: the same POST one step stricter. The body
  // carries the origin/HEAD tree the author confirmed against, so a remote
  // that moved under it is refused rather than removed (#580).
  app.post("/api/harness/promote/deletion", async (c) => {
    const body = await parseBody(c, deletionBodySchema, DELETION_BODY_MESSAGE);
    if (!body.ok) {
      return body.response;
    }
    const result: PromoteDeletionResult = await deps.promoteDeletion.execute(
      body.data.name,
      body.data.seenRemoteTree,
      new Date(),
    );
    if (!result.ok) {
      const { status, message } = deletionErrorResponses[result.error];
      return c.json({ error: result.error, message }, status);
    }
    return c.json({
      branch: result.branch,
      pullRequestUrl: result.pullRequestUrl,
    });
  });

  // What Import would do, before it does it: the proposed name, the refusals,
  // and the advisory findings. A POST like every other path-taking read, so the
  // Origin/Host guard covers it. A refusal is data here, not a failure — only
  // an unconnected harness is a status.
  app.post("/api/harness/import/check", async (c) => {
    const body = await parseBody(c, importBodySchema, IMPORT_BODY_MESSAGE);
    if (!body.ok) {
      return body.response;
    }

    const result = await deps.importSkill.check(body.data);
    if (!result.ok) {
      const { status, message } = importErrorResponses[result.error];
      return c.json({ error: result.error, message }, status);
    }
    return c.json(result.check);
  });

  // Importing itself. Re-judges everything the check judged, so a source or a
  // harness that moved since is refused rather than copied (security.md).
  app.post("/api/harness/import", async (c) => {
    const body = await parseBody(c, importBodySchema, IMPORT_BODY_MESSAGE);
    if (!body.ok) {
      return body.response;
    }

    const result = await deps.importSkill.execute(body.data);
    if (!result.ok) {
      const { status, message } = importErrorResponses[result.error];
      return c.json({ error: result.error, message }, status);
    }
    return c.json({ name: result.name, skipped: result.skipped });
  });

  // Connect: a pasted path is persisted offline; a GitHub URL is cloned to a
  // new folder under the home ceiling first and then connected (#554).
  app.post("/api/inventory/connect", async (c) => {
    const body = await parseBody(c, connectBodySchema, PATH_BODY_MESSAGE);
    if (!body.ok) {
      return body.response;
    }

    const result = await deps.connect.connect(body.data.path, {
      parent: body.data.parent,
    });
    if (!result.ok) {
      const { status, message } = connectErrorResponses[result.error];
      if (result.error === "scaffoldable") {
        return c.json(
          { error: result.error, message, path: result.scaffoldPath },
          status,
        );
      }
      return c.json({ error: result.error, message }, status);
    }

    return c.json({
      outcome: result.outcome,
      inventoryPath: result.inventoryPath,
      primitiveCount: await countPrimitives(deps.inventory),
    });
  });

  // Accepting the scaffold offer connect handed out. The path is re-checked
  // from scratch in core — this endpoint takes one from the client, and the
  // offer that carried it is not evidence (security.md, #556).
  app.post("/api/harness/scaffold", async (c) => {
    const body = await parseBody(c, connectBodySchema, PATH_BODY_MESSAGE);
    if (!body.ok) {
      return body.response;
    }

    const result = await deps.scaffold.scaffold(body.data.path);
    if (!result.ok) {
      const { status, message } = scaffoldErrorResponses[result.error];
      if (result.error === "path-occupied") {
        // Repository-relative, and nothing else about the repository.
        return c.json(
          { error: result.error, message, path: result.path },
          status,
        );
      }
      return c.json({ error: result.error, message }, status);
    }

    return c.json({
      outcome: result.outcome,
      inventoryPath: result.inventoryPath,
      primitiveCount: await countPrimitives(deps.inventory),
    });
  });

  // Read-only directory browser (ADR-0009). POST deliberately, so the guard
  // above covers this widest read surface — a GET would bypass it.
  app.post("/api/filesystem/children", async (c) => {
    const body = await parseBody(c, browseBodySchema, PATH_BODY_MESSAGE);
    if (!body.ok) {
      return body.response;
    }

    const result = await deps.browse.browse(body.data.path);
    if (!result.ok) {
      const { status, message } = browseErrorResponses[result.error];
      return c.json({ error: result.error, message }, status);
    }

    // `parent` undefined at the home ceiling → JSON.stringify drops the key,
    // which is the "up is disabled" contract. `satisfies` binds this to core's
    // shape so a field added there fails to compile here, not arrives undefined (#156).
    return c.json({
      path: result.path,
      parent: result.parent,
      breadcrumbs: result.breadcrumbs,
      entries: result.entries,
    } satisfies BrowseSuccess);
  });

  // Registry-gated: an unregistered repo is refused before any filesystem
  // access, so a request can never read an arbitrary <path>/apm.lock.yaml.
  app.get("/api/deploy-state", async (c) => {
    const repo = c.req.query("repo");
    if (repo === undefined || repo.trim() === "") {
      return c.json(
        { error: "missing-repo", message: "A repo path is required." },
        400,
      );
    }
    if (!(await deps.registry.isRegistered(repo))) {
      return c.json(
        {
          error: "not-registered",
          message: "That repo is not registered with Maestro.",
        },
        403,
      );
    }
    const result = await deps.deployState.read(repo);
    if (!result.ok) {
      // 422: lockfile exists but couldn't be read — never a silent empty list.
      return c.json(
        {
          error: result.error,
          message: "The repo's lockfile could not be read.",
        },
        422,
      );
    }
    return c.json({ primitives: result.primitives, skipped: result.skipped });
  });

  // Grouped per detected tool (ADR-0011). Server resolves the root itself —
  // any ?repo is ignored. Missing lockfile is an honest empty state; malformed is 422.
  app.get("/api/deploy-state/global", async (c) => {
    const result = await deps.deployState.readGlobal(deps.resolveGlobalRoot());
    if (!result.ok) {
      return c.json(
        {
          error: result.error,
          message: "The global lockfile could not be read.",
        },
        422,
      );
    }
    return c.json({ tools: result.tools, skipped: result.skipped });
  });

  // Business rules live in core; this route validates shape and maps errors.
  app.post("/api/deploy", async (c) => {
    const body = await parseBody(c, deployBodySchema, TARGET_BODY_MESSAGE);
    if (!body.ok) {
      return body.response;
    }

    const result = await deps.deploy.execute(body.data);
    if (!result.ok) {
      const { status, message } = deployErrorResponses[result.error];
      // The recorded type is one of our own readings of apm's lockfile field,
      // never a line of apm prose (ADR-0018, security.md).
      return c.json(
        {
          error: result.error,
          message,
          ...(result.packageType ? { packageType: result.packageType } : {}),
        },
        status,
      );
    }
    return c.json({ deployed: result.deployed });
  });

  app.post("/api/deploy/remove", async (c) => {
    const body = await parseBody(c, removeBodySchema, TARGET_BODY_MESSAGE);
    if (!body.ok) {
      return body.response;
    }

    const result = await deps.remove.execute(body.data);
    if (!result.ok) {
      const { status, message } = removeErrorResponses[result.error];
      // Omitted, never null: a failure that never reached apm has no outcome,
      // and an absent key cannot be mistaken for one the server proved (#416).
      // The restated cost and its receipt travel the same way — together, or
      // the confirmation would name a cost it cannot act on (#364).
      return c.json(
        {
          error: result.error,
          message,
          ...(result.outcome ? { outcome: result.outcome } : {}),
          ...(result.check && result.receipt
            ? {
                check: result.check,
                receipt: result.receipt,
                reclaim: result.reclaim ?? null,
              }
            : {}),
        },
        status,
      );
    }
    return c.json({ removed: result.removed });
  });

  // Never a silent "clean" on a failed check — it answers with its own error (#337).
  app.post("/api/deploy/remove/preflight", async (c) => {
    const body = await parseBody(c, removeBodySchema, TARGET_BODY_MESSAGE);
    if (!body.ok) {
      return body.response;
    }

    const result = await deps.remove.preflight(body.data);
    if (!result.ok) {
      const { status, message } = removePreflightErrorResponses[result.error];
      return c.json({ error: result.error, message }, status);
    }
    return c.json({
      check: result.check,
      reclaim: result.reclaim,
      receipt: result.receipt,
    });
  });

  // Always 200 with a report — a per-skill refusal is data, not an HTTP error.
  // Shares the deploy use-case's per-target in-flight lock (#292).
  const bulkDeploy = new BulkDeploySkills({ deploy: deps.deploy });
  app.post("/api/deploy/bulk", async (c) => {
    const body = await parseBody(c, bulkDeployBodySchema, BULK_BODY_MESSAGE);
    if (!body.ok) {
      return body.response;
    }

    const report = await bulkDeploy.execute(body.data);
    return c.json(report);
  });

  // Always 200 with a report — one target's refusal is data, not an HTTP error.
  // The walk delegates to the same remove use-case the single route drives, so
  // every guard, the per-target lock and the reclaim contract stay there (#421).
  const bulkRemove = new BulkRemoveDeployedSkill({ remove: deps.remove });
  app.post("/api/deploy/remove/bulk", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = bulkRemoveBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: "invalid-body",
          message:
            'Expected a JSON body with a name and a non-empty targets array, each entry carrying a target ({ kind: "repo", repoPath } or { kind: "global" }).',
        },
        400,
      );
    }

    const report = await bulkRemove.execute(parsed.data);
    return c.json(report);
  });

  // Registry-gated like deploy-state. Delegated to `apm outdated` (ADR-0001).
  app.get("/api/drift", async (c) => {
    const repo = c.req.query("repo");
    if (repo === undefined || repo.trim() === "") {
      return c.json(
        { error: "missing-repo", message: "A repo path is required." },
        400,
      );
    }
    if (!(await deps.registry.isRegistered(repo))) {
      return c.json(
        {
          error: "not-registered",
          message: "That repo is not registered with Maestro.",
        },
        403,
      );
    }
    const result = await deps.drift.execute({
      target: { kind: "repo", repoPath: repo },
    });
    if (!result.ok) {
      return c.json(driftFailureBody(result));
    }
    return c.json({ behind: result.behind });
  });

  // No path sent to core — user-scope is apm's global target; any ?repo is ignored.
  app.get("/api/drift/global", async (c) => {
    const result = await deps.drift.execute({
      target: { kind: "global" },
    });
    if (!result.ok) {
      return c.json(driftFailureBody(result));
    }
    return c.json({ behind: result.behind });
  });

  app.get("/api/registry/repos", async (c) =>
    c.json({ repos: await deps.registry.list() }),
  );

  app.post("/api/registry/repos", async (c) => {
    const body = await parseBody(c, registerBodySchema, PATH_BODY_MESSAGE);
    if (!body.ok) {
      return body.response;
    }

    const result = await deps.registry.register(body.data.path);
    if (!result.ok) {
      return c.json(
        { error: result.error, message: repoPathErrorMessages[result.error] },
        400,
      );
    }

    return c.json({ repos: result.repos }, 201);
  });

  return app;
}

function realDeps(): AppDeps {
  const fs = new NodeFileSystem();
  // Resolved per access, not at import: importing { app } must not freeze
  // the config path to load-time env.
  const store = new ConfigStore({
    fs,
    configPath: () => resolveMaestroConfigPath(process.env),
  });
  const registry = new Registry({
    fs,
    store,
    resolveCentralInventoryPath: (config) =>
      resolveInventoryPath(config, process.env),
  });
  // Resolved per read, so a path saved after startup is picked up without a restart.
  const inventory = new InventoryReader({
    fs,
    resolvePath: async () =>
      resolveInventoryPath(await store.read(), process.env),
  });
  const deployState = new GlobalDeployStateReader({
    fs,
    toolPresence: new ToolPresenceAdapter(),
  });
  // Runs from a scratch dir under MAESTRO_HOME, created on demand, so apm's
  // .gitignore side-effect never lands in a real repo (apm-driver.md, J07).
  const apm = new ApmCliDriver({
    prepareGlobalCwd: async () => {
      const cwd = resolveApmScratchCwd(process.env);
      await fs.ensureDir(cwd);
      return cwd;
    },
  });
  const drift = new CheckVersionDrift({
    registry,
    apm,
    canonicalPath: (path) => fs.realpath(path),
  });
  // Shared by the harness read and the release confirm below, so both name
  // the same connected clone.
  const harnessRoot = async () => {
    const path = resolveInventoryPath(await store.read(), process.env);
    if (path === undefined) {
      return undefined;
    }
    // A path git cannot be pointed at is a harness that is not connected —
    // never the raw path, which would run git against something unresolved.
    return await fs.realpath(path).catch(() => undefined);
  };
  const harnessGit = new HarnessGitAdapter();
  const harnessFreshness = new HarnessFreshnessStore({ store });
  // Shared by both ways a movement reaches review: two of them for the same
  // harness must queue, not race each other's temporary index and push.
  const harnessPromoteLocks = new InFlightLocks();

  // Shared instance: a global deploy's lockfile root and deploy tree differ
  // (~/.apm vs ~/.claude/skills, apm-driver.md #56/#61) — guard and cleanup agree by construction.
  const deployedLocation = new DeployedLocation(process.env);
  // Shared by deploy and remove: both rewrite the same apm.lock.yaml, and a
  // deploy racing a remove would corrupt it.
  const apmWriteLocks = new InFlightLocks();
  const deploy = new DeploySkill({
    inventory,
    registry,
    apm,
    inventoryGit: new InventoryGitAdapter({
      resolveRoot: async () =>
        resolveInventoryPath(await store.read(), process.env),
    }),
    deployedContent: new DeployedContentAdapter({ location: deployedLocation }),
    // apm's success marker says nothing about what it recorded, so the lockfile
    // is read back before the deploy is called clean (#358).
    recordedPackage: new RecordedPackageAdapter({
      fs,
      location: deployedLocation,
    }),
    // Reconciles an untargeted tool's leftover copy after a narrowed global
    // deploy (ADR-0011, #136) — a direct subtree rm, never `apm uninstall -g`.
    deployedCleanup: new DeployedCleanupAdapter({ location: deployedLocation }),
    // Live HOME probe per deploy, so a global install targets only tools the
    // machine actually has (ADR-0011).
    toolPresence: new ToolPresenceAdapter(),
    inventoryOriginUrl: async () => {
      const root = resolveInventoryPath(await store.read(), process.env);
      return root === undefined ? null : readGitOriginUrl(root);
    },
    canonicalPath: (path) => fs.realpath(path),
    locks: apmWriteLocks,
  });
  // Same DeployedLocation as deploy, so guard/cleanup/reclaim always agree on
  // which lockfile and tree a target means.
  const remove = new RemoveDeployedSkill({
    registry,
    deployedRef: new DeployedRefAdapter({ fs, location: deployedLocation }),
    // apm deletes an edited file silently — a removal must prove nothing to
    // lose first (apm-driver.md § Remove).
    deployedContent: new DeployedContentAdapter({ location: deployedLocation }),
    apm,
    // For copies apm's uninstall can't reach: a tool this machine no longer detects (#339).
    deployedCleanup: new DeployedCleanupAdapter({ location: deployedLocation }),
    toolPresence: new ToolPresenceAdapter(),
    canonicalPath: (path) => fs.realpath(path),
    locks: apmWriteLocks,
    location: deployedLocation,
  });
  // Same connected clone the inventory reads, canonicalized per call so a
  // path saved after startup is picked up and a symlinked one is resolved.
  // Shared by the read and the publish below, so both name the same harness.
  const harness = new ReadHarnessState({
    resolveRoot: harnessRoot,
    git: harnessGit,
    freshness: harnessFreshness,
  });
  // One register for both use cases: connect writes the offers the scaffold
  // will only act on (#556).
  const scaffoldOffers = new ScaffoldOffers();
  const connect = new ConnectInventory({
    fs,
    store,
    offers: scaffoldOffers,
    // The URL the author configured, not the one a transport rewrite sends git
    // to: connect gates on the repository's identity, which is what apm's refs
    // are built from (LEARNINGS · git-remote-get-url).
    originUrl: readConfiguredGitOriginUrl,
    defaultBranch: resolveDefaultBranch,
    isRepositoryRoot,
    probeHead,
    // The default ceiling, which the picker can move (#555). Browsing uses the
    // same one, so a cloned Harness lands where it can reach it (#554).
    homeRoot: () => homedir(),
    clone: new GitCloneAdapter(),
  });

  return {
    registry,
    inventory,
    harness,
    // The same connected clone every harness read names. Deployed roots are
    // read per call, so a repo registered after startup counts (#576).
    importSkill: new ImportSkill({
      resolveRoot: harnessRoot,
      fs,
      // The picker's ceiling, so what can be imported is what can be browsed.
      homeRoot: () => homedir(),
      copy: new CopySkillFolder({ fs: new NodeCopyTreeFs() }),
      deployedRoots: async () => [
        deployedLocation.treeRoot({ kind: "global" }),
        ...(await registry.list()).map((repo) => repo.path),
      ],
    }),
    // Confirmation's own remote read, never the plan's cached one — the same
    // harness, git port, and freshness record as the read above (#520).
    publish: new PublishRelease({
      resolveRoot: harnessRoot,
      git: harnessGit,
      freshness: harnessFreshness,
      // Bound to the root the publication already resolved and locked, so a
      // harness connected mid-flight cannot answer for it (#521).
      replan: (root) => harness.planReleaseAt(root),
      // Own lock, not the apm write lock above: a second confirmation for the
      // same harness must wait, not race the first one's push (#520).
      locks: new InFlightLocks(),
    }),
    // The same connected clone, git port, and freshness record the read and
    // the release use, so all three speak about one harness (#577).
    promote: new PromoteSkill({
      resolveRoot: harnessRoot,
      git: harnessGit,
      freshness: harnessFreshness,
      locks: harnessPromoteLocks,
    }),
    // Publishing a removal is the same branch lifecycle one movement the other
    // way, so it shares the promotion's lock: an edit and a removal building
    // commits from one fetched tip would each answer for the other's refs.
    promoteDeletion: new PromoteSkillDeletion({
      resolveRoot: harnessRoot,
      git: harnessGit,
      freshness: harnessFreshness,
      locks: harnessPromoteLocks,
    }),
    // Checked offline against local git config, so the error lands before
    // the first deploy (#147).
    connect,
    // Connects through the same use case, so a scaffolded Harness passes
    // exactly the checks a joined one does (#556).
    scaffold: new ScaffoldHarness({
      fs,
      git: new GitHarnessScaffoldAdapter(),
      // Own lock, keyed on the repository being scaffolded: two scaffolds of
      // one clone would interleave their collision checks (#556).
      locks: new InFlightLocks(),
      offers: scaffoldOffers,
      originUrl: readConfiguredGitOriginUrl,
      connect: (path) => connect.connect(path),
    }),
    browse: new BrowseFilesystem({ fs, homeRoot: () => homedir() }),
    deployState,
    deploy,
    remove,
    drift,
    resolveGlobalRoot: () => resolveApmGlobalRoot(process.env),
    enforceOriginHost: true,
  };
}

export const app = createApp(realDeps());
