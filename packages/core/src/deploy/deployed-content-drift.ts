// Pure classifier: does the deployed copy still match what apm recorded for it?
// Compares the lockfile's deployed_file_hashes (what was last installed) with a
// fresh hash of every live file in the deployed subtree. Both directions count:
// an edited or missing recorded file, or an untracked extra file, is drift the
// next same-ref apm install would silently reset (apm-driver.md, #56).
export type DeployedFileHashes = Record<string, string>;

type DeployedDrift = "clean" | "diverged";

export function classifyDeployedDrift(
  lockHashes: DeployedFileHashes,
  liveHashes: DeployedFileHashes,
): DeployedDrift {
  const lockPaths = Object.keys(lockHashes);
  const livePaths = Object.keys(liveHashes);

  // Edited or missing recorded file.
  for (const path of lockPaths) {
    if (liveHashes[path] !== lockHashes[path]) {
      return "diverged";
    }
  }
  // Untracked extra file the lockfile never recorded.
  for (const path of livePaths) {
    if (!(path in lockHashes)) {
      return "diverged";
    }
  }
  return "clean";
}
