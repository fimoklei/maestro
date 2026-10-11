import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Proves one module names a target: a caller that shortens a path itself can
// shorten it without the other registered repositories (#1476).

const SRC = import.meta.dirname;

// The module, and the shortening function's own test.
const OWNERS = ["shell/target-name.ts", "shell/target-label.test.ts"];

const IMPORTS_THE_SHORTENING = /from "[^"]*\/target-label"/;

const callers = readdirSync(SRC, { recursive: true, encoding: "utf8" })
  .filter((file) => /\.tsx?$/.test(file) && !OWNERS.includes(file))
  .filter((file) =>
    IMPORTS_THE_SHORTENING.test(readFileSync(join(SRC, file), "utf8")),
  );

describe("target name contract", () => {
  it("leaves the shortening of a path to the target-name module", () => {
    expect(callers).toEqual([]);
  });
});
