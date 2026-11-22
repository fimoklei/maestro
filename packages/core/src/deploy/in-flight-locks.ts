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
