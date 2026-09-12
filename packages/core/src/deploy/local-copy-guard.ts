// The one guard that stands between a write and a deployed copy carrying work.
// Every write entry point — deploy, remove, the per-skill uninstall migration
// runs, and the Update slices to come — classifies through `check` and is
// licensed through `admits`. See ADR-0006, ADR-0031, #952.
import type {
  DeployedContentPort,
  DeployedContentState,
  DeployTarget,
} from "./deploy-skill";
import type { SupportedTool } from "./deploy-tools";
import { ConsentSigner } from "./signed-consent";

// Named for what the reader is told, not for the classifier state behind it
// (CONTEXT.md § Content drift). "clean" covers a copy equal to its recorded
// baseline, a copy equal in full to the chosen release, and no copy at all.
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

// The two a reader can consent to. With no readable evidence there is nothing
// to consent about, so those block outright (fail closed, #952).
const CONSENTABLE = new Set<CopyVerdict>(["local-edits", "unverified"]);

// One copy: one skill in one tool's subtree, or the whole copy where the write
// does not split by tool (`tool: null` on the repo scope).
export type CopyFinding = {
  name: string;
  tool: SupportedTool | null;
  verdict: CopyVerdict;
};

// Which write the consent is for. A deploy's receipt never licenses a removal:
// the reader agreed to one effect, not to any effect.
export type LocalCopyWrite = "deploy" | "remove" | "update";

export type LocalCopyScope = {
  write: LocalCopyWrite;
  target: DeployTarget;
};

// `digest` fingerprints the bytes of every copy consent would cover, so a
// second edit under the same verdict retires the consent (spec story 41).
// Null where no copy needs consent.
export type LocalCopyCheck = {
  findings: readonly CopyFinding[];
  digest: string | null;
};

// `receipt` is null where no consent exists, so a caller cannot offer a way
// past a refusal that has none.
export type LocalCopyDecision =
  | { ok: true }
  | {
      ok: false;
      blocked: Exclude<CopyVerdict, "clean">;
      check: LocalCopyCheck;
      receipt: string | null;
    };

// Order-independent: the same copies in another order are the same consent.
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
    content: Pick<DeployedContentPort, "classify" | "contentDigest">;
  };
  private readonly signer = new ConsentSigner();

  constructor(deps: LocalCopyGuard["deps"]) {
    this.deps = deps;
  }

  // One finding per copy the write would land on. `release` is the release the
  // write installs: a copy that differs from its record but equals that release
  // in full is clean, and a release that cannot be read grants no such pass.
  async check(
    input: LocalCopyScope & {
      names: readonly string[];
      // Given, the check asks per tool, which is the grain consent is stated
      // at (#952). Absent, one answer covers the whole copy.
      tools?: readonly SupportedTool[];
      release?: string;
    },
  ): Promise<LocalCopyCheck> {
    const scopes: (SupportedTool | null)[] = input.tools
      ? [...input.tools]
      : [null];
    const findings: CopyFinding[] = [];
    // Only consentable copies are fingerprinted: nothing else can be waved
    // through, so nothing else needs its bytes bound.
    const bytes: string[] = [];
    for (const name of input.names) {
      for (const tool of scopes) {
        const verdict = await this.classify(input, name, tool);
        findings.push({ name, tool, verdict });
        if (CONSENTABLE.has(verdict)) {
          bytes.push(
            `${name}:${tool ?? ""}:${await this.digest(input, name, tool)}`,
          );
        }
      }
    }
    return {
      findings,
      digest: bytes.length === 0 ? null : bytes.sort().join("\n"),
    };
  }

  // The write's verdict against the copies just read, and the receipt that
  // would license it. The check is what the guard found now, never what the
  // caller claims: a receipt minted for other content is no consent for this
  // (#364, #952).
  admits(
    scope: LocalCopyScope,
    check: LocalCopyCheck,
    receipt?: string,
  ): LocalCopyDecision {
    const blocked = BLOCKING.find((verdict) =>
      check.findings.some((finding) => finding.verdict === verdict),
    );
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

  // The proof that this server read these copies itself, for this write, on
  // this target. Every fact it covers is in the signature, so changing any of
  // them retires the consent.
  receipt(scope: LocalCopyScope, check: LocalCopyCheck): string {
    return this.signer.sign({
      kind: "local-copy",
      write: scope.write,
      target:
        scope.target.kind === "repo"
          ? { kind: "repo", repoPath: scope.target.repoPath }
          : { kind: "global" },
      // Order-independent: the same copies in another order are the same
      // consent.
      copies: copyKeys(check),
      content: check.digest,
    });
  }

  // Null is "nothing could be read", which is never consentable: it can only
  // widen a refusal, never license a write (fail closed).
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

  // Caught per copy: one unreadable subtree answers for itself, and a check
  // that threw is never reported as a clean copy (J04).
  private async classify(
    input: LocalCopyScope & { release?: string },
    name: string,
    tool: SupportedTool | null,
  ): Promise<CopyVerdict> {
    try {
      return VERDICTS[
        await this.deps.content.classify({
          target: input.target,
          name,
          ...(tool === null ? {} : { tools: [tool] }),
          ...(input.release === undefined ? {} : { release: input.release }),
        })
      ];
    } catch {
      return "unreadable";
    }
  }
}
