import { parse, parseDocument } from "yaml";
import { readFrontmatter } from "./validate-skill-structure";

// Reported, never refused on.
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

// Rewrites only `name`; null is a refusal. A textual pass keeps formatting;
// if parsing it back does not prove the name, the YAML is re-serialized.
export const rewriteFrontmatterName = (
  raw: string,
  name: string,
): string | null => {
  const frontmatter = readFrontmatter(raw);
  if (frontmatter === null) {
    return null;
  }
  const textual = replaceBlock(raw, frontmatter.block, (block) =>
    // Column zero only: an indented `name:` belongs to a nested mapping.
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

// Function replacement, so a `$&` in the manifest stays text.
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
