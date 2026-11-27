export function normalizeHome(text: string, home: string): string;

export function markRows(
  readme: string,
  verdicts: ReadonlyMap<string, string>,
): string;

export function verdict(capture: {
  text: string;
  exit: number | null;
  expectedExit: number;
  /** The committed fixture; null when none exists yet. */
  committed: string | null;
}): "new" | "throttled" | "exit-mismatch" | "same" | "differs";
