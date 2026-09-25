/** What the dev launcher may do here; Windows lacks `lsof`, `ps` and process groups (#719). */
export function launchPolicy(platform) {
  const posix = platform !== "win32";
  return { singleInstance: posix, detached: posix };
}
