import { describe, expect, it } from "vitest";
import { classifyGitError } from "./classify-git-error";
import { classifyPushFailure } from "./classify-push-failure";

const PROTECTED =
  " ! [remote rejected] HEAD -> main (protected branch hook declined)\n";

describe("classifyGitError", () => {
  it("reads a run cut off by its timeout as offline, never as the reply its stderr suggests", () => {
    expect(
      classifyGitError(
        { ok: false, failure: "killed", stdout: "", stderr: PROTECTED },
        classifyPushFailure,
      ),
    ).toBe("offline");
  });

  it("classifies the stderr of a run that ended on its own", () => {
    expect(
      classifyGitError(
        {
          ok: false,
          failure: "failed",
          exitCode: 1,
          stdout: "",
          stderr: PROTECTED,
        },
        classifyPushFailure,
      ),
    ).toBe("refused");
  });
});
