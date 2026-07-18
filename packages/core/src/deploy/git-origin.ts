// Derives host + owner/repo from a git origin url, the two pieces apm's package
// reference needs. Two remote shapes exist: scheme URLs (https://, ssh://) and
// the scp-like SSH form (git@host:owner/repo). Anything it cannot parse — or
// whose transport the ref cannot carry — is null; the caller treats that as
// "origin unavailable", never a guess.

export type GitOrigin = { host: string; ownerRepo: string };

// scp-like SSH form has no `://` and uses a colon before the path.
const scpPattern = /^[^/]+@([^:]+):(.+?)(?:\.git)?$/;

// Only schemes apm can actually resolve back a usable package ref; a file:
// remote parses cleanly (file://server/… even carries a hostname), a git://
// daemon remote is unsupported by apm 0.20, and an http:-only remote can state
// its plaintext transport only in the ref form that refuses a skill's subpath
// (issue #152; the observed grammar is in `.claude/rules/apm-driver.md`) — all
// would defer the failure to the first deploy. Allowlist, never blocklist
// (security.md).
const usableSchemes = new Set(["https:", "ssh:"]);

// `URL` blanks a default port only for the schemes it knows, which excludes
// ssh — so `ssh://host:22/…` keeps its port where `https://host:443/…` does
// not. Both reach the host apm's default transport would, so both are
// representable and neither should be refused for its port.
const defaultPorts = new Map([
  ["https:", "443"],
  ["ssh:", "22"],
]);

// apm reads a trailing `skills/<name>` as a virtual package only for the host
// shapes it knows; on any other host that subpath silently becomes part of the
// repo name, so the ref names a repo that does not exist. Tag resolution is
// GitHub-only besides (ADR-0003), which leaves exactly one usable host.
const deployableHosts = new Set(["github.com"]);

const fromHostAndPath = (rawHost: string, path: string): GitOrigin | null => {
  // DNS is case-insensitive, but `URL` lowercases the host only for the
  // schemes it knows — ssh:// and the scp-like form keep the remote's own
  // spelling. Normalize first (code-standards.md) so a valid host is never
  // refused, and never named back, on casing alone.
  const host = rawHost.toLowerCase();
  // Allowlist, never blocklist (security.md). It also covers the hostless
  // scheme url (ssh:///owner/repo), which parses fine but names no host.
  if (!deployableHosts.has(host)) {
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
  // Scheme URLs go through URL, which drops any userinfo from
  // the host for free — so a credentialed remote never leaks its token into
  // the host, the apm package ref, or argv.
  if (url.includes("://")) {
    try {
      const parsed = new URL(url);
      if (!usableSchemes.has(parsed.protocol)) {
        return null;
      }
      // A non-default port is transport apm's skill ref cannot carry (issue
      // #152; the observed grammar is in `.claude/rules/apm-driver.md`).
      // Dropping it silently would send apm to the default port and fail at
      // the first deploy, so refuse here instead.
      const isDefaultPort =
        parsed.port.length === 0 ||
        parsed.port === defaultPorts.get(parsed.protocol);
      if (!isDefaultPort) {
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
