// Reads the question a refused removal restated (#364). All or nothing.
import type {
  ReclaimConsent,
  ReclaimPreview,
  RemoveCheck,
  RemoveToolCheck,
  RemoveWarning,
} from "@maestro/core";
import { HttpError } from "../api/http";

// Allowlisted: an unknown warning would land on a row as silence, which reads as
// nothing to lose.
const WARNINGS: Record<string, RemoveWarning> = {
  "cannot-verify-local-edits": "cannot-verify-local-edits",
  "check-did-not-run": "check-did-not-run",
};

// Never partial: a fresh cost paired with an older consent is what #364 prevents.
export type RestatedCost = {
  check: RemoveCheck;
  receipt: string;
  reclaim: ReclaimConsent | null;
};

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

// `undefined` means unreadable; `null` means the removal leaves no copy behind.
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

// `undefined` means unreadable; `null` means this copy costs nothing.
function readWarning(value: unknown): RemoveWarning | null | undefined {
  if (value === null) {
    return null;
  }
  return typeof value === "string" ? WARNINGS[value] : undefined;
}
