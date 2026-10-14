// The one guard between a write and a deployed copy carrying work: every write
// classifies through `check` and is licensed through `admits`.
import type { LockfileReading } from "../lockfile/lockfile";
import type {
  DeployedContentPort,
  DeployedContentState,
  DeployTarget,
} from "./deploy-skill";
import type { SupportedTool } from "./deploy-tools";
import { ConsentSigner } from "./signed-consent";

// "clean" also covers a copy equal in full to the chosen release, and no copy.
export type CopyVerdict =
  | "clean"
  | "local-edits"
  | "unverified"
  | "unreadable"
  | "lockfile-malformed";

const VERDICTS: Record<DeployedContentState, CopyVerdict> = {
  "not-deployed": "clean",
  clean: "clean",
  diverged: "local-edits",
  unverifiable: "unverified",
  unreadable: "unreadable",
  "lockfile-malformed": "lockfile-malformed",
};

// Worst first. An unreadable copy outranks an edited one: consent for what was
// read cannot cover what was not.
const BLOCKING: readonly Exclude<CopyVerdict, "clean">[] = [
  "unreadable",
  "lockfile-malformed",
  "local-edits",
  "unverified",
];

// Everything else has no readable evidence to consent to: fail closed (#952).
const CONSENTABLE = new Set<CopyVerdict>(["local-edits", "unverified"]);

// `tool: null` is the whole copy, where the write does not split by tool.
// `linkedPath` is the symlinked skill folder apm skips while reporting success
// (#1215); each write decides whether it refuses over one.
export type CopyFinding = {
  name: string;
  tool: SupportedTool | null;
  verdict: CopyVerdict;
  linkedPath: string | null;
};

// A deploy's receipt never licenses a removal.
type LocalCopyWrite = "deploy" | "remove" | "update";

export type LocalCopyScope = {
  write: LocalCopyWrite;
  target: DeployTarget;
};

// `digest` binds the bytes consent would cover, so a second edit under the same
// verdict retires the consent.
export type LocalCopyCheck = {
  findings: readonly CopyFinding[];
  digest: string | null;
};

export type LocalCopyDecision =
  | { ok: true }
  | {
      ok: false;
      blocked: Exclude<CopyVerdict, "clean">;
      check: LocalCopyCheck;
      receipt: string | null;
    };

export function worstVerdict(
  findings: readonly CopyFinding[],
): Exclude<CopyVerdict, "clean"> | undefined {
  return BLOCKING.find((verdict) =>
    findings.some((finding) => finding.verdict === verdict),
  );
}

// The first symlinked folder among `names`, which a write refuses over.
export function linkedPathAmong(
  check: LocalCopyCheck,
  names: readonly string[],
): string | undefined {
  return (
    check.findings.find((f) => f.linkedPath !== null && names.includes(f.name))
      ?.linkedPath ?? undefined
  );
}

// Shared with the Update preflight token, so the two never bind different facts.
export function copyKeys(check: LocalCopyCheck): string[] {
  return check.findings
    .map(
      (finding) => `${finding.name}:${finding.tool ?? ""}:${finding.verdict}`,
    )
    .sort();
}

export class LocalCopyGuard {
  private readonly deps: {
    content: Pick<
      DeployedContentPort,
      "readLockfile" | "classify" | "contentDigest" | "linkedSkillPath"
    >;
  };
  private readonly signer = new ConsentSigner();

  constructor(deps: LocalCopyGuard["deps"]) {
    this.deps = deps;
  }

  // A copy equal in full to `release` is clean; an unreadable release grants no
  // such pass.
  async check(
    input: LocalCopyScope & {
      names: readonly string[];
      // Absent, one answer covers the whole copy.
      tools?: readonly SupportedTool[];
      release?: string;
    },
  ): Promise<LocalCopyCheck> {
    const scopes: (SupportedTool | null)[] = input.tools
      ? [...input.tools]
      : [null];
    const lockfile = await this.deps.content.readLockfile(input.target);
    const checked = await Promise.all(
      input.names.flatMap((name) =>
        scopes.map(async (tool) => {
          const verdict = await this.classify(input, lockfile, name, tool);
          const linkedPath = await this.deps.content.linkedSkillPath({
            target: input.target,
            name,
            ...(tool === null ? {} : { tools: [tool] }),
          });
          const bytes = CONSENTABLE.has(verdict)
            ? `${name}:${tool ?? ""}:${await this.digest(input, name, tool)}`
            : null;
          return { finding: { name, tool, verdict, linkedPath }, bytes };
        }),
      ),
    );
    const bytes = checked.flatMap((c) => (c.bytes === null ? [] : [c.bytes]));
    return {
      findings: checked.map((c) => c.finding),
      digest: bytes.length === 0 ? null : bytes.sort().join("\n"),
    };
  }

  // A receipt minted for other content is no consent for this (#364, #952).
  admits(
    scope: LocalCopyScope,
    check: LocalCopyCheck,
    receipt?: string,
  ): LocalCopyDecision {
    const blocked = worstVerdict(check.findings);
    if (blocked === undefined) {
      return { ok: true };
    }
    if (!CONSENTABLE.has(blocked)) {
      return { ok: false, blocked, check, receipt: null };
    }
    const expected = this.receipt(scope, check);
    return this.signer.matches(expected, receipt)
      ? { ok: true }
      : { ok: false, blocked, check, receipt: expected };
  }

  // Every fact the consent covers is signed, so changing any retires it.
  receipt(scope: LocalCopyScope, check: LocalCopyCheck): string {
    return this.signer.sign({
      kind: "local-copy",
      write: scope.write,
      target:
        scope.target.kind === "repo"
          ? { kind: "repo", repoPath: scope.target.repoPath }
          : { kind: "global" },
      copies: copyKeys(check),
      content: check.digest,
    });
  }

  // Null can only widen a refusal, never license a write.
  private async digest(
    input: LocalCopyScope,
    name: string,
    tool: SupportedTool | null,
  ): Promise<string | null> {
    return this.deps.content
      .contentDigest({
        target: input.target,
        name,
        ...(tool === null ? {} : { tools: [tool] }),
      })
      .catch(() => null);
  }

  // A check that threw is never reported as a clean copy.
  private async classify(
    input: LocalCopyScope & { release?: string },
    lockfile: LockfileReading,
    name: string,
    tool: SupportedTool | null,
  ): Promise<CopyVerdict> {
    try {
      return VERDICTS[
        await this.deps.content.classify({
          target: input.target,
          name,
          lockfile,
          ...(tool === null ? {} : { tools: [tool] }),
          ...(input.release === undefined ? {} : { release: input.release }),
        })
      ];
    } catch {
      return "unreadable";
    }
  }
}
