import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  canonicalHarnessFiles,
  SCAFFOLD_ENTRIES,
} from "./harness-scaffold-files";

const byPath = (ownerRepo = "fimoklei/agent-harness") =>
  new Map(canonicalHarnessFiles(ownerRepo).map((file) => [file.path, file]));

describe("canonicalHarnessFiles", () => {
  it("writes exactly the four canonical entries and nothing else", () => {
    expect([...byPath().keys()].sort()).toEqual([
      ".apm/skills/.gitkeep",
      ".github/workflows/skill-check.yml",
      "README.md",
      "apm.yml",
    ]);
  });

  it("omits plugin.json, which belongs to the plugin-author workflow", () => {
    expect(byPath().has("plugin.json")).toBe(false);
  });

  it("names the apm.yml manifest after the repository, not the owner", () => {
    const manifest = parse(
      byPath("fimoklei/agent-harness")?.get("apm.yml")?.contents as string,
    );
    expect(manifest.name).toBe("agent-harness");
    expect(manifest.dependencies).toEqual({ apm: [], mcp: [] });
  });

  it("keeps .apm/skills/ reachable by git with a placeholder file", () => {
    // Git tracks files, never directories, so an empty skills directory would
    // never reach the remote (#552 S5).
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

describe("SCAFFOLD_ENTRIES", () => {
  it("guards every directory the scaffold creates, not just its files", () => {
    expect(SCAFFOLD_ENTRIES).toEqual([
      ".apm",
      ".apm/skills",
      ".apm/skills/.gitkeep",
      ".github",
      ".github/workflows",
      ".github/workflows/skill-check.yml",
      "README.md",
      "apm.yml",
    ]);
  });
});
