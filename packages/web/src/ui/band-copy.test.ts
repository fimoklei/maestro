import { describe, expect, it } from "vitest";
import {
  BRANCH_FACT,
  NOT_RELEASED_YET,
  ORIGIN_FACT,
  READ_AGE_NAME,
  RELEASE_FACT,
  UNKNOWN_FACT_VALUE,
} from "./band-copy";

describe("band copy", () => {
  it("names the Harness facts and says what is not known", () => {
    expect([ORIGIN_FACT, RELEASE_FACT, BRANCH_FACT]).toEqual([
      "Origin",
      "Release",
      "Branch",
    ]);
    expect(UNKNOWN_FACT_VALUE).toBe("Unknown");
    expect(NOT_RELEASED_YET).toBe("Not released yet");
  });

  it("names the read age's clock, so it is heard as Read 4 min ago", () => {
    expect(READ_AGE_NAME).toBe("Read");
  });
});
