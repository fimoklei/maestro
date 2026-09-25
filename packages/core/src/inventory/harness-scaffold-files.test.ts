import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  canonicalHarnessFiles,
  SCAFFOLD_ENTRIES,
  SCAFFOLD_ROOTS,
} from "./harness-scaffold-files";

const byPath = (ownerRepo = "fimoklei/agent-harness") =>
  new Map(canonicalHarnessFiles(ownerRepo).map((file) => [file.path, file]));

describe("canonicalHarnessFiles", () => {
  it("writes exactly the six canonical entries and nothing else", () => {
    expect([...byPath().keys()].sort()).toEqual([
      ".apm/skills/.gitkeep",
      ".github/workflows/skill-check.yml",
      ".gitignore",
      "CONTRIBUTING.md",
      "README.md",
      "apm.yml",
    ]);
  });

  it("ignores the four operating-system files and nothing else", () => {
    const gitignore = byPath().get(".gitignore");
    expect(gitignore?.contents.trim().split("\n")).toEqual([
      ".DS_Store",
      "._*",
      "Thumbs.db",
      "desktop.ini",
    ]);
    // An occupied `.gitignore` refuses the scaffold, never gets merged (#921).
    expect(gitignore?.skipIfExists).toBeUndefined();
  });

  it("omits plugin.json, which belongs to the plugin-author workflow", () => {
    expect(byPath().has("plugin.json")).toBe(false);
  });

  it("names the apm.yml manifest after the repository, not the owner", () => {
    const manifest = parse(
      byPath("fimoklei/agent-harness")?.get("apm.yml")?.contents as string,
    );
    expect(manifest.name).toBe("agent-harness");
    expect(manifest.version).toBe("0.0.0");
    expect(manifest.dependencies).toEqual({ apm: [], mcp: [] });
  });

  it.each(["true", "null", "123", "no", "1.0"])(
    "keeps a YAML-significant repository name a string: %s",
    (name) => {
      const manifest = parse(
        byPath(`fimoklei/${name}`)?.get("apm.yml")?.contents as string,
      );
      expect(manifest.name).toBe(name);
      expect(manifest.description).toBe(`APM project for ${name}`);
    },
  );

  it("keeps .apm/skills/ reachable by git with a placeholder file", () => {
    // Git tracks no empty directory, so it would never reach the remote.
    expect(byPath().get(".apm/skills/.gitkeep")?.contents).toBe("");
  });

  it("states the runner the advisory workflow assumes", () => {
    const workflow = byPath().get(".github/workflows/skill-check.yml")
      ?.contents as string;
    expect(workflow).toContain("ubuntu-latest");
    expect(workflow).toMatch(/assumes the GitHub-hosted `ubuntu-latest`/i);
  });

  it("checks the three structural rules on pushes and pull requests", () => {
    const workflow = parse(
      byPath().get(".github/workflows/skill-check.yml")?.contents as string,
    );
    expect(workflow.on.push.paths).toEqual([".apm/skills/**"]);
    expect(workflow.on.pull_request.paths).toEqual([".apm/skills/**"]);
    const script = workflow.jobs["skill-check"].steps.at(-1).run;
    for (const rule of [
      "missing-manifest",
      "invalid-frontmatter",
      "empty-description",
    ]) {
      expect(script).toContain(rule);
    }
  });

  it("tells the reader how to install a skill from this Harness", () => {
    expect(byPath().get("README.md")?.contents).toContain(
      "github.com/fimoklei/agent-harness/.apm/skills/",
    );
  });
});

describe("CONTRIBUTING.md", () => {
  const contributing = (ownerRepo?: string) =>
    byPath(ownerRepo).get("CONTRIBUTING.md");
  const text = (ownerRepo?: string) => contributing(ownerRepo)?.contents ?? "";
  // Markdown wraps at the margin, so assert sentences against one flat line.
  const flat = (ownerRepo?: string) => text(ownerRepo).replace(/\s+/g, " ");
  const sections = () => text().split(/^## /m).slice(1);
  const situations = () => sections().slice(0, 3);

  it("never overwrites a Harness's own CONTRIBUTING.md", () => {
    expect(contributing()?.skipIfExists).toBe(true);
  });

  it("names each section after a situation the contributor is in", () => {
    expect(sections().map((section) => section.split("\n")[0])).toEqual([
      "I want to add a new skill",
      "I want to change an existing skill",
      "My skill is ready — what now?",
      "Why this is a human agreement",
    ]);
  });

  it("walks each situation as numbered steps", () => {
    for (const situation of situations()) {
      expect(situation).toMatch(/^1\. /m);
    }
  });

  it("tells the reader who reviews", () => {
    expect(flat()).toMatch(/curator/i);
    expect(flat()).toMatch(/You never merge your own change/i);
  });

  it("names every cockpit control the reader has to press, verbatim", () => {
    for (const label of [
      "**Import skill…**",
      "**Propose change**",
      "**Pull request →**",
      "**Refresh**",
      "**Create a release**",
      "**Publish release**",
    ]) {
      expect(text()).toContain(label);
    }
  });

  it("opens the pull request with Propose change, before the curator merges", () => {
    const ready = (situations().at(-1) as string).replace(/\s+/g, " ");
    expect(ready).toMatch(
      /\*\*Propose change\*\*.*the curator.*\*\*Publish release\*\*/,
    );
  });

  it("sends the reader to the Harness itself to edit an existing skill", () => {
    expect(flat()).toMatch(/edit the skill in place under `\.apm\/skills\//i);
    // The scaffold makes no Claude Code skills symlink; the text may not promise one.
    expect(flat()).not.toMatch(/symlink/i);
  });

  it("warns that Maestro deletes local edits to a deployed skill copy", () => {
    expect(flat()).toMatch(/Never edit a skill copy that Maestro deployed/i);
    expect(flat()).toMatch(/deletes local edits there without warning/i);
  });

  it("states the admission bar", () => {
    expect(flat()).toMatch(/structurally valid/i);
    expect(flat()).toMatch(/not repo-specific/i);
  });

  it("names the two steps only the Harness owner can take", () => {
    const ready = (situations().at(-1) as string).replace(/\s+/g, " ");
    expect(ready).toContain(
      "GitHub keeps the branch after a merge, so select **Automatically delete head branches** in this repository's settings to remove it.",
    );
    expect(ready).toContain(
      "A Harness scaffolded before this file has no `.gitignore`, so add one naming `.DS_Store`, `._*`, `Thumbs.db` and `desktop.ini` to keep operating-system files out of a proposal.",
    );
  });

  it("closes on why independent review holds without branch protection", () => {
    expect(sections().at(-1)).toMatch(/^Why this is a human agreement\n/);
    expect(flat()).toMatch(/branch protection/i);
  });

  it("names the repository it is scaffolded into and no other", () => {
    expect(flat("acme/toolbelt")).toContain("acme/toolbelt");
    expect(flat("acme/toolbelt")).not.toMatch(/fimoklei/i);
  });
});

describe("SCAFFOLD_ENTRIES", () => {
  it("guards every directory the scaffold creates, not just its files", () => {
    expect(SCAFFOLD_ENTRIES).toEqual([
      ".apm",
      ".apm/skills",
      ".apm/skills/.gitkeep",
      ".github",
      ".github/workflows",
      ".github/workflows/skill-check.yml",
      ".gitignore",
      "README.md",
      "apm.yml",
    ]);
  });

  it("rolls back every root it creates, the .gitignore included", () => {
    expect(SCAFFOLD_ROOTS).toEqual([
      ".apm",
      ".github",
      ".gitignore",
      "README.md",
      "apm.yml",
    ]);
  });
});
