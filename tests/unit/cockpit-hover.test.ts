import { describe, expect, it } from "vitest";
import { centreScript } from "../../scripts/cockpit-hover.mjs";

// Runs the script as the page would, against a one-element document.
function runIn(
  found: { x: number; y: number; width: number; height: number } | null,
) {
  const asked: string[] = [];
  const document = {
    querySelector: (selector: string) => {
      asked.push(selector);
      return found === null
        ? null
        : { scrollIntoView: () => {}, getBoundingClientRect: () => found };
    },
  };
  return (selector: string) => ({
    point: new Function("document", `return ${centreScript(selector)};`)(
      document,
    ),
    asked,
  });
}

describe("centreScript", () => {
  it("finds the element by the exact selector, quotes included, and gives its centre", () => {
    const selector = 'aside [role=img][aria-label="Local edits"]';
    const { point, asked } = runIn({ x: 10, y: 20, width: 24, height: 24 })(
      selector,
    );

    expect(asked).toEqual([selector]);
    expect(point).toEqual([22, 32]);
  });

  it("gives null when nothing matches", () => {
    expect(runIn(null)("aside .missing").point).toBeNull();
  });
});
