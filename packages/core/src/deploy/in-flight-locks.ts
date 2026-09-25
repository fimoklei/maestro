// The in-process lock every apm write to one target takes. Refuse, don't queue.

// A canonical repo path is always absolute, so it can never collide with this.
export const GLOBAL_LOCK_KEY = "global";

export type LockedRunResult<T> = { ok: true; value: T } | { ok: false };

export class InFlightLocks {
  private readonly held = new Set<string>();

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
