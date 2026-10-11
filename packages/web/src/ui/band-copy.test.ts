import { describe, expect, it } from "vitest";
import {
  BRANCH_FACT,
  NOT_RELEASED_YET,
  ORIGIN_FACT,
  RELEASED_FACT,
  UNKNOWN_FACT_VALUE,
} from "./band-copy";

describe("band copy", () => {
  it("names the Harness facts and says what is not known", () => {
    expect([ORIGIN_FACT, RELEASED_FACT, BRANCH_FACT]).toEqual([
      "Origin",
      "Released",
      "Branch",
    ]);
    expect(UNKNOWN_FACT_VALUE).toBe("Unknown");
    expect(NOT_RELEASED_YET).toBe("Not released yet");
  });
});
