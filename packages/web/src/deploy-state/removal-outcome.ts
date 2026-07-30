// Reads the per-target outcome the server sends with a failed removal (#416).
import type {
  RemoveOutcome,
  RemoveTargetState,
  RemoveToolOutcome,
} from "@maestro/core";
import { HttpError } from "../api/http";

const STATES: Record<string, RemoveTargetState> = {
  removed: "removed",
  "not-removed": "not-removed",
  unknown: "unknown",
};

// Nothing validates this body. A report this build cannot read is dropped
// whole rather than half-drawn: a ledger built on a guess states an outcome the
// server never proved (J04).
export function removalOutcome(error: unknown): RemoveOutcome | null {
  if (!(error instanceof HttpError)) {
    return null;
  }
  const outcome = (error.body as { outcome?: unknown } | undefined)?.outcome as
    | { scope?: unknown; state?: unknown; tools?: unknown }
    | undefined;
  if (outcome?.scope === "repo") {
    const state = STATES[String(outcome.state)];
    return state === undefined ? null : { scope: "repo", state };
  }
  if (outcome?.scope === "global" && Array.isArray(outcome.tools)) {
    const tools: RemoveToolOutcome[] = [];
    for (const entry of outcome.tools as {
      tool?: unknown;
      state?: unknown;
    }[]) {
      const state = STATES[String(entry?.state)];
      if (state === undefined || typeof entry?.tool !== "string") {
        return null;
      }
      tools.push({ tool: entry.tool as RemoveToolOutcome["tool"], state });
    }
    return { scope: "global", tools };
  }
  return null;
}
