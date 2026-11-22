export class ReuseGate<T> {
  private readonly now: () => number;
  private readonly keep: (value: T) => boolean;
  private readonly running = new Map<string, Promise<T>>();
  private readonly settled = new Map<string, { value: T; at: number }>();
  private readonly invalidatedWhileRunning = new Set<string>();

  constructor(deps: { now: () => Date; keep: (value: T) => boolean }) {
    this.now = () => deps.now().getTime();
    this.keep = deps.keep;
  }

  run(key: string, maxAgeMs: number, work: () => Promise<T>): Promise<T> {
    const inFlight = this.running.get(key);
    if (inFlight !== undefined && !this.invalidatedWhileRunning.has(key)) {
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

    this.invalidatedWhileRunning.delete(key);
    const start = async () => {
      const at = this.now();
      const value = await work();
      if (
        this.running.get(key) === running &&
        !this.invalidatedWhileRunning.has(key) &&
        this.keep(value)
      ) {
        this.settled.set(key, { value, at });
      }
      return value;
    };
    const running: Promise<T> = (
      inFlight === undefined ? start() : inFlight.then(start, start)
    ).finally(() => {
      if (this.running.get(key) === running) {
        this.running.delete(key);
        this.invalidatedWhileRunning.delete(key);
      }
    });
    this.running.set(key, running);
    return running;
  }

  invalidate(key: string): void {
    this.settled.delete(key);
    if (this.running.has(key)) {
      this.invalidatedWhileRunning.add(key);
    }
  }

  invalidateAll(): void {
    this.settled.clear();
    for (const key of this.running.keys()) {
      this.invalidatedWhileRunning.add(key);
    }
  }
}
