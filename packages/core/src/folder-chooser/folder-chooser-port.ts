/** `picked` output is still untrusted text. */
export type ChooserAnswer =
  | { kind: "picked"; output: string }
  | { kind: "cancelled" }
  | { kind: "failed" };

export interface FolderChooserPort {
  isPresent(): Promise<boolean>;
  /** `start` is an existing absolute folder, passed to the helper as data. */
  open(start: string): Promise<ChooserAnswer>;
}

/** How a helper process ended; never throws, so every end is classified. */
export type HelperOutcome = {
  exitCode: number | null;
  killed: boolean;
  stdout: string;
  stderr: string;
};

export type RunHelper = (
  file: string,
  args: string[],
  options: { env: NodeJS.ProcessEnv; timeout: number },
) => Promise<HelperOutcome>;

/** One chooser stays open at most this long; the kill counts as a cancel. */
export const CHOOSER_TIMEOUT_MS = 5 * 60 * 1000;
