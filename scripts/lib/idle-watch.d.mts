export function idleWatch(options: { limitMs: number; startedAt: number }): {
  output(now: number): void;
  check(now: number): number | null;
};
