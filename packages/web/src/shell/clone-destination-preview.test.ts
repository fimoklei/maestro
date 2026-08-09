import { previewCloneChild } from "./clone-destination-preview";

describe("previewCloneChild", () => {
  it("names the folder an https GitHub url would clone into", () => {
    expect(previewCloneChild("https://github.com/fimoklei/agent-harness")).toBe(
      "agent-harness",
    );
  });

  it("drops a .git suffix and a trailing slash", () => {
    expect(
      previewCloneChild("https://github.com/fimoklei/agent-harness.git/"),
    ).toBe("agent-harness");
  });

  it("names the folder for the scp-like ssh form", () => {
    expect(previewCloneChild("git@github.com:fimoklei/agent-harness.git")).toBe(
      "agent-harness",
    );
  });

  it("ignores surrounding whitespace", () => {
    expect(previewCloneChild("  https://github.com/o/r  ")).toBe("r");
  });

  it("has nothing to preview for a local path", () => {
    expect(previewCloneChild("/Users/me/agent-harness")).toBeNull();
  });

  it("has nothing to preview for a host Maestro does not clone from", () => {
    expect(previewCloneChild("https://gitlab.com/o/r")).toBeNull();
  });

  it("has nothing to preview for a url that names no repository", () => {
    expect(previewCloneChild("https://github.com/fimoklei")).toBeNull();
    expect(previewCloneChild("https://github.com/")).toBeNull();
  });

  it("has nothing to preview for an empty field", () => {
    expect(previewCloneChild("")).toBeNull();
  });

  // The server refuses both of these, so proposing a destination for them
  // would promise something Maestro will not do.
  it("has nothing to preview for a url carrying credentials", () => {
    expect(previewCloneChild("https://user:t0ken@github.com/o/r")).toBeNull();
  });

  it("has nothing to preview for a url on a non-default port", () => {
    expect(previewCloneChild("https://github.com:8443/o/r")).toBeNull();
  });

  // The server clones these, so hiding the destination picker for them would
  // send the clone to the default parent with no way to change it.
  it("names the folder for an ssh url spelling out the default port", () => {
    expect(previewCloneChild("ssh://github.com:22/o/r.git")).toBe("r");
  });
});
