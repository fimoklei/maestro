import { describe, expect, it } from "vitest";
import { ACTIONS, doneSentence, loadedText, loadingText } from "./busy-copy";

describe("busy labels", () => {
  it.each([
    ["deploy", "Deploying…"],
    ["update", "Updating…"],
    ["remove", "Removing…"],
    ["delete", "Deleting…"],
    ["restore", "Restoring…"],
    ["propose", "Proposing…"],
    ["withdraw", "Withdrawing…"],
    ["reopen", "Reopening…"],
    ["create", "Creating…"],
    ["import", "Importing…"],
    ["register", "Registering…"],
    ["unregister", "Unregistering…"],
    ["scaffold", "Scaffolding…"],
    ["connect", "Connecting…"],
    ["setLocation", "Setting…"],
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
    ["propose", "Proposed tdd."],
    ["withdraw", "Withdrew tdd."],
    ["reopen", "Reopened tdd."],
    ["create", "Created tdd."],
    ["import", "Imported tdd."],
    ["register", "Registered tdd."],
    ["unregister", "Unregistered tdd."],
    ["scaffold", "Scaffolded tdd."],
    ["connect", "Connected tdd."],
    ["setLocation", "Set tdd."],
  ] as const)("ends %s as %s", (action, sentence) => {
    expect(doneSentence(action, "tdd")).toBe(sentence);
  });

  it("names a bulk write by its count", () => {
    expect(doneSentence("deploy", "12 skills")).toBe("Deployed 12 skills.");
  });
});

describe("read announcements", () => {
  it("names the screen while the skeleton is up", () => {
    expect(loadingText("Inventory")).toBe("Loading the Inventory…");
  });

  it("ends the read with the screen name", () => {
    expect(loadedText("Inventory")).toBe("Inventory loaded.");
  });
});
