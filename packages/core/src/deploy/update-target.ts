// The Update use-case. `preview` prices moving a whole target to the latest
// release — what changes, what the release removes, and which copies stand in
// the way — and mints the token that proves this server priced it. It writes
// nothing; the confirm is #954. See ADR-0031, ADR-0020, #953.
import type { ReleaseHeadGitPort } from "../deploy-state/release-head";
import { highestReleaseTag } from "../harness/release-tag";
import type { HarnessSkillTree } from "../harness/skill-movements";
import type { ToolPresencePort } from "../tools/tool-presence-port";
import type { DeployTarget } from "./deploy-skill";
import type { SupportedTool } from "./deploy-tools";
import type { GitOrigin } from "./git-origin";
import type { LocalCopyCheck, LocalCopyGuard } from "./local-copy-guard";
import { ConsentSigner } from "./signed-consent";

// What a target follows today: the one release, and the skills deployed under
// it. Read from the deployment record's own files, never from `skills:`
// (ADR-0031). A target on no single release has nothing to update.
export type TargetSelectionResult =
  | { ok: true; release: string; selection: readonly string[] }
  | { ok: false; reason: "not-deployed" | "lockfile-malformed" };

export type TargetSelectionPort = {
  read(target: DeployTarget): Promise<TargetSelectionResult>;
};

// A skill the reader can go and read before adopting it: the name, and its
// folder at the chosen release. `url` is null where the connected Harness names
// no usable origin — a link nobody can follow is worse than none (ADR-0014).
export type UpdateSkillRow = { name: string; url: string | null };

// One copy the update would overwrite, at the grain consent is given at: per
// skill, and per tool where the target splits by tool (#952).
export type CopyConsentRow = { name: string; tool: SupportedTool | null };

export type UpdatePreview = {
  // The release the target follows now, and the only one on offer — the latest
  // (ADR-0031 § Accepted limits).
  release: string;
  chosenRelease: string;
  // The three numbers the counting sentence states, over the current Selection.
  counts: { changed: number; removed: number; unchanged: number };
  // The Inventory's second entrance fills this; an Update from the card adds no
  // skill of its own (#955).
  addedByThisDeploy: readonly UpdateSkillRow[];
  changed: readonly UpdateSkillRow[];
  removed: readonly string[];
  unchanged: readonly string[];
  newInRelease: readonly UpdateSkillRow[];
  // What the reader must agree to before the update may run. Two lists, because
  // they are two different consents: dropping work, and overwriting a copy
  // nothing could verify (#952, spec story 37).
  localEdits: {
    discard: readonly CopyConsentRow[];
    unverified: readonly CopyConsentRow[];
  };
  // The exact Selection before and after. `desired` drops every name this
  // release removed and adds none; empty means the target becomes Empty.
  selection: { current: readonly string[]; desired: readonly string[] };
  // The guard's receipt licensing the overwrite of exactly the copies above.
  // Null where every copy is clean, so a caller cannot offer consent nobody
  // needs to give (#952).
  copyReceipt: string | null;
  // Proof this server priced this update. Stateless (ADR-0020).
  token: string;
};

// Each member's meaning for the reader is the server's
// `updatePreviewErrorResponses` table. Every one but the catch-all is a
// refusal something observed.
export type UpdatePreviewError =
  | "repo-not-registered"
  | "no-supported-tool"
  // The target follows no single release: Empty, or still pinned per skill.
  | "not-deployed"
  | "lockfile-malformed"
  | "deployed-unreadable"
  | "inventory-not-configured"
  // The Harness is connected; its tags or a release tree could not be read. A
  // preview never guesses a count (J04).
  | "inventory-unreadable"
  | "no-published-tag"
  | "preview-failed";

export type UpdatePreviewResult =
  | { ok: true; preview: UpdatePreview }
  | { ok: false; error: UpdatePreviewError };

// Everything the token binds. Changing any of it retires the consent, so a
// preview of one state never authorises the update of another (#953).
export type UpdateScope = {
  target: DeployTarget;
  chosenRelease: string;
  current: readonly string[];
  desired: readonly string[];
  tools: readonly SupportedTool[];
  copies: LocalCopyCheck;
};

export class UpdateTarget {
  private readonly deps: {
    registry: { isRegistered(path: string): Promise<boolean> };
    targetSelection: TargetSelectionPort;
    // The connected Harness's own tags and trees: content decides what changed,
    // never commit ancestry (ADR-0027).
    git: ReleaseHeadGitPort;
    resolveRoot: () => Promise<string | undefined>;
    // Where a row's link points. Null is "not known", never a guessed host.
    harnessOrigin: () => Promise<GitOrigin | null>;
    toolPresence: ToolPresencePort;
    // The one guard every write path classifies through (#952).
    copyGuard: Pick<LocalCopyGuard, "check" | "admits">;
  };

  // Never exposed, never persisted: a restart retires every outstanding
  // preview, which is the safe direction (ADR-0020).
  private readonly signer = new ConsentSigner();

  constructor(deps: UpdateTarget["deps"]) {
    this.deps = deps;
  }

