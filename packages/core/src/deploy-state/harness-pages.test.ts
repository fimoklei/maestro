import { describe, expect, it } from "vitest";
import { latestReleasePage } from "./harness-pages";

const HARNESS = "https://github.com/fimoklei/agent-harness";
const head = (latestRelease: string | null) => ({
  release: "v0.3.2",
  latestRelease,
});

describe("latestReleasePage", () => {
  it("links the latest release where the current one links", () => {
    expect(
      latestReleasePage(
        { kind: "link", url: `${HARNESS}/releases/tag/v0.3.2` },
        head("v0.3.4"),
      ),
    ).toEqual({ kind: "link", url: `${HARNESS}/releases/tag/v0.3.4` });
  });

  it("stays unknown where the current release's page is unknown", () => {
    expect(latestReleasePage({ kind: "unknown" }, head("v0.3.4"))).toEqual({
      kind: "unknown",
    });
  });

  it("links nothing where the target is on the latest release or it is unread", () => {
    const page = {
      kind: "link",
      url: `${HARNESS}/releases/tag/v0.3.2`,
    } as const;
    expect(latestReleasePage(page, head("v0.3.2"))).toBeUndefined();
    expect(latestReleasePage(page, head(null))).toBeUndefined();
    expect(latestReleasePage(undefined, head("v0.3.4"))).toBeUndefined();
  });

  it("links nothing for a latest release that is not a release tag", () => {
    expect(
      latestReleasePage(
        { kind: "link", url: `${HARNESS}/releases/tag/v0.3.2` },
        head("main"),
      ),
    ).toBeUndefined();
  });
});
