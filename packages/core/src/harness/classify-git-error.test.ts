import { describe, expect, it } from "vitest";
import { classifyGitError } from "./classify-git-error";
import { classifyPushFailure } from "./classify-push-failure";

describe("classifyGitError", () => {
  it("reads a run cut off by its timeout as offline, never as the reply its stderr suggests", () => {
    const cutOff = Object.assign(new Error("timed out"), {
      killed: true,
      stderr:
        " ! [remote rejected] HEAD -> main (protected branch hook declined)\n",
    });

    expect(classifyGitError(cutOff, classifyPushFailure)).toBe("offline");
  });

  it("classifies the stderr of a run that ended on its own", () => {
    const refused = Object.assign(new Error("git failed"), {
      killed: false,
      stderr:
        " ! [remote rejected] HEAD -> main (protected branch hook declined)\n",
    });

    expect(classifyGitError(refused, classifyPushFailure)).toBe("refused");
  });
});
