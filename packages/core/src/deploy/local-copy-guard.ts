import type { LockfileReading } from "../lockfile/lockfile";
import type {
  DeployedContentPort,
  DeployedContentState,
  DeployTarget,
} from "./deploy-skill";
import type { SupportedTool } from "./deploy-tools";
import { ConsentSigner } from "./signed-consent";

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

const BLOCKING: readonly Exclude<CopyVerdict, "clean">[] = [
  "unreadable",
  "lockfile-malformed",
  "local-edits",
  "unverified",
];

const CONSENTABLE = new Set<CopyVerdict>(["local-edits", "unverified"]);

export type CopyFinding = {
  name: string;
  tool: SupportedTool | null;
  verdict: CopyVerdict;
  linkedPath: string | null;
};

type LocalCopyWrite = "deploy" | "remove" | "update";

export type LocalCopyScope = {
  write: LocalCopyWrite;
  target: DeployTarget;
};

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

export function linkedPathAmong(
  check: LocalCopyCheck,
  names: readonly string[],
): string | undefined {
  return (
    check.findings.find((f) => f.linkedPath !== null && names.includes(f.name))
      ?.linkedPath ?? undefined
  );
}

export function copyKeys(check: LocalCopyCheck): string[] {
  return check.findings.map(copyKey).sort();
}

export const copyKey = (finding: CopyFinding): string =>
  `${finding.name}:${finding.tool ?? ""}:${finding.verdict}`;

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

  async check(
    input: LocalCopyScope & {
      names: readonly string[];
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
