import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Proves one module names a target: a caller that shortens a path itself can
// shorten it without the other registered repositories (#1476).

const SRC = import.meta.dirname;

// The module, and the shortening function's own test.
const OWNERS = ["shell/target-name.ts", "shell/target-label.test.ts"];

const IMPORTS_THE_SHORTENING = /from "[^"]*\/target-label"/;

// harnessName skips the registered repositories, so only Harness paths may use it (#1500).
const HARNESS_CALLERS = [
  "connect-gate/connect-success-view.tsx",
  "settings/harness-location-page.tsx",
  "shell/use-harness-summary.ts",
];

// Any mention, so a namespace import or a re-export cannot slip past.
const NAMES_HARNESS_NAME = /\bharnessName\b/;
const HARNESS_NAME_OWNERS = [
  "shell/target-name.ts",
  "target-name-contract.test.ts",
];

const sources = readdirSync(SRC, { recursive: true, encoding: "utf8" })
  .filter((file) => /\.tsx?$/.test(file))
  .map((file) => ({ file, text: readFileSync(join(SRC, file), "utf8") }));

const callers = sources
  .filter(
    ({ file, text }) =>
      !OWNERS.includes(file) && IMPORTS_THE_SHORTENING.test(text),
  )
  .map(({ file }) => file);

const harnessNameCallers = sources
  .filter(
    ({ file, text }) =>
      !HARNESS_NAME_OWNERS.includes(file) && NAMES_HARNESS_NAME.test(text),
  )
  .map(({ file }) => file)
  .sort();

describe("target name contract", () => {
  it("leaves the shortening of a path to the target-name module", () => {
    expect(callers).toEqual([]);
  });

  it("lets only the Harness-path callers name a path without the registered repositories", () => {
    expect(harnessNameCallers).toEqual(HARNESS_CALLERS);
  });
});
