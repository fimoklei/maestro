export function treeFingerprint(cwd: string): string;

export function recordGreenRun(
  logDir: string,
  run: { fingerprint: string; finishedAt: string; logs: string[] },
): void;

export function reusableGreenRun(
  logDir: string,
  fingerprint: string,
): { finishedAt: string } | null;

export function forgetGreenRun(logDir: string): void;

export function startRun(
  logDir: string,
  fingerprint: string | null,
  options: { force: boolean },
): { finishedAt: string } | null;

export function finishRun(
  logDir: string,
  run: {
    passed: boolean;
    before: string | null;
    after: string | null;
    finishedAt: string;
    logs: string[];
  },
): "recorded" | "red" | "tree-changed" | "no-fingerprint";
