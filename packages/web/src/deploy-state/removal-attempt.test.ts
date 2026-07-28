import { describe, expect, it } from "vitest";
import { HttpError } from "../api/http";
import { preApmRefusalCodes, removalWasAttempted } from "./removal-attempt";

// Written out rather than read off the table under test: a code that drifts to
// the wrong side has to turn a test red, and a list derived from the table
// would drift with it.
const PRE_APM_REFUSALS = [
  "unsupported-media-type",
  "forbidden-host",
  "forbidden-origin",
  "invalid-body",
  "unsupported-primitive-type",
  "invalid-name",
  "repo-not-registered",
  "no-supported-tool",
  "not-deployed",
  "lockfile-malformed",
  "ref-unresolvable",
  "deployed-unreadable",
  "remove-in-progress",
] as const;

describe("removalWasAttempted", () => {
  it("treats a failure with no error code as attempted", () => {
    expect(removalWasAttempted(new HttpError(502, "Bad gateway"))).toBe(true);
  });

  it("treats an unrecognised error code as attempted", () => {
    expect(
      removalWasAttempted(new HttpError(500, "Boom", "some-future-code")),
    ).toBe(true);
  });

  it("treats a non-HTTP failure as attempted", () => {
    expect(removalWasAttempted(new TypeError("Failed to fetch"))).toBe(true);
  });

  it.each(PRE_APM_REFUSALS)("treats %s as not attempted", (code) => {
    expect(removalWasAttempted(new HttpError(409, "Refused", code))).toBe(
      false,
    );
  });

  it("treats the post-apm failure as attempted", () => {
    expect(
      removalWasAttempted(
        new HttpError(502, "apm said nothing", "remove-failed"),
      ),
    ).toBe(true);
  });

  // Catches the other direction: a code classified before-apm that this file
  // never named, which the cases above would silently skip.
  it("classifies no pre-apm refusal beyond the ones named here", () => {
    expect([...preApmRefusalCodes()].sort()).toEqual(
      [...PRE_APM_REFUSALS].sort(),
    );
  });
});
