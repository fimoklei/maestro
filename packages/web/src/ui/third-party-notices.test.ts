import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const srcDir = ["packages/web/src", "src"]
  .map((candidate) => resolve(process.cwd(), candidate))
  .find((candidate) => existsSync(candidate));
if (!srcDir)
  throw new Error(`web source tree not found from cwd ${process.cwd()}`);
const repoRoot = resolve(srcDir, "../../..");
const notices = readFileSync(join(repoRoot, "THIRD-PARTY-NOTICES.md"), "utf8");

const NOTICE_LINE = "// Adapted from Spectrum UI (Apache-2.0)";

const ADAPTED_FROM_SPECTRUM = [
  "ui/data-table.tsx",
  "ui/status-badge.tsx",
  "ui/skeleton.tsx",
  "ui/empty-state.tsx",
];

describe("Spectrum UI notices", () => {
  it.each(ADAPTED_FROM_SPECTRUM)("%s opens with the notice line", (file) => {
    const firstLine = readFileSync(join(srcDir, file), "utf8").split("\n")[0];
    expect(firstLine).toBe(NOTICE_LINE);
  });

  it("names Spectrum UI and its licence in THIRD-PARTY-NOTICES.md", () => {
    expect(notices).toContain("Spectrum UI");
    expect(notices).toContain("Apache License");
  });
});

describe("Octicons notice", () => {
  it("names the adapted file, which opens with the notice line", () => {
    expect(notices).toContain("packages/web/src/ui/github-mark-link.tsx");
    const firstLine = readFileSync(
      join(srcDir, "ui/github-mark-link.tsx"),
      "utf8",
    ).split("\n")[0];
    expect(firstLine).toBe("// Adapted from Octicons (MIT)");
  });

  it("carries the MIT licence text itself", () => {
    expect(notices).toContain("Copyright (c) 2026 GitHub Inc.");
    expect(notices).toContain(
      "The above copyright notice and this permission notice shall be included in all",
    );
  });
});
