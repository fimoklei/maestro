export const NO_BACKGROUND_GIT: [key: string, value: string][];

export function appendGitConfig(
  env: Record<string, string | undefined>,
  pairs: [key: string, value: string][],
): Record<string, string>;
