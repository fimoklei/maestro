import { describe, expect, it } from "vitest";
import { classifyPushFailure } from "./classify-push-failure";

// Real output from git 2.50, never retyped.
describe("classifyPushFailure", () => {
  it("reads a tag the remote already has as already-exists, not a generic failure", () => {
    expect(
      classifyPushFailure(
        "To /path/remote.git\n ! [rejected]        5b27680037662356c78f02dd60970efef49333b1 -> v0.1.0 (already exists)\nerror: failed to push some refs to '/path/remote.git'\nhint: Updates were rejected because the tag already exists in the remote.\n",
      ),
    ).toBe("already-exists");
  });

  it("reads an unresolvable host as offline", () => {
    expect(
      classifyPushFailure(
        "fatal: unable to access 'https://nonexistent-host.invalid/o/r.git/': Could not resolve host: nonexistent-host.invalid\n",
      ),
    ).toBe("offline");
  });

  it("reads a failure it does not recognise as a failed push", () => {
    expect(classifyPushFailure("fatal: something new in git 3.0\n")).toBe(
      "push-failed",
    );
  });
});
