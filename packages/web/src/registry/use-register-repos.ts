// No batch endpoint: one repo at a time (#151), sequential — the server
// serializes registration anyway. One failure never stops the run.
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { HttpError } from "../api/http";
import { registerMessage } from "./notice-copy";
import {
  REGISTRY_KEY,
  type RegistryResponse,
  useRegisterRepo,
} from "./use-registry";

export type RegistrationOutcome = {
  // Deduplicated, so unique within a run even where `path` isn't — a symlink
  // and its target share a stored path but never a requested one.
  requestedPath: string;
  // Not always the sent path: registration canonicalizes with realpath, so a
  // symlinked repo lands under its target.
  path: string;
  ok: boolean;
  reason: string;
};

export function useRegisterRepos() {
  const register = useRegisterRepo();
  const queryClient = useQueryClient();
  const [outcomes, setOutcomes] = useState<RegistrationOutcome[]>([]);
  // The run's whole selection, so the report can list what it still owes.
  const [runPaths, setRunPaths] = useState<string[]>([]);
  const [isRegistering, setIsRegistering] = useState(false);

  async function registerRepos(paths: string[]) {
    // Two overlapping runs would interleave their outcomes.
    if (isRegistering) {
      return;
    }
    setIsRegistering(true);
    setOutcomes([]);
    setRunPaths(paths);
    try {
      // The entry not there before a call is what the server stored — the
      // only way to learn a repo's canonical path. Seeded from cache since
      // invalidateQueries doesn't update it in time to read back mid-run.
      let known = cachedPaths(queryClient);
      for (const path of paths) {
        const result = await registerOne(path, register.mutateAsync, known);
        setOutcomes((current) => [...current, result.outcome]);
        known = result.registry ?? known;
      }
    } finally {
      setIsRegistering(false);
    }
  }

  // Refused mid-run: the outcomes on screen belong to the run producing them.
  function reset() {
    if (!isRegistering) {
      setOutcomes([]);
      setRunPaths([]);
    }
  }

  return { outcomes, runPaths, isRegistering, registerRepos, reset };
}

function cachedPaths(
  queryClient: ReturnType<typeof useQueryClient>,
): ReadonlySet<string> | undefined {
  const cached = queryClient.getQueryData<RegistryResponse>(REGISTRY_KEY);
  return cached && new Set(cached.repos.map((repo) => repo.path));
}

async function registerOne(
  path: string,
  registerOnePath: (path: string) => Promise<RegistryResponse>,
  known: ReadonlySet<string> | undefined,
): Promise<{
  outcome: RegistrationOutcome;
  registry?: ReadonlySet<string>;
}> {
  try {
    const { repos } = await registerOnePath(path);
    return {
      outcome: {
        requestedPath: path,
        path: storedPath(path, repos, known),
        ok: true,
        reason: "registered",
      },
      registry: new Set(repos.map((repo) => repo.path)),
    };
  } catch (error) {
    const message =
      error instanceof HttpError
        ? (registerMessage(error.code) ?? error.message)
        : "could not reach Maestro to register it";
    return {
      outcome: {
        requestedPath: path,
        path,
        ok: false,
        reason: `skipped · ${message}`,
      },
    };
  }
}

// An exact hit settles it; otherwise the entry absent before the call is the
// one the server wrote.
function storedPath(
  sent: string,
  repos: RegistryResponse["repos"],
  known: ReadonlySet<string> | undefined,
): string {
  if (repos.some((repo) => repo.path === sent)) {
    return sent;
  }
  const added = known && repos.find((repo) => !known.has(repo.path));
  return added ? added.path : sent;
}
