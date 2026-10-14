// One run per key at a time, and a settled answer reused while it is younger
// than the caller's maximum age. A rejected run is never reused.
export class ReuseGate<T> {
  private readonly now: () => number;
  private readonly running = new Map<string, Promise<T>>();
  private readonly settled = new Map<string, { value: T; at: number }>();
  // Keys whose run in flight started before an invalidation.
  private readonly outdated = new Set<string>();

  constructor(deps: { now: () => Date }) {
    this.now = () => deps.now().getTime();
  }

  // A maximum age of zero always runs, but still joins a run in flight.
  run(key: string, maxAgeMs: number, work: () => Promise<T>): Promise<T> {
    const inFlight = this.running.get(key);
    if (inFlight !== undefined && !this.outdated.has(key)) {
      return inFlight;
    }
    const last = this.settled.get(key);
    if (
      inFlight === undefined &&
      last !== undefined &&
      this.now() - last.at < maxAgeMs
    ) {
      return Promise.resolve(last.value);
    }

    this.outdated.delete(key);
    const start = async () => {
      const at = this.now();
      const value = await work();
      if (this.running.get(key) === running && !this.outdated.has(key)) {
        this.settled.set(key, { value, at });
      }
      return value;
    };
    // Queued behind an outdated run, never beside it.
    const running: Promise<T> = (
      inFlight === undefined ? start() : inFlight.then(start, start)
    ).finally(() => {
      if (this.running.get(key) === running) {
        this.running.delete(key);
        this.outdated.delete(key);
      }
    });
    this.running.set(key, running);
    return running;
  }

  // The next run for this key goes out, even within its maximum age.
  invalidate(key: string): void {
    this.settled.delete(key);
    if (this.running.has(key)) {
      this.outdated.add(key);
    }
  }
}
