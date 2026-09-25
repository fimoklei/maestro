// Anything unparseable, or whose transport apm's ref cannot carry, is null:
// "origin unavailable", never a guess (#152).

export type GitOrigin = { host: string; ownerRepo: string };

// scp-like SSH form has no `://` and uses a colon before the path.
const scpPattern = /^[^/]+@([^:]+):(.+?)(?:\.git)?$/;

// file:, git: and http: parse cleanly but cannot round-trip to a usable skill
// ref (#152).
const usableSchemes = new Set(["https:", "ssh:"]);

// `URL` blanks a default port only for the schemes it knows, which excludes
// ssh.
const defaultPorts = new Map([
  ["https:", "443"],
  ["ssh:", "22"],
]);

const deployableHosts = new Set(["github.com"]);

const fromHostAndPath = (rawHost: string, path: string): GitOrigin | null => {
  // `URL` lowercases the host only for the schemes it knows.
  const host = rawHost.toLowerCase();
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
  // `URL` drops userinfo, so a credentialed remote never leaks its token.
  if (url.includes("://")) {
    try {
      const parsed = new URL(url);
      if (!usableSchemes.has(parsed.protocol)) {
        return null;
      }
      // Refused, not dropped: dropping the port would send apm to the default
      // one and fail at the first deploy (#152).
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
