import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { sameCategoryName } from "@maestro/core/category-name";
import { draftPrompt } from "@maestro/core/prompt-file";

const corePackageDir = resolve(import.meta.dirname, "../../core");

const importSources = (file: string): string[] =>
  [
    ...readFileSync(file, "utf8").matchAll(
      /^\s*(?:import|export)\s(?:[^;]*?\sfrom\s+)?["']([^"']+)["']/gm,
    ),
  ].map((match) => match[1] ?? "");

// Every module the browser bundle pulls in through a runtime subpath export.
const runtimeImportGraph = (entry: string): Set<string> => {
  const seen = new Set<string>();
  const pending = [entry];
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (seen.has(file)) {
      continue;
    }
    seen.add(file);
    for (const source of importSources(file)) {
      if (source.startsWith(".")) {
        pending.push(`${resolve(dirname(file), source)}.ts`);
      } else {
        seen.add(source);
      }
    }
  }
  return seen;
};

// Every package and `node:` module a subpath export's graph pulls in.
const bareImportsOf = (subpath: string): string[] => {
  const manifest = JSON.parse(
    readFileSync(resolve(corePackageDir, "package.json"), "utf8"),
  ) as { exports: Record<string, string> };
  const entry = resolve(corePackageDir, manifest.exports[subpath] ?? "");
  return [...runtimeImportGraph(entry)].filter(
    (module) => !module.startsWith("/"),
  );
};

describe("@maestro/core/prompt-file", () => {
  it("runs in the browser bundle", () => {
    expect(draftPrompt("Review it.", "review-pr.prompt.md").name).toBe(
      "review-pr",
    );
  });

  it("pulls in no package but yaml and no node: module", () => {
    expect(bareImportsOf("./prompt-file")).toEqual(["yaml"]);
  });
});

describe("@maestro/core/category-name", () => {
  it("runs in the browser bundle", () => {
    expect(sameCategoryName("Code review", "code REVIEW")).toBe(true);
  });

  it("pulls in no package and no node: module", () => {
    expect(bareImportsOf("./category-name")).toEqual([]);
  });
});
