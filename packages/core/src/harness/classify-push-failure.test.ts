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

  it("reads a lease the remote no longer matches as a stale tip", () => {
    expect(
      classifyPushFailure(
        "error: atomic push failed for ref refs/heads/main. status: 7\nTo /path/remote.git\n ! [rejected]        291b10c10bd3c6e69181314286b9a60d58b8e08e -> main (stale info)\n ! [rejected]        291b10c10bd3c6e69181314286b9a60d58b8e08e -> v1.1.0 (atomic push failed)\nerror: failed to push some refs to '/path/remote.git'\n",
      ),
    ).toBe("stale-tip");
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
