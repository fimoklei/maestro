export function editCopyByHand(skillDir: string): void;

export function recordHashes(
  lockfileText: string,
  hashes: Record<string, string>,
): string;

export function putOlderCopy(input: {
  root: string;
  lockfilePath: string;
  releaseTree: string;
  copyDir: string;
  skill: string;
}): void;
