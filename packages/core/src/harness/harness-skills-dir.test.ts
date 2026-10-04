import { describe, expect, it } from "vitest";
import { resolveHarnessSkillsDir } from "./harness-skills-dir";

const fsWith = (realpath: (path: string) => Promise<string>) => ({ realpath });

describe("resolveHarnessSkillsDir", () => {
  it("returns the real skills folder inside the harness", async () => {
    const fs = fsWith(async (path) =>
      path.replace("/link-to-harness", "/real/harness"),
    );

    expect(await resolveHarnessSkillsDir(fs, "/link-to-harness")).toEqual({
      ok: true,
      skills: "/real/harness/.apm/skills",
    });
  });

  it("refuses a symlinked skills folder that points outside the harness", async () => {
    const fs = fsWith(async (path) =>
      path === "/harness/.apm/skills" ? "/elsewhere/skills" : path,
    );

    expect(await resolveHarnessSkillsDir(fs, "/harness")).toEqual({
      ok: false,
      reason: "outside-root",
    });
  });

  it("reports an unreadable harness root", async () => {
    const fs = fsWith(async (path) => {
      if (path === "/harness") {
        throw new Error("EACCES");
      }
      return path;
    });

    expect(await resolveHarnessSkillsDir(fs, "/harness")).toEqual({
      ok: false,
      reason: "unreadable",
    });
  });

  it("reports a missing skills folder as unreadable", async () => {
    const fs = fsWith(async (path) => {
      if (path === "/harness/.apm/skills") {
        throw new Error("ENOENT");
      }
      return path;
    });

    expect(await resolveHarnessSkillsDir(fs, "/harness")).toEqual({
      ok: false,
      reason: "unreadable",
    });
  });
});
