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

type Auth = "authed" | "anon";

export interface Sandbox {
  home: string;
  repo: string;
  neutral: string;
  cwd: string;
  env(auth: Auth, columns?: number): Record<string, string | undefined>;
  apm(args: string[], extraEnv?: Record<string, string>): void;
}

export function sandbox(root: string, token: string): Sandbox;

export function capture(
  box: Sandbox,
  row: {
    capture: [Auth, string[]];
    exit: number;
    columns?: number;
    streams?: "out" | "err";
    env?: (box: Sandbox) => Record<string, string>;
  },
  file: string,
): { text: string; exit: number | null };
