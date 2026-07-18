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
import { useState } from "react";
import { HttpError } from "../api/http";
import { useRegisterRepo } from "./use-registry";

export type RegistrationOutcome = {
  path: string;
  ok: boolean;
  // Short, readable, and honest: what the server actually said, never a claim
  // the cockpit did not check.
  reason: string;
};

export function useRegisterRepos() {
  const register = useRegisterRepo();
  const [outcomes, setOutcomes] = useState<RegistrationOutcome[]>([]);
  const [isRegistering, setIsRegistering] = useState(false);

  async function registerRepos(paths: string[]) {
    setIsRegistering(true);
    // A fresh run reports on its own selection, not on the previous one.
    setOutcomes([]);
    try {
      for (const path of paths) {
        const outcome = await registerOne(path, register.mutateAsync);
        setOutcomes((current) => [...current, outcome]);
      }
    } finally {
      // Whatever went wrong, the run is over — never strand the UI as busy.
      setIsRegistering(false);
    }
  }

  return { outcomes, isRegistering, registerRepos };
}

async function registerOne(
  path: string,
  registerOnePath: (path: string) => Promise<unknown>,
): Promise<RegistrationOutcome> {
  try {
    await registerOnePath(path);
    return { path, ok: true, reason: "registered" };
  } catch (error) {
    const message =
      error instanceof HttpError
        ? error.message
        : "could not reach Maestro to register it";
    return { path, ok: false, reason: `skipped · ${message}` };
  }
}
