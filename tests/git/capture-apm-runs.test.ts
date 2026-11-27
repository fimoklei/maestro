import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { capture, sandbox } from "../../scripts/capture-apm-fixtures.mjs";

describe("apm runs", () => {
  const dirs: string[] = [];

  afterEach(() => {
    vi.unstubAllEnvs();
    for (const dir of dirs.splice(0))
      rmSync(dir, { recursive: true, force: true });
  });

  function fakeApm() {
    const dir = mkdtempSync(join(tmpdir(), "fake-apm."));
    dirs.push(dir);
    const log = join(dir, "runs.log");
    writeFileSync(
      join(dir, "apm"),
      `#!/bin/sh\necho "$1 auth-first=\${APM_GITHUB_AUTH_FIRST:-unset} pat=\${GITHUB_APM_PAT:-unset}" >> "${log}"\n`,
    );
    chmodSync(join(dir, "apm"), 0o755);
    vi.stubEnv("PATH", `${dir}${delimiter}${process.env.PATH}`);
    return { dir, runs: () => readFileSync(log, "utf8").trim().split("\n") };
  }

  it("runs setup auth-first and the captured command default", () => {
    const apm = fakeApm();
    vi.stubEnv("APM_GITHUB_AUTH_FIRST", undefined);
    const box = sandbox(apm.dir, "tok");

    box.apm(["install"]);
    capture(
      box,
      { capture: ["authed", ["outdated"]], exit: 0 },
      join(apm.dir, "out.txt"),
    );

    expect(apm.runs()).toEqual([
      "install auth-first=1 pat=tok",
      "outdated auth-first=unset pat=tok",
    ]);
  });

  it("captures default when the shell sets auth-first", () => {
    const apm = fakeApm();
    vi.stubEnv("APM_GITHUB_AUTH_FIRST", "1");
    const box = sandbox(apm.dir, "tok");

    capture(
      box,
      { capture: ["anon", ["view"]], exit: 0 },
      join(apm.dir, "out.txt"),
    );

    expect(apm.runs()).toEqual(["view auth-first=unset pat=unset"]);
  });
});
