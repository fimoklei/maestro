// Both directions count: an extra file the lockfile never recorded is drift the
// next same-ref install would silently reset (#56).
export type DeployedFileHashes = Record<string, string>;

type DeployedDrift = "clean" | "diverged";

export function classifyDeployedDrift(
  lockHashes: DeployedFileHashes,
  liveHashes: DeployedFileHashes,
): DeployedDrift {
  const lockPaths = Object.keys(lockHashes);
  const livePaths = Object.keys(liveHashes);

  for (const path of lockPaths) {
    if (liveHashes[path] !== lockHashes[path]) {
      return "diverged";
    }
  }
  for (const path of livePaths) {
    if (!(path in lockHashes)) {
      return "diverged";
    }
  }
  return "clean";
}
