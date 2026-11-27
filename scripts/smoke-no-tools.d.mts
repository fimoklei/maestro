export function noToolsMismatch(input: {
  deployState: { folders?: { tool: string; detected: boolean }[] } | null;
  repos: { path: string }[];
  keptRepos: string[];
}): string | null;