  // A read: it takes no lock, so previewing cannot block an operation already
  // in flight.
  async preview(input: { target: DeployTarget }): Promise<UpdatePreviewResult> {
    // Before any filesystem or apm access (security.md).
    if (
      input.target.kind === "repo" &&
      !(await this.deps.registry.isRegistered(input.target.repoPath))
    ) {
      return { ok: false, error: "repo-not-registered" };
    }
    try {
      return await this.price(input.target);
    } catch {
      // A pricing that threw priced nothing; it is never answered as an update
      // with no cost (J04).
      return { ok: false, error: "preview-failed" };
    }
  }

  // `scope` is what the update found now, never what the caller claims: a token
  // minted for another release, Selection, tool set or content is no consent
  // for this one (#364, #953).
  accepts(scope: UpdateScope, token: string | undefined): boolean {
    return this.signer.matches(this.token(scope), token);
  }

  private async price(target: DeployTarget): Promise<UpdatePreviewResult> {
    const tools =
      target.kind === "global"
        ? await this.deps.toolPresence.detectGlobalTools()
        : [];
    if (target.kind === "global" && tools.length === 0) {
      return { ok: false, error: "no-supported-tool" };
    }

    const state = await this.deps.targetSelection.read(target);
    if (!state.ok) {
      return { ok: false, error: state.reason };
    }

    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "inventory-not-configured" };
    }
    const tags = await this.deps.git.readTags(root);
    if (tags === null) {
      return { ok: false, error: "inventory-unreadable" };
    }
    const latest = highestReleaseTag(tags);
    if (latest === null) {
      return { ok: false, error: "no-published-tag" };
    }
    const [current, next] = await Promise.all([
      this.treesAt(root, state.release),
      this.treesAt(root, latest.name),
    ]);
    if (current === null || next === null) {
      return { ok: false, error: "inventory-unreadable" };
    }

    // Every selected copy is at risk: the install rewrites the whole Selection,
    // and a name this release dropped is deleted. The chosen release goes in,
    // so a copy already equal to it is not read as an edit (#952).
    const copies = await this.deps.copyGuard.check({
      write: "update",
      target,
      names: state.selection,
      ...(tools.length === 0 ? {} : { tools }),
      release: latest.name,
    });
    const decision = this.deps.copyGuard.admits(
      { write: "update", target },
      copies,
    );
    if (!decision.ok && decision.receipt === null) {
      // No consent exists for a copy nobody could read; the update stops here
      // rather than overwrite work on a guess (spec story 43).
      return {
        ok: false,
        error:
          decision.blocked === "lockfile-malformed"
            ? "lockfile-malformed"
            : "deployed-unreadable",
      };
    }

    const origin = await this.deps.harnessOrigin().catch(() => null);
    const link = (name: string) =>
      origin === null
        ? null
        : `https://${origin.host}/${origin.ownerRepo}/tree/${latest.name}/.apm/skills/${name}`;
    const row = (name: string): UpdateSkillRow => ({ name, url: link(name) });

    const changed = state.selection.filter(
      (name) => next.has(name) && current.get(name) !== next.get(name),
    );
    const removed = state.selection.filter((name) => !next.has(name));
    const unchanged = state.selection.filter(
      (name) => next.has(name) && current.get(name) === next.get(name),
    );
    // Update adds nothing automatically: these are shown to read, not to pick
    // (spec story 18).
    const newInRelease = [...next.keys()].filter(
      (name) => !state.selection.includes(name),
    );
    const desired = state.selection.filter((name) => next.has(name));

    return {
      ok: true,
      preview: {
        release: state.release,
        chosenRelease: latest.name,
        counts: {
          changed: changed.length,
          removed: removed.length,
          unchanged: unchanged.length,
        },
        addedByThisDeploy: [],
        changed: changed.map(row),
        removed,
        unchanged,
        newInRelease: newInRelease.map(row),
        localEdits: {
          discard: consentRows(copies, "local-edits"),
          unverified: consentRows(copies, "unverified"),
        },
        selection: { current: state.selection, desired },
        copyReceipt: decision.ok ? null : decision.receipt,
        token: this.token({
          target,
          chosenRelease: latest.name,
          current: state.selection,
          desired,
          tools,
          copies,
        }),
      },
    };
  }

  // Order-independent on every list: the same update in another order is the
  // same update, and the tool probe orders its own answer.
  private token(scope: UpdateScope): string {
    return this.signer.sign({
      kind: "update-preflight",
      target:
        scope.target.kind === "repo"
          ? { kind: "repo", repoPath: scope.target.repoPath }
          : { kind: "global" },
      chosenRelease: scope.chosenRelease,
      current: [...scope.current].sort(),
      desired: [...scope.desired].sort(),
      tools: [...scope.tools].sort(),
      copies: scope.copies.findings
        .map(
          (finding) =>
            `${finding.name}:${finding.tool ?? ""}:${finding.verdict}`,
        )
        .sort(),
    });
  }

  private async treesAt(
    root: string,
    tag: string,
  ): Promise<Map<string, string> | null> {
    const skills: HarnessSkillTree[] | null = await this.deps.git
      .readSkillTreesAtTag(root, tag)
      .catch(() => null);
    return skills === null
      ? null
      : new Map(skills.map((skill) => [skill.name, skill.treeHash]));
  }
}

function consentRows(
  copies: LocalCopyCheck,
  verdict: "local-edits" | "unverified",
): CopyConsentRow[] {
  return copies.findings
    .filter((finding) => finding.verdict === verdict)
    .map((finding) => ({ name: finding.name, tool: finding.tool }));
}
