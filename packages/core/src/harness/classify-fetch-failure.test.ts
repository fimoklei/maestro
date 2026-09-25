import { describe, expect, it } from "vitest";
import { classifyFetchFailure } from "./classify-fetch-failure";

// Real captures from git 2.51, never retyped.
describe("classifyFetchFailure", () => {
  it("reads an unresolvable host as offline", () => {
    expect(
      classifyFetchFailure(
        "fatal: unable to access 'https://nonexistent-host.invalid/o/r.git/': Could not resolve host: nonexistent-host.invalid\n",
      ),
    ).toBe("offline");
  });

  it("reads a refused connection as offline", () => {
    expect(
      classifyFetchFailure(
        "fatal: unable to access 'https://github.com/o/r.git/': Failed to connect to github.com port 443 after 75000 ms: Couldn't connect to server\n",
      ),
    ).toBe("offline");
  });

  it("reads a reply that says no as a failed fetch, not as no network", () => {
    expect(
      classifyFetchFailure(
        "remote: Repository not found.\nfatal: repository 'https://github.com/o/r.git/' not found\n",
      ),
    ).toBe("fetch-failed");
  });

  it("reads a rejected key as a failed fetch, not as a permission gate of ours", () => {
    // A rejected key stays an ordinary failed fetch (#516).
    expect(
      classifyFetchFailure(
        "git@github.com: Permission denied (publickey).\nfatal: Could not read from remote repository.\n",
      ),
    ).toBe("fetch-failed");
  });

  it("reads a failure it does not recognise as a failed fetch", () => {
    expect(classifyFetchFailure("fatal: something new in git 3.0\n")).toBe(
      "fetch-failed",
    );
  });

  it("reads a phrase broken across lines, so wrapping cannot hide it", () => {
    expect(
      classifyFetchFailure(
        "fatal: unable to access: could not\n  resolve host\n",
      ),
    ).toBe("offline");
  });
});
