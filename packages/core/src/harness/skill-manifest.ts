// What import reads and writes in an imported skill's SKILL.md: the two
// conventions it reports but never refuses on, and the one field it rewrites —
// the directory name is the skill's identity (#576).
import { parse, parseDocument } from "yaml";
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

// Rewrites `name` and leaves everything else — other keys, their order, and
// the body — exactly as the author wrote them. Null where no manifest can be
// made to name this skill, which is a refusal, never a silent pass.
//
// Two passes: the textual one keeps the author's formatting, and its result is
// parsed back to prove the document now names exactly this skill. Only a
// manifest that fails that proof — `"name": x`, a block scalar, a duplicate
// key — is re-serialized through the YAML document, which costs the
// frontmatter's formatting to buy a correct name.
export const rewriteFrontmatterName = (
  raw: string,
  name: string,
): string | null => {
  const frontmatter = readFrontmatter(raw);
  if (frontmatter === null) {
    return null;
  }
  const textual = replaceBlock(raw, frontmatter.block, (block) =>
    // A key at column zero only: an indented `name:` belongs to a nested
    // mapping.
    /^name:.*$/m.test(block)
      ? block.replace(/^name:.*$/m, () => `name: ${name}`)
      : `name: ${name}\n${block}`,
  );
  if (namesExactly(textual, name)) {
    return textual;
  }

  const document = parseDocument(frontmatter.block);
  document.set("name", name);
  const rebuilt = replaceBlock(raw, frontmatter.block, () =>
    document.toString().trimEnd(),
  );
  return namesExactly(rebuilt, name) ? rebuilt : null;
};

// Function replacement throughout, so a `$&` in the manifest is text, not a
// substitution pattern.
const replaceBlock = (
  raw: string,
  block: string,
  rewrite: (block: string) => string,
): string => raw.replace(block, () => rewrite(block));

const namesExactly = (raw: string, name: string): boolean => {
  const block = readFrontmatter(raw)?.block;
  if (block === undefined) {
    return false;
  }
  try {
    return (parse(block) as Record<string, unknown>).name === name;
  } catch {
    return false;
  }
};
