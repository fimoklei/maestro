// Read-only despite the POST: the path goes in the body. Kept out of the
// mutation so the answer is on screen before the user commits (#337).
import type {
  RemoveCheck,
  RemoveToolCheck,
  RemoveWarning,
} from "@maestro/core";
import { useQuery } from "@tanstack/react-query";
import { requestJson } from "../api/http";
import {
  type DeployTarget,
  targetQueryKey,
} from "../inventory/use-deploy-skill";

export type RemovePreflight = {
  check: RemoveCheck;
  // Optional: an older server sends none, and the removal then refuses (#458).
  receipt?: string;
};

// All or nothing: this body prices an irreversible removal, so a part this
// build cannot read makes the whole answer unreadable, never clean (#793).
export function readRemovePreflight(body: unknown): RemovePreflight | null {
  const value = body as
    | { check?: unknown; receipt?: unknown }
    | null
    | undefined;
  const check = readCheck(value?.check);
  if (check === null) {
    return null;
  }
  if (value?.receipt === undefined) {
    return { check };
  }
  return typeof value.receipt === "string"
    ? { check, receipt: value.receipt }
    : null;
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

// Keyed by core's union, so a warning added there must be allowed here too.
const WARNINGS: Record<RemoveWarning, true> = {
  "cannot-verify-local-edits": true,
  "check-did-not-run": true,
};

// `undefined` means unreadable; `null` means this copy costs nothing.
function readWarning(value: unknown): RemoveWarning | null | undefined {
  if (value === null) {
    return null;
  }
  return typeof value === "string" && Object.hasOwn(WARNINGS, value)
    ? (value as RemoveWarning)
    : undefined;
}

// Shared with the bulk path: one owner for the key and the never-cached contract.
export function removePreflightQueryOptions(
  skillName: string | null,
  target: DeployTarget,
) {
  return {
    queryKey: ["remove-preflight", targetQueryKey(target), skillName] as const,
    queryFn: async (): Promise<RemovePreflight> => {
      const preflight = readRemovePreflight(
        await requestJson<unknown>("/api/deploy/remove/preflight", {
          method: "POST",
          body: JSON.stringify({ type: "skill", name: skillName, target }),
        }),
      );
      if (preflight === null) {
        throw new Error("The remove check answered in an unreadable shape.");
      }
      return preflight;
    },
    enabled: skillName !== null,
    // Fresh every open: a cached answer from before an edit is the one lie
    // this check exists to prevent.
    gcTime: 0,
    staleTime: 0,
  };
}

export function useRemovePreflight(
  skillName: string | null,
  target: DeployTarget,
) {
  return useQuery(removePreflightQueryOptions(skillName, target));
}
