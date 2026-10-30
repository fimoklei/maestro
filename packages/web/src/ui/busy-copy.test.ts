import { describe, expect, it } from "vitest";
import {
  ACTIONS,
  doneSentence,
  HARNESS_BUSY,
  loadedText,
  loadingText,
} from "./busy-copy";
import { plainText } from "./phrase";

describe("busy labels", () => {
  it.each([
    ["copy", "Copying…"],
    ["deploy", "Deploying…"],
    ["update", "Updating…"],
    ["remove", "Removing…"],
    ["delete", "Deleting…"],
    ["restore", "Restoring…"],
    ["discard", "Discarding…"],
    ["propose", "Proposing…"],
    ["withdraw", "Withdrawing…"],
    ["withdrawFromRelease", "Withdrawing…"],
    ["reopen", "Reopening…"],
    ["create", "Creating…"],
    ["publish", "Publishing…"],
    ["import", "Importing…"],
    ["edit", "Editing…"],
    ["register", "Registering…"],
    ["unregister", "Unregistering…"],
    ["scaffold", "Scaffolding…"],
    ["connect", "Connecting…"],
    ["setLocation", "Setting…"],
    ["add", "Adding…"],
    ["setCategory", "Setting…"],
  ] as const)("reads %s as %s", (action, label) => {
    expect(ACTIONS[action].busy).toBe(label);
  });

  it("carries no object, so the control around it is not repeated", () => {
    for (const action of Object.values(ACTIONS)) {
      expect(action.busy).toMatch(/^[A-Z][a-z]+ing…$/);
    }
  });
});

describe("done sentences", () => {
  it.each([
    ["deploy", "Deployed tdd."],
    ["update", "Updated tdd."],
    ["remove", "Removed tdd."],
    ["delete", "Deleted tdd."],
    ["restore", "Restored tdd."],
    ["discard", "Discarded change to tdd."],
    ["propose", "Proposed tdd."],
    ["withdraw", "Withdrew tdd."],
    ["withdrawFromRelease", "Withdrew tdd from release."],
    ["reopen", "Reopened tdd."],
    ["create", "Created tdd."],
    ["publish", "Published tdd."],
    ["import", "Imported tdd."],
    ["edit", "Edited tdd."],
    ["register", "Registered tdd."],
    ["unregister", "Unregistered tdd."],
    ["scaffold", "Scaffolded tdd."],
    ["connect", "Connected tdd."],
    ["setLocation", "Set tdd."],
    ["add", "Added tdd."],
    ["setCategory", "Set category for tdd."],
  ] as const)("ends %s as %s", (action, sentence) => {
    expect(plainText(doneSentence(action, "tdd"))).toBe(sentence);
  });

  it("names a bulk write by its count", () => {
    expect(plainText(doneSentence("deploy", "12 skills"))).toBe(
      "Deployed 12 skills.",
    );
  });
});

describe("read announcements", () => {
  it("names the screen while the skeleton is up", () => {
    expect(loadingText("Skills")).toBe("Loading the Skills…");
  });

  it("ends the read with the screen name", () => {
    expect(loadedText("Skills")).toBe("Skills loaded.");
  });
});

describe("HARNESS_BUSY", () => {
  it("heads every refusal of a Harness write while another runs", () => {
    expect(HARNESS_BUSY).toBe("Harness busy");
  });
});
