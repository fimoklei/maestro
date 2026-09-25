import { describe, expect, it } from "vitest";
import { pushesWhereItFetched } from "./push-destination";

const FETCH = "git@github.com:fimoklei/agent-harness.git";

describe("pushesWhereItFetched", () => {
  it("accepts a push destination git resolves to the fetch destination", () => {
    expect(pushesWhereItFetched(FETCH, [FETCH])).toBe(true);
  });

  it("accepts a transport rewrite, where both sides land on the same mirror", () => {
    // `insteadOf` rewrites the fetch and the push alike.
    const mirror = "/srv/mirror.git";
    expect(pushesWhereItFetched(mirror, [mirror])).toBe(true);
  });

  it("refuses a push destination naming another repository", () => {
    expect(
      pushesWhereItFetched(FETCH, ["git@github.com:someone-else/harness.git"]),
    ).toBe(false);
  });

  it("refuses when one of several push destinations differs", () => {
    expect(
      pushesWhereItFetched(FETCH, [
        FETCH,
        "git@github.com:someone-else/harness.git",
      ]),
    ).toBe(false);
  });

  it("reads the same repository spelled with and without its .git suffix as one", () => {
    expect(
      pushesWhereItFetched("https://github.com/fimoklei/agent-harness", [
        "https://github.com/fimoklei/agent-harness.git/",
      ]),
    ).toBe(true);
  });

  it("refuses an unknown destination rather than assuming the fetch url", () => {
    expect(pushesWhereItFetched(FETCH, [])).toBe(false);
    expect(pushesWhereItFetched(null, [FETCH])).toBe(false);
  });
});
