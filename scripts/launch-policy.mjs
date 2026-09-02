/**
 * What the dev launcher may do on this platform. The single-instance steps read
 * `lsof` and `ps` and signal a process group; Windows has none of the three, so
 * there both they and the detached group are off and the children run in the
 * foreground (#719).
 */
export function launchPolicy(platform) {
  const posix = platform !== "win32";
  return { singleInstance: posix, detached: posix };
}
