// Web may import types from core, never values. Biome's noRestrictedImports
// cannot tell the two apart, so this check fails the build instead.
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { valueImportsFromCore } from "./web-core-import-boundary";

describe("valueImportsFromCore", () => {
  it("allows a type-only import from core", () => {
    const src = `import type { VersionDrift } from "@maestro/core";`;
    expect(valueImportsFromCore(src)).toEqual([]);
  });

  it("flags a value import from core", () => {
    const src = `import { ConnectInventory } from "@maestro/core";`;
    expect(valueImportsFromCore(src)).toHaveLength(1);
  });

  it("flags a default value import from core", () => {
    const src = `import core from "@maestro/core";`;
    expect(valueImportsFromCore(src)).toHaveLength(1);
  });

  it("flags a bare side-effect import from core", () => {
    const src = `import "@maestro/core";`;
    expect(valueImportsFromCore(src)).toHaveLength(1);
  });

  it("flags a value import from a core subpath", () => {
    const src = `import { thing } from "@maestro/core/deep";`;
    expect(valueImportsFromCore(src)).toHaveLength(1);
  });

  it("allows a multi-line type-only import from core", () => {
    const src = [
      "import type {",
      "  VersionDrift,",
      "  DriftReading,",
      '} from "@maestro/core";',
    ].join("\n");
    expect(valueImportsFromCore(src)).toEqual([]);
  });

  it("ignores imports from other packages", () => {
    const src = `import { useQuery } from "@tanstack/react-query";`;
    expect(valueImportsFromCore(src)).toEqual([]);
  });

  it("flags the value import while leaving a sibling type import alone", () => {
    const src = [
      'import type { VersionDrift } from "@maestro/core";',
      'import { ConnectInventory } from "@maestro/core";',
    ].join("\n");
    expect(valueImportsFromCore(src)).toHaveLength(1);
  });

  it("flags a value re-export from core", () => {
    const src = `export { CheckVersionDrift } from "@maestro/core";`;
    expect(valueImportsFromCore(src)).toHaveLength(1);
  });

  it("flags a wildcard re-export from core", () => {
    const src = `export * from "@maestro/core";`;
    expect(valueImportsFromCore(src)).toHaveLength(1);
  });

  it("allows a type-only re-export from core", () => {
    const src = `export type { VersionDrift } from "@maestro/core";`;
    expect(valueImportsFromCore(src)).toEqual([]);
  });

  it("ignores a core mention inside a line comment", () => {
    const src = `// import { ConnectInventory } from "@maestro/core";`;
    expect(valueImportsFromCore(src)).toEqual([]);
  });

  it("ignores a core mention inside a block comment", () => {
    const src = `/* example: import core from "@maestro/core"; */`;
    expect(valueImportsFromCore(src)).toEqual([]);
  });

  it("allows a type-position dynamic import of core", () => {
    const src = `type Core = typeof import("@maestro/core");`;
    expect(valueImportsFromCore(src)).toEqual([]);
  });

  it("flags an awaited runtime dynamic import of core", () => {
    const src = `async function load() { return await import("@maestro/core"); }`;
    expect(valueImportsFromCore(src)).toHaveLength(1);
  });

  it("flags a runtime dynamic import of a core subpath", () => {
    const src = `const mod = import("@maestro/core/deep");`;
    expect(valueImportsFromCore(src)).toHaveLength(1);
  });

  it("ignores a runtime dynamic import of another package", () => {
    const src = `const mod = import("@tanstack/react-query");`;
    expect(valueImportsFromCore(src)).toEqual([]);
  });

  it("flags a CommonJS require of core", () => {
    const src = `const core = require("@maestro/core");`;
    expect(valueImportsFromCore(src)).toHaveLength(1);
  });

  it("flags a CommonJS require of a core subpath", () => {
    const src = `const deep = require("@maestro/core/deep");`;
    expect(valueImportsFromCore(src)).toHaveLength(1);
  });

  it("ignores a CommonJS require of another package", () => {
    const src = `const react = require("react");`;
    expect(valueImportsFromCore(src)).toEqual([]);
  });

  const WEB_FILE = "/repo/packages/web/src/drift/use-thing.ts";

  it("flags a relative value import that resolves into packages/core", () => {
    const src = `import { ConnectInventory } from "../../../core/src/index";`;
    expect(valueImportsFromCore(src, WEB_FILE)).toHaveLength(1);
  });

  it("allows a relative type-only import that resolves into packages/core", () => {
    const src = `import type { VersionDrift } from "../../../core/src/index";`;
    expect(valueImportsFromCore(src, WEB_FILE)).toEqual([]);
  });

  it("ignores a relative import that stays inside web", () => {
    const src = `import { requestJson } from "../api/http";`;
    expect(valueImportsFromCore(src, WEB_FILE)).toEqual([]);
  });

  it("ignores relative imports when no file path is given", () => {
    const src = `import { ConnectInventory } from "../../../core/src/index";`;
    expect(valueImportsFromCore(src)).toEqual([]);
  });

  it("flags a dynamic import written with a backtick specifier", () => {
    const src = "const mod = import(`@maestro/core`);";
    expect(valueImportsFromCore(src)).toHaveLength(1);
  });

  it("sees a core import after a generic arrow in a .ts file", () => {
    const src = [
      "const identity = <T>(value: T) => value;",
      'const mod = import("@maestro/core");',
    ].join("\n");
    const tsFile = "/repo/packages/web/src/util.ts";
    expect(valueImportsFromCore(src, tsFile)).toHaveLength(1);
  });
});

const WEB_SRC = fileURLToPath(
  new URL("../../packages/web/src", import.meta.url),
);

async function walkSources(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...(await walkSources(full)));
    } else if (/\.tsx?$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

describe("web only imports types from core", () => {
  it("has no value import from @maestro/core anywhere in web source", async () => {
    const files = await walkSources(WEB_SRC);
    const offenders: string[] = [];
    for (const file of files) {
      const source = await readFile(file, "utf8");
      for (const statement of valueImportsFromCore(source, file)) {
        offenders.push(`${file}: ${statement}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
