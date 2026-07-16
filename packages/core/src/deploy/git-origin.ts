// Derives host + owner/repo from a git origin url, the two pieces apm's package
// reference needs. Two remote shapes exist: scheme URLs (https://, ssh://,
// http://) and the scp-like SSH form (git@host:owner/repo). Anything it cannot
// parse is null — the caller treats that as "origin unavailable", never a guess.

export type GitOrigin = { host: string; ownerRepo: string };

// scp-like SSH form has no `://` and uses a colon before the path.
const scpPattern = /^[^/]+@([^:]+):(.+?)(?:\.git)?$/;

// Only schemes apm can actually resolve back a usable package ref; a file:
// remote parses cleanly (file://server/… even carries a hostname) and a
// git:// daemon remote is unsupported by apm 0.20 — both would defer the
// failure to the first deploy. Allowlist, never blocklist (security.md).
const usableSchemes = new Set(["https:", "http:", "ssh:"]);

const fromHostAndPath = (host: string, path: string): GitOrigin | null => {
  // A hostless scheme url (ssh:///owner/repo) parses fine but cannot
  // produce a valid apm package ref — no host, no origin.
  if (host.length === 0) {
    return null;
  }
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
      if (!usableSchemes.has(parsed.protocol)) {
        return null;
      }
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
