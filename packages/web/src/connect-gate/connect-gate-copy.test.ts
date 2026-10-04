import { describe, expect, it } from "vitest";
import {
  CLONE_HINT,
  CLONE_LABEL,
  CLONE_WAIT,
  CONNECT_HARNESS,
  CONNECT_TITLE,
  CONNECTED_TITLE,
  CONTINUE_TO_HARNESS,
  CONTINUE_TO_INVENTORY,
  CREATED_TITLE,
  connectedMessage,
  NO_SKILLS_YET,
  PATH_LABEL,
  PRIVATE_HARNESS_ACCESS,
  WELCOME_BODY,
  WELCOME_TITLE,
} from "./connect-gate-copy";

describe("connect gate copy", () => {
  it("names the Harness on the welcome screen", () => {
    expect(WELCOME_TITLE).toBe("No Harness connected");
    expect(WELCOME_BODY).toBe(
      "Connect a Harness to see its skills, hooks and MCP servers.",
    );
    expect(CONNECT_HARNESS).toBe("Connect Harness");
  });

  it("titles the connect screen and its fields", () => {
    expect(CONNECT_TITLE).toBe("Connect a Harness");
    expect(PATH_LABEL).toBe("Harness folder or GitHub URL");
    expect(CLONE_HINT).toBe(
      "Maestro adds one new folder here and changes nothing else.",
    );
    expect(CLONE_WAIT).toBe("Cloning can take a minute.");
    expect(CLONE_LABEL).toBe("Folder for the Harness");
  });

  it("titles a finished connect and names the way on", () => {
    expect(CONNECTED_TITLE).toBe("Harness connected");
    expect(CONTINUE_TO_INVENTORY).toBe("Continue to Inventory");
    expect(CREATED_TITLE).toBe("Harness created");
    expect(CONTINUE_TO_HARNESS).toBe("Continue to Harness");
  });

  it("states what a connect made ready, with the item count", () => {
    expect(connectedMessage(7)).toBe("7 items are ready in the Inventory.");
    expect(connectedMessage(1)).toBe("1 item is ready in the Inventory.");
    // An unread count is left out rather than shown as zero (#841).
    expect(connectedMessage(null)).toBe(
      "The Harness is ready in the Inventory.",
    );
  });

  it("warns about private access and states an empty scaffold", () => {
    expect(PRIVATE_HARNESS_ACCESS).toBe(
      "Teammates need their own GitHub and APM access to a private Harness.",
    );
    expect(NO_SKILLS_YET).toBe("It has no skills yet.");
  });
});
