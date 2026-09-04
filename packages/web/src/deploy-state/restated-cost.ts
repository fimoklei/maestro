// Reads the question a refused removal restated (#364): what the copy is now,
// the receipt that confirms exactly that, and the leftovers beside it. All or
// nothing.
import type {
  ReclaimConsent,
  ReclaimPreview,
  RemoveCheck,
  RemoveToolCheck,
  RemoveWarning,
} from "@maestro/core";
import { HttpError } from "../api/http";

// Allowlisted, because a warning this build does not know would land on a row
// as silence, which reads as nothing to lose (J04). The tool it sits on is the
// server's own token, and an unknown one is read as unchecked, never as clean.
const WARNINGS: Record<string, RemoveWarning> = {
  "cannot-verify-local-edits": "cannot-verify-local-edits",
  "check-did-not-run": "check-did-not-run",
};

// The whole question again, never part of it: the cost, the receipt that
// confirms that cost, and the leftovers the removal would delete beside it.
// Half of this pairs a fresh cost with an older consent, which is the failure
// #364 exists to prevent. No sentence here — the caller already holds the
// error, and `removeNotice` states it once (`copy.md`).
export type RestatedCost = {
  check: RemoveCheck;
  receipt: string;
  reclaim: ReclaimConsent | null;
};

// Nothing validates this body. A restatement this build cannot read whole is
// dropped whole: a ledger built on a guess prices a removal nobody checked.
export function restatedCost(error: unknown): RestatedCost | null {
  if (!(error instanceof HttpError) || error.code !== "cost-not-acknowledged") {
    return null;
  }
  const body = error.body as
    | { check?: unknown; receipt?: unknown; reclaim?: unknown }
    | undefined;
  const check = readCheck(body?.check);
  const reclaim = readReclaim(body?.reclaim);
  return check !== null &&
    reclaim !== undefined &&
    typeof body?.receipt === "string"
    ? { check, receipt: body.receipt, reclaim }
    : null;
}

// `undefined` means unreadable — never the same as `null`, which is the server
// saying this removal leaves no copy behind.
function readReclaim(value: unknown): ReclaimConsent | null | undefined {
  if (value === null || value === undefined) {
    return null;
  }
  const reclaim = value as { previews?: unknown; token?: unknown };
  if (typeof reclaim.token !== "string" || !Array.isArray(reclaim.previews)) {
    return undefined;
  }
  const previews: ReclaimPreview[] = [];
  for (const entry of reclaim.previews as {
    tool?: unknown;
    path?: unknown;
  }[]) {
    if (typeof entry?.tool !== "string" || typeof entry?.path !== "string") {
      return undefined;
    }
    previews.push({
      tool: entry.tool as ReclaimPreview["tool"],
      path: entry.path,
    });
  }
  return { previews, token: reclaim.token };
}

function readCheck(value: unknown): RemoveCheck | null {
  const check = value as
    | { scope?: unknown; warning?: unknown; tools?: unknown }
    | undefined;
  if (check?.scope === "repo") {
    const warning = readWarning(check.warning);
    return warning === undefined ? null : { scope: "repo", warning };
  }
  if (check?.scope === "global" && Array.isArray(check.tools)) {
    const tools: RemoveToolCheck[] = [];
    for (const entry of check.tools as {
      tool?: unknown;
      warning?: unknown;
    }[]) {
      const warning = readWarning(entry?.warning);
      if (typeof entry?.tool !== "string" || warning === undefined) {
        return null;
      }
      tools.push({ tool: entry.tool as RemoveToolCheck["tool"], warning });
    }
    return { scope: "global", tools };
  }
  return null;
}

// `undefined` means unreadable, and is never the same answer as `null`, which
// is the check saying this copy costs nothing.
function readWarning(value: unknown): RemoveWarning | null | undefined {
  if (value === null) {
    return null;
  }
  return typeof value === "string" ? WARNINGS[value] : undefined;
}
