import { describe, expect, it } from "vitest";
import { HOVER_TRANSITION, REVEAL_TRANSITION } from "./hover-transition";

describe("HOVER_TRANSITION", () => {
  // transition-colors covers outline-color in Tailwind v4, which makes a focus
  // ring fade in from the inherited colour (#877).
  it("leaves the focus ring out of the transitioned properties", () => {
    expect(HOVER_TRANSITION).not.toContain("transition-colors");
    expect(HOVER_TRANSITION).toContain(
      "transition-[color,background-color,border-color]",
    );
  });

  it("keeps the hover window and the reduced-motion guard", () => {
    expect(HOVER_TRANSITION).toBe(
      "motion-safe:transition-[color,background-color,border-color] motion-safe:duration-150 motion-safe:ease-out",
    );
    expect(REVEAL_TRANSITION).toBe(
      "motion-safe:transition-opacity motion-safe:duration-150 motion-safe:ease-out",
    );
  });
});
