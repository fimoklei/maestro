// What import reads and writes in an imported skill's SKILL.md: the two
// conventions it reports but never refuses on, and the one field it rewrites —
// the directory name is the skill's identity (#576).
import { readFrontmatter } from "./validate-skill-structure";

// Conventions, deliberately apart from the three structural rules release
// validation shares: exceeding one costs readability, never correctness.
export type ManifestAdvisory = "long-manifest" | "long-description";

const MAX_LINES = 500;
const MAX_DESCRIPTION = 1024;

export const manifestAdvisories = (raw: string): ManifestAdvisory[] => {
  const advisories: ManifestAdvisory[] = [];
  // A trailing newline ends the last line, it does not start another one.
  if (raw.replace(/\n$/, "").split("\n").length > MAX_LINES) {
    advisories.push("long-manifest");
  }
  const description = readFrontmatter(raw)?.data.description;
  if (typeof description === "string" && description.length > MAX_DESCRIPTION) {
    advisories.push("long-description");
  }
  return advisories;
};

// Rewrites `name` in place rather than re-serializing the frontmatter: every
// other key, its order, and the body stay exactly as the author wrote them.
// Returns the manifest unchanged where there is no frontmatter to write into.
export const rewriteFrontmatterName = (raw: string, name: string): string => {
  const frontmatter = readFrontmatter(raw);
  if (frontmatter === null) {
    return raw;
  }
  const { block } = frontmatter;
  // A key at column zero only: an indented `name:` belongs to a nested mapping.
  const rewritten = /^name:.*$/m.test(block)
    ? block.replace(/^name:.*$/m, () => `name: ${name}`)
    : `name: ${name}\n${block}`;
  // Function replacement throughout, so a `$&` in the manifest is text, not a
  // substitution pattern.
  return raw.replace(block, () => rewritten);
};
