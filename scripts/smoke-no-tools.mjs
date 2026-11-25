import { removeToolPresence } from "./seed-sandbox.mjs";

export const NO_TOOLS_SCENARIO = "no-tools";

const list = (names) => [...names].sort().join(", ") || "none";

export function noToolsMismatch({ deployState, repos, keptRepos }) {
  const problems = [];
  const folders = deployState?.folders;
  if (!Array.isArray(folders) || folders.length === 0)
    problems.push("Global expected its folders, got none");
  else {
    const detected = folders.filter((folder) => folder.detected);
    if (detected.length > 0)
      problems.push(
        `Global expected no detected tool, got ${list(detected.map(({ tool }) => tool))}`,
      );
  }
  const extra = repos
    .map(({ path }) => path)
    .filter((path) => !keptRepos.includes(path));
  if (extra.length > 0)
    problems.push(
      `expected no other registered repository, got ${list(extra)}`,
    );
  return problems.length === 0
    ? null
    : `scenario "${NO_TOOLS_SCENARIO}": ${problems.join("; ")}`;
}

export async function seedNoTools(api, { home, keptRepos }) {
  removeToolPresence(home);
  const { repos } = await api.get("/api/registry/repos");
  for (const { path } of repos ?? [])
    if (!keptRepos.includes(path))
      await api.del("/api/registry/repos", { path });
  return noToolsMismatch({
    deployState: await api.get("/api/deploy-state/global"),
    repos: (await api.get("/api/registry/repos")).repos ?? [],
    keptRepos,
  });
}
