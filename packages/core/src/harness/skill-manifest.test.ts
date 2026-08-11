import { describe, expect, it } from "vitest";
import { manifestAdvisories, rewriteFrontmatterName } from "./skill-manifest";

const manifest = (frontmatter: string, body = "Body.\n") =>
  `---\n${frontmatter}\n---\n\n${body}`;

describe("manifestAdvisories", () => {
  it("reports nothing about a manifest inside both conventions", () => {
    expect(
      manifestAdvisories(manifest("name: a\ndescription: Short.")),
    ).toEqual([]);
  });

  it("reports a manifest over 500 lines", () => {
    const long = manifest("description: Short.", "line\n".repeat(500));
    expect(manifestAdvisories(long)).toEqual(["long-manifest"]);
  });

  it("reports a description over 1024 characters", () => {
    const long = manifest(`description: ${"d".repeat(1025)}`);
    expect(manifestAdvisories(long)).toEqual(["long-description"]);
  });

  it("reports nothing about a manifest whose frontmatter does not parse", () => {
    expect(manifestAdvisories("no frontmatter here")).toEqual([]);
  });
});

describe("rewriteFrontmatterName", () => {
  it("replaces an existing name with the directory name", () => {
    const rewritten = rewriteFrontmatterName(
      manifest("name: old-name\ndescription: Short."),
      "new-name",
    );
    expect(rewritten).toBe(manifest("name: new-name\ndescription: Short."));
  });

  it("adds a name where the frontmatter has none", () => {
    const rewritten = rewriteFrontmatterName(
      manifest("description: Short."),
      "new-name",
    );
    expect(rewritten).toBe(manifest("name: new-name\ndescription: Short."));
  });

  it("leaves the body untouched, including regex replacement patterns", () => {
    const rewritten = rewriteFrontmatterName(
      manifest("name: old-name\ndescription: Costs $& per run."),
      "new-name",
    );
    expect(rewritten).toContain("Costs $& per run.");
  });

  it("refuses a manifest with no frontmatter to name", () => {
    expect(rewriteFrontmatterName("plain text", "new-name")).toBeNull();
  });

  it("rebuilds a quoted key rather than adding a second name", () => {
    const rewritten = rewriteFrontmatterName(
      manifest('"name": old-name\ndescription: Short.'),
      "new-name",
    );

    expect(rewritten).not.toBeNull();
    expect(rewritten).toContain("new-name");
    expect(rewritten).not.toContain("old-name");
  });

  it("rebuilds a block scalar name", () => {
    const rewritten = rewriteFrontmatterName(
      manifest("name: |\n  old-name\ndescription: Short."),
      "new-name",
    );

    expect(rewritten).not.toBeNull();
    expect(rewritten).not.toContain("old-name");
  });
});
