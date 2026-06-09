// Derives host + owner/repo from a git origin url, the two pieces apm's package
// reference needs. Two remote shapes exist: scheme URLs (https://, ssh://,
// http://) and the scp-like SSH form (git@host:owner/repo). Anything it cannot
// parse is null — the caller treats that as "origin unavailable", never a guess.

export type GitOrigin = { host: string; ownerRepo: string };

// scp-like SSH form has no `://` and uses a colon before the path.
const scpPattern = /^[^/]+@([^:]+):(.+?)(?:\.git)?$/;

const fromHostAndPath = (host: string, path: string): GitOrigin | null => {
  const segments = path
    .replace(/\.git$/, "")
    .split("/")
    .filter((s) => s.length > 0);
  if (segments.length !== 2) {
    return null;
  }
  return { host, ownerRepo: segments.join("/") };
};

export const parseGitOrigin = (url: string): GitOrigin | null => {
  // Scheme URLs (https/ssh/http) go through URL, which drops any userinfo from
  // the host for free — so a credentialed remote never leaks its token into
  // the host, the apm package ref, or argv.
  if (url.includes("://")) {
    try {
      const parsed = new URL(url);
      return fromHostAndPath(parsed.hostname, parsed.pathname);
    } catch {
      return null;
    }
  }

  const match = scpPattern.exec(url);
  if (match?.[1] === undefined || match[2] === undefined) {
    return null;
  }
  return fromHostAndPath(match[1], match[2]);
};
