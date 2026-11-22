import { describe, expect, it } from "vitest";
import { sourceScanTests } from "../../scripts/lib/source-scan-tests.mjs";

const SCAN = {
  path: "packages/web/src/styles/style-rules.test.ts",
  text: 'readdirSync(SRC_DIR, { recursive: true, encoding: "utf8" })',
};
const PLAIN = {
  path: "packages/web/src/ui/sub-list-row.test.tsx",
  text: 'import { SubListRow } from "./sub-list-row";',
};

// `vitest related` follows imports, so a test that reads its package's source
// from disk never counts as related (#1837).
describe("sourceScanTests", () => {
  it("adds a test that reads its package's source when that source changed", () => {
    expect(
      sourceScanTests(["packages/web/src/ui/sub-list-row.tsx"], [SCAN, PLAIN]),
    ).toEqual([SCAN.path]);
  });

  it("adds nothing for a change outside the scanned package", () => {
    expect(
      sourceScanTests(["packages/core/src/drift.ts", "README.md"], [SCAN]),
    ).toEqual([]);
  });

  it("adds nothing when no test reads source from disk", () => {
    expect(
      sourceScanTests(["packages/web/src/ui/sub-list-row.tsx"], [PLAIN]),
    ).toEqual([]);
  });
});
