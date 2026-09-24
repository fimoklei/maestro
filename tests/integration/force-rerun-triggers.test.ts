// `vitest related` follows imports only; a fixture read through `fs` reaches no
// test unless it forces a full rerun (#1111).
import { readdir } from "node:fs/promises";
import { matchesGlob } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { configDefaults } from "vitest/config";
import config from "../../vitest.config";

const triggers = config.test?.forceRerunTriggers ?? [];
const triggersFullRun = (path: string) =>
  triggers.some((pattern) => matchesGlob(path, pattern));

describe("forceRerunTriggers", () => {
  it("reruns the whole suite when any fixture changes", async () => {
    const root = fileURLToPath(new URL("../fixtures/", import.meta.url));
    const fixtures = await readdir(root, { recursive: true });
    expect(fixtures.length).toBeGreaterThan(0);
    expect(
      fixtures.map((name) => root + name).filter((p) => !triggersFullRun(p)),
    ).toEqual([]);
  });

  it("keeps vitest's default triggers", () => {
    expect(triggers).toEqual(
      expect.arrayContaining(configDefaults.forceRerunTriggers),
    );
  });
});
