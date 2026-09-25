// Ignore patterns: the scaffold's `.gitignore` is generated from this list.
// A pattern is a literal name or a prefix followed by `*`.
const OPERATING_SYSTEM_FILE_PATTERNS = [
  ".DS_Store",
  "._*",
  "Thumbs.db",
  "desktop.ini",
] as const;

export const isOperatingSystemFile = (name: string): boolean =>
  OPERATING_SYSTEM_FILE_PATTERNS.some((pattern) =>
    pattern.endsWith("*")
      ? name.startsWith(pattern.slice(0, -1))
      : name === pattern,
  );

export const operatingSystemGitignore = (): string =>
  `${OPERATING_SYSTEM_FILE_PATTERNS.join("\n")}\n`;

export const operatingSystemFileList = (): string => {
  const quoted = OPERATING_SYSTEM_FILE_PATTERNS.map(
    (pattern) => `\`${pattern}\``,
  );
  return `${quoted.slice(0, -1).join(", ")} and ${quoted.at(-1)}`;
};
