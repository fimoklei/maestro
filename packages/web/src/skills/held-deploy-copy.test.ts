import { describe, expect, it } from "vitest";
import { plainText } from "../ui/phrase";
import { heldDeployNotice } from "./held-deploy-copy";

const notice = (edited: string[], held: string[]) => {
  const copy = heldDeployNotice({ edited, held });
  return {
    label: copy.label,
    message: plainText(copy.message),
    items: copy.items?.map(plainText),
    detail: copy.detail === undefined ? undefined : plainText(copy.detail),
  };
};

// Approved strings, as exact strings.
describe("the Local edits block of a held deploy", () => {
  it("names the edited skill and the skill it held back", () => {
    expect(
      notice(["commit-message"], ["code-review", "commit-message"]),
    ).toEqual({
      label: "Local edits",
      message: "Nothing was deployed, because commit-message has local edits.",
      items: [
        "Select Deploy again to replace those edits with the latest release and deploy both skills.",
      ],
      detail:
        "Global skills deploy together, so local edits to commit-message also prevented code-review from being deployed.",
    });
  });

  it("names a deployed skill's edits that held a run it was not part of", () => {
    expect(notice(["commit-message"], ["code-review"])).toEqual({
      label: "Local edits",
      message: "Nothing was deployed, because commit-message has local edits.",
      items: [
        "Select Deploy again to replace those edits with the latest release and deploy code-review.",
      ],
      detail:
        "Global skills deploy together, so local edits to commit-message also prevented code-review from being deployed.",
    });
  });

  it("states no held-back skill when every held skill has edits", () => {
    expect(notice(["commit-message"], ["commit-message"])).toEqual({
      label: "Local edits",
      message: "Nothing was deployed, because commit-message has local edits.",
      items: [
        "Select Deploy again to replace those edits with the latest release and deploy commit-message.",
      ],
      detail: undefined,
    });
  });

  it("names several edited and held-back skills", () => {
    expect(
      notice(
        ["code-review", "commit-message"],
        ["code-review", "commit-message", "docs", "tdd"],
      ),
    ).toEqual({
      label: "Local edits",
      message:
        "Nothing was deployed, because code-review and commit-message have local edits.",
      items: [
        "Select Deploy again to replace those edits with the latest release and deploy all 4 skills.",
      ],
      detail:
        "Global skills deploy together, so local edits to code-review and commit-message also prevented docs and tdd from being deployed.",
    });
  });
});
