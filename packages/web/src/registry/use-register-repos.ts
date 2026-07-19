// Registers a browse-picker selection one repo at a time (issue #151), and
// keeps what happened to each of them. There is no batch endpoint: the picker
// hands the host a list of paths and the host walks it through the existing
// single-repo registration mutation. Sequential, not parallel, because the
// server serializes registration anyway (Registry chains its read-modify-write)
// — and because a run the user can read off in order beats a race.
//
// One repo failing never stops the run and never rolls back the ones before
// it: each success is already persisted server-side, and the mutation
// invalidates the registry as it lands, so the repo appears among the targets
// immediately.
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { HttpError } from "../api/http";
import {
  REGISTRY_KEY,
  type RegistryResponse,
  useRegisterRepo,
} from "./use-registry";

export type RegistrationOutcome = {
  // The path the picker actually sent. The selection is deduplicated, so this
  // is unique within a run even where `path` is not — two entries resolving to
  // one target (a symlink and the directory it points at) share a stored path
  // but never a requested one.
  requestedPath: string;
  // The path the registry ended up holding, which is not always the one that
  // was sent: registration canonicalizes with realpath, so a symlinked repo
  // lands under its target. The host joins outcomes onto its repo rows by
  // this path, so it has to be the stored one.
  path: string;
  ok: boolean;
  // Short, readable, and honest: what the server actually said, never a claim
  // the cockpit did not check.
  reason: string;
};

export function useRegisterRepos() {
  const register = useRegisterRepo();
  const queryClient = useQueryClient();
  const [outcomes, setOutcomes] = useState<RegistrationOutcome[]>([]);
  const [isRegistering, setIsRegistering] = useState(false);

  async function registerRepos(paths: string[]) {
    // Two overlapping runs would interleave their outcomes and let the first
    // to finish declare the whole thing done. The hook owns that invariant,
    // not the button that happens to be disabled.
    if (isRegistering) {
      return;
    }
    setIsRegistering(true);
    // A fresh run reports on its own selection, not on the previous one.
    setOutcomes([]);
    try {
      // Every response is the full registry, so the entry that was not there
      // before a call is what the server stored for it — the only way to learn
      // the canonical path of a repo it resolved elsewhere. Seeded from the
      // cache and then carried forward from each response, because the
      // mutation only invalidates the query; the cache is not updated in time
      // to be read back between calls. A cold cache skips the comparison
      // rather than guessing, falling back to matching the sent path exactly.
      let known = cachedPaths(queryClient);
      for (const path of paths) {
        const result = await registerOne(path, register.mutateAsync, known);
        setOutcomes((current) => [...current, result.outcome]);
        known = result.registry ?? known;
      }
    } finally {
      // Whatever went wrong, the run is over — never strand the UI as busy.
      setIsRegistering(false);
    }
  }

  // Clears the last run so a new picker session opens on the listing rather
  // than on a report the user already dismissed. Refused mid-run for the same
  // reason a second run is: the outcomes on screen belong to the run producing
  // them.
  function reset() {
    if (!isRegistering) {
      setOutcomes([]);
    }
  }

  return { outcomes, isRegistering, registerRepos, reset };
}

// The set of paths the registry holds right now, or undefined when the query
// has not been read yet.
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
        ? error.message
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

// Which entry this registration is. The sent path usually survives untouched,
// so an exact hit settles it. Otherwise the server resolved the path, and the
// entry that was absent before the call is the one it wrote.
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
