import { describe, expect, it } from "vitest";
import {
  readHarnessSelection,
  writeHarnessSelection,
} from "./harness-manifest";

const HARNESS = "fimoklei/agent-harness";

// The shape apm 0.29.0 wrote in the #957 canary, trimmed to what the editor reads.
const manifest = (body: string) => `name: proj
version: 1.0.0
# Which agent platforms to deploy to.
targets:
  - claude
dependencies:
  apm:
${body}
  mcp: []
includes: auto
`;

const oneHarness = manifest(`    - git: ${HARNESS}
      ref: v0.6.0
      skills:
        - prototype
        - caveman`);

describe("readHarnessSelection", () => {
  it("reads the selection of the one dependency on the connected Harness", () => {
    expect(readHarnessSelection(oneHarness, HARNESS)).toEqual({
      kind: "selection",
      skills: ["prototype", "caveman"],
    });
  });

  it("reads an absent manifest as no Harness dependency", () => {
    expect(readHarnessSelection(null, HARNESS)).toEqual({ kind: "absent" });
  });

  it("reads a manifest holding no Harness dependency as absent", () => {
    const foreign = manifest(`    - git: other/repo
      ref: v1.0.0
      skills:
        - thing`);
    expect(readHarnessSelection(foreign, HARNESS)).toEqual({ kind: "absent" });
  });

  it("ignores a per-skill dependency on the same Harness", () => {
    const perSkill = manifest(`    - ${HARNESS}/.apm/skills/tdd#v0.6.0`);
    expect(readHarnessSelection(perSkill, HARNESS)).toEqual({ kind: "absent" });
  });

  it("refuses two dependencies on the connected Harness", () => {
    const twice = manifest(`    - git: ${HARNESS}
      ref: v0.6.0
      skills:
        - prototype
    - git: ${HARNESS}
      ref: v0.5.0
      skills:
        - caveman`);
    expect(readHarnessSelection(twice, HARNESS)).toEqual({
      kind: "not-recognised",
    });
  });

  it("refuses a Harness dependency carrying no skills list", () => {
    const whole = manifest(`    - git: ${HARNESS}
      ref: v0.6.0`);
    expect(readHarnessSelection(whole, HARNESS)).toEqual({
      kind: "not-recognised",
    });
  });

  it("refuses a skills field that is not a list of names", () => {
    const wildcard = manifest(`    - git: ${HARNESS}
      ref: v0.6.0
      skills: '*'`);
    expect(readHarnessSelection(wildcard, HARNESS)).toEqual({
      kind: "not-recognised",
    });
  });

  it("refuses a Harness dependency written as a bare root string", () => {
    const bare = manifest(`    - github.com/${HARNESS}#v0.6.0`);
    expect(readHarnessSelection(bare, HARNESS)).toEqual({
      kind: "not-recognised",
    });
  });

  it("refuses a manifest that does not parse", () => {
    expect(readHarnessSelection("dependencies: [\n", HARNESS)).toEqual({
      kind: "not-recognised",
    });
  });

  it("reads a manifest whose apm list is empty as absent", () => {
    expect(readHarnessSelection(manifest("    []"), HARNESS)).toEqual({
      kind: "absent",
    });
  });
});

describe("writeHarnessSelection", () => {
  it("writes the exact selection, sorted as apm records it", () => {
    const written = writeHarnessSelection(oneHarness, HARNESS, [
      "prototype",
      "review",
    ]);
    expect(readHarnessSelection(written ?? "", HARNESS)).toEqual({
      kind: "selection",
      skills: ["prototype", "review"],
    });
    expect(written).not.toContain("caveman");
  });

  it("keeps sibling dependencies and the document's comments", () => {
    const withForeign = manifest(`    - git: ${HARNESS}
      ref: v0.6.0
      skills:
        - prototype
    - ${HARNESS}/.apm/skills/tdd#v0.6.0`);
    const written = writeHarnessSelection(withForeign, HARNESS, ["review"]);
    expect(written).toContain(`${HARNESS}/.apm/skills/tdd#v0.6.0`);
    expect(written).toContain("# Which agent platforms to deploy to.");
    expect(written).toContain("ref: v0.6.0");
  });

  it("refuses an empty selection, which apm rejects outright", () => {
    expect(writeHarnessSelection(oneHarness, HARNESS, [])).toBeNull();
  });

  it("refuses a shape it does not recognise", () => {
    const bare = manifest(`    - github.com/${HARNESS}#v0.6.0`);
    expect(writeHarnessSelection(bare, HARNESS, ["review"])).toBeNull();
  });
});
