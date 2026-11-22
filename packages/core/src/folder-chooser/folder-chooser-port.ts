export type ChooserAnswer =
  | { kind: "picked"; output: string }
  | { kind: "cancelled" }
  | { kind: "failed" };

export interface FolderChooserPort {
  isPresent(): Promise<boolean>;
  open(start: string): Promise<ChooserAnswer>;
}

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

export const CHOOSER_TIMEOUT_MS = 5 * 60 * 1000;
