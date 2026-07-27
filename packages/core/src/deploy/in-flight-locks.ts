// The in-process lock every apm write to one target takes. Deploy and remove
// both rewrite the same apm.lock.yaml, so they must queue behind one another
// per target rather than each guarding only against itself — a deploy racing a
// remove on the same repo would corrupt that file. Refuse-don't-queue: a second
// caller is told the target is busy, the same shape the cockpit already reports
// for a double-clicked deploy.
//
// The key is a canonical repo path, or the literal "global" for the user scope.
// A canonical path is always absolute, so it can never collide with that
// literal.
export const GLOBAL_LOCK_KEY = "global";

export type LockedRunResult<T> = { ok: true; value: T } | { ok: false };

export class InFlightLocks {
  private readonly held = new Set<string>();

  // Runs `work` while holding `key`, or answers { ok: false } when the key is
  // already held. The key is released even when the work throws, so one failure
  // cannot wedge a target for the process's lifetime.
  async run<T>(
    key: string,
    work: () => Promise<T>,
  ): Promise<LockedRunResult<T>> {
    if (this.held.has(key)) {
      return { ok: false };
    }
    this.held.add(key);
    try {
      return { ok: true, value: await work() };
    } finally {
      this.held.delete(key);
    }
  }
}
