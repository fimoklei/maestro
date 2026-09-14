import { describe, expect, it } from "vitest";
import { HttpError } from "../api/http";
import { registerMessage } from "./notice-copy";

const refusal = (code: string) => new HttpError(400, "ignored", code);

describe("registerMessage", () => {
  it("asks for an absolute path when none was sent", () => {
    expect(registerMessage(refusal("missing"))).toBe(
      "Enter the repository's absolute path.",
    );
  });

  it("shows what an absolute path looks like", () => {
    expect(registerMessage(refusal("relative"))).toBe(
      "Enter the repository's absolute path, for example /Users/name/code/my-repo.",
    );
  });

  it("sends a path that exists nowhere back to the picker", () => {
    expect(registerMessage(refusal("not-found"))).toBe(
      "Nothing exists there to register. Check the spelling, or pick another folder.",
    );
  });

  it("asks for the folder holding the file", () => {
    expect(registerMessage(refusal("not-a-directory"))).toBe(
      "That path names a file. Register the folder that holds it.",
    );
  });

  it("separates the Harness from the repositories it deploys to", () => {
    expect(registerMessage(refusal("central-inventory"))).toBe(
      "The Harness holds the skills to deploy, not a target. Register a repository that uses skills instead.",
    );
  });

  it("keeps the server's own words for a request the server could not read", () => {
    expect(
      registerMessage(
        new HttpError(
          400,
          "No path reached the server. Reload the page, then name the folder again.",
          "invalid-body",
          { detail: "The request carries a path: { path: string }." },
        ),
      ),
    ).toBe(
      "No path reached the server. Reload the page, then name the folder again.",
    );
  });

  it("never renders the wrapper's own status line for an uncovered code", () => {
    expect(
      registerMessage(new HttpError(500, "Request failed with status 500.")),
    ).toBe("Maestro could not register this repository. Try registering it again.");
  });

  it("states the same for a failure that never reached the server", () => {
    expect(registerMessage(new TypeError("network down"))).toBe(
      "Maestro could not register this repository. Try registering it again.",
    );
  });
});
