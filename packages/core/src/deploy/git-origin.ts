export type GitOrigin = { host: string; ownerRepo: string };

const scpPattern = /^[^/@]+@([^:@]+):(.+?)(?:\.git)?$/;

const usableSchemes = new Set(["https:", "ssh:"]);

const defaultPorts = new Map([
  ["https:", "443"],
  ["ssh:", "22"],
]);

const deployableHosts = new Set(["github.com"]);

const fromHostAndPath = (rawHost: string, path: string): GitOrigin | null => {
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
  if (url.includes("://")) {
    try {
      const parsed = new URL(url);
      if (!usableSchemes.has(parsed.protocol)) {
        return null;
      }
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
