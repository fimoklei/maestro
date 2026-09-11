// The files an operating system drops beside a skill's own content, in one
// place: the import copy leaves them behind, and the scaffold's `.gitignore`
// names them (ADR-0021 point 12). `.git` is not one of them.

// Written as ignore patterns, because the `.gitignore` is generated from this
// list. `._*` is the only wildcard; a pattern is either a literal name or a
// prefix followed by `*`.
export const OPERATING_SYSTEM_FILE_PATTERNS = [
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

// The `.gitignore` the scaffold writes: one pattern per line.
export const operatingSystemGitignore = (): string =>
  `${OPERATING_SYSTEM_FILE_PATTERNS.join("\n")}\n`;

// The same patterns in a sentence, as prose names them.
export const operatingSystemFileList = (): string => {
  const quoted = OPERATING_SYSTEM_FILE_PATTERNS.map(
    (pattern) => `\`${pattern}\``,
  );
  return `${quoted.slice(0, -1).join(", ")} and ${quoted.at(-1)}`;
};
