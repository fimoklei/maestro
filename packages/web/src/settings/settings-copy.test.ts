import { describe, expect, it } from "vitest";
import {
  CHANGE_LOCATION_SENTENCE,
  CONNECTED_HARNESS,
  FOLDER_HINT,
  LOCATION,
  SET_LOCATION_MESSAGES,
} from "./settings-copy";

// Approved sentences, as exact strings (copy.md). The first four are #995's.
describe("Harness location copy", () => {
  it("names the two sections", () => {
    expect(CONNECTED_HARNESS).toBe("Connected Harness");
    expect(LOCATION).toBe("Location");
  });

  it("says what Change Harness location does and what the field takes", () => {
    expect(CHANGE_LOCATION_SENTENCE).toBe(
      "Point Maestro at another local Harness clone.",
    );
    expect(FOLDER_HINT).toBe("Must be a local Harness clone.");
  });

  it("never offers a URL in a refusal of the folder field", () => {
    expect(SET_LOCATION_MESSAGES).toEqual({
      missing: "Type the path to a local Harness clone.",
      "not-an-inventory": "Choose a folder that holds a Harness.",
    });
  });
});
