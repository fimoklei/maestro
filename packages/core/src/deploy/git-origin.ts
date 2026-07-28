// Derives host + owner/repo from a git origin url. Anything it cannot parse, or
// whose transport apm's ref cannot carry, is null — the caller reads that as
// "origin unavailable", never a guess. See ADR-0014, #152.

type GitOrigin = { host: string; ownerRepo: string };

// scp-like SSH form has no `://` and uses a colon before the path.
const scpPattern = /^[^/]+@([^:]+):(.+?)(?:\.git)?$/;

// Allowlist, never blocklist (security.md). file:, git: and http: all parse
// cleanly but cannot round-trip to a usable skill ref (#152).
const usableSchemes = new Set(["https:", "ssh:"]);

// `URL` blanks a default port only for the schemes it knows, which excludes
// ssh — so `ssh://host:22/…` keeps its port where `https://host:443/…` does
// not. Both are representable, so neither is refused for its port.
const defaultPorts = new Map([
  ["https:", "443"],
  ["ssh:", "22"],
]);

// ADR-0014.
const deployableHosts = new Set(["github.com"]);

const fromHostAndPath = (rawHost: string, path: string): GitOrigin | null => {
  // `URL` lowercases the host only for the schemes it knows; ssh:// and the
  // scp-like form keep the remote's own spelling, and DNS is case-insensitive.
  const host = rawHost.toLowerCase();
  // Also covers the hostless scheme url (ssh:///owner/repo), which parses fine
  // but names no host.
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
  // `URL` drops userinfo, so a credentialed remote never leaks its token into
  // the host, the package ref, or argv.
  if (url.includes("://")) {
    try {
      const parsed = new URL(url);
      if (!usableSchemes.has(parsed.protocol)) {
        return null;
      }
      // Refused here rather than dropped: silently dropping the port would send
      // apm to the default one and fail at the first deploy (#152).
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
