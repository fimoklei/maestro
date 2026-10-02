import { describe, expect, it } from "vitest";
import { normalizeHome, verdict } from "../../scripts/capture-apm-fixtures.mjs";

describe("normalizeHome", () => {
  it("replaces the sandbox home and its dash-encoded form", () => {
    const home = "/private/tmp/apm-cap.Ab12/h3";
    const text =
      "[*] Updated /private/tmp/apm-cap.Ab12/h3/repo/apm.yml\n" +
      "cache -private-tmp-apm-cap.Ab12-h3-repo\n";

    expect(normalizeHome(text, home)).toBe(
      "[*] Updated /Users/dev/repo/apm.yml\ncache -Users-dev-repo\n",
    );
  });
});

describe("verdict", () => {
  const capture = { text: "[+] done\n", exit: 0, expectedExit: 0 };

  it("is new when no fixture is committed", () => {
    expect(verdict({ ...capture, committed: null })).toBe("new");
  });

  it("is throttled when the capture holds the rate-limit line", () => {
    const text = "[i] GitHub API rate limit hit while checking github.com\n";

    expect(verdict({ ...capture, text, committed: text })).toBe("throttled");
  });

  it("is an exit mismatch when apm exits otherwise than recorded", () => {
    expect(verdict({ ...capture, exit: 1, committed: capture.text })).toBe(
      "exit-mismatch",
    );
  });

  it("is same when only trailing whitespace differs", () => {
    expect(verdict({ ...capture, committed: "[+] done   \n" })).toBe("same");
  });

  it("is same when the fixture opens with annotation lines", () => {
    const committed =
      "# apm 0.29.0 — why this exists\n$ apm update\n[+] done\n";

    expect(verdict({ ...capture, committed })).toBe("same");
  });

  it("is same when only apm's timing differs", () => {
    const text = "[*] Installed 1 APM dependency in 4.7s.\n";
    const committed = "[*] Installed 1 APM dependency in 4.5s.\n";

    expect(verdict({ ...capture, text, committed })).toBe("same");
  });

  it("differs when the output changed", () => {
    expect(verdict({ ...capture, committed: "[+] other\n" })).toBe("differs");
  });
});
