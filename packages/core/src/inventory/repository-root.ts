import { runGit } from "../git/run-git-text";

export const isRepositoryRoot = async (
  realRepoPath: string,
): Promise<boolean> => {
  const toplevel = await runGit(realRepoPath, ["rev-parse", "--show-toplevel"]);
  return toplevel.ok && toplevel.stdout === realRepoPath;
};
