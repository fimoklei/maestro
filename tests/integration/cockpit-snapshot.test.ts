import { describe, expect, it } from "vitest";
import { trimSnapshot } from "../../scripts/cockpit-snapshot.mjs";

const long = "a".repeat(200);

describe("trimSnapshot", () => {
  it("cuts a long name at 80 characters and marks the cut", () => {
    expect(trimSnapshot(`- row "${long}" [ref=e17]`)).toBe(
      `- row "${"a".repeat(80)}…" [ref=e17]`,
    );
  });

  it("leaves a short name and the line around it untouched", () => {
    const line = '  - columnheader "Name" [ref=e306]\n    - button "Name"';
    expect(trimSnapshot(line)).toBe(line);
  });

  it("cuts every long string on a line, not only the first", () => {
    expect(trimSnapshot(`- link "${long}" url="${long}"`)).toBe(
      `- link "${"a".repeat(80)}…" url="${"a".repeat(80)}…"`,
    );
  });

  it("reads an escaped quote as part of the name", () => {
    expect(trimSnapshot(`- cell "say \\"hi\\" ${long}"`)).toBe(
      `- cell "say \\"hi\\" ${"a".repeat(69)}…"`,
    );
  });

  it("prints a node agent-browser repeats only once, with its children", () => {
    const snapshot = [
      '- grid "Inventory table" [ref=e16]',
      '  - row "tdd" [ref=e17]',
      '    - gridcell "tdd" [ref=e53]',
      '      - StaticText "tdd"',
      '- row "tdd" [ref=e17]',
      '  - gridcell "tdd" [ref=e53]',
      '    - StaticText "tdd"',
      '- row "grill" [ref=e18]',
    ].join("\n");
    expect(trimSnapshot(snapshot)).toBe(
      [
        '- grid "Inventory table" [ref=e16]',
        '  - row "tdd" [ref=e17]',
        '    - gridcell "tdd" [ref=e53]',
        '      - StaticText "tdd"',
        '- row "grill" [ref=e18]',
      ].join("\n"),
    );
  });

  it("never leaves half an escape at the cut", () => {
    const name = `${"a".repeat(79)}\\"${long}`;
    expect(trimSnapshot(`- cell "${name}"`)).toBe(
      `- cell "${"a".repeat(79)}…"`,
    );
  });
});
