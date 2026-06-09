// Derives host + owner/repo from a git origin url (SSH or HTTPS), the two
// pieces apm's package reference needs. Anything it cannot parse is null —
// the caller treats that as "origin unavailable", never a guess.

export type GitOrigin = { host: string; ownerRepo: string };

const sshPattern = /^git@([^:]+):(.+?)(?:\.git)?$/;
const httpsPattern = /^https?:\/\/([^/]+)\/(.+?)(?:\.git)?$/;

export const parseGitOrigin = (url: string): GitOrigin | null => {
  const match = sshPattern.exec(url) ?? httpsPattern.exec(url);
  if (match === null) {
    return null;
  }
  const rawHost = match[1];
  const path = match[2];
  if (rawHost === undefined || path === undefined) {
    return null;
  }
  // Strip any userinfo (a credentialed HTTPS remote is `user:token@host`), so a
  // token never reaches the host, the apm package ref, or argv.
  const host = rawHost.slice(rawHost.lastIndexOf("@") + 1);
  const segments = path.split("/").filter((s) => s.length > 0);
  if (segments.length !== 2) {
    return null;
  }
  return { host, ownerRepo: segments.join("/") };
};
