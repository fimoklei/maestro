import { describe, expect, it } from "vitest";
import { resolveHarnessPrimitiveDir } from "./harness-primitive-dir";

const fsWith = (realpath: (path: string) => Promise<string>) => ({ realpath });

describe("resolveHarnessPrimitiveDir", () => {
  it("returns the real skills folder inside the harness", async () => {
    const fs = fsWith(async (path) =>
      path.replace("/link-to-harness", "/real/harness"),
    );

    expect(
      await resolveHarnessPrimitiveDir(fs, "/link-to-harness", "skill"),
    ).toEqual({
      ok: true,
      dir: "/real/harness/.apm/skills",
    });
  });

  it("returns the real prompts folder for a prompt", async () => {
    const fs = fsWith(async (path) => path);

    expect(await resolveHarnessPrimitiveDir(fs, "/harness", "prompt")).toEqual({
      ok: true,
      dir: "/harness/.maestro/prompts",
    });
  });

  it("refuses a symlinked skills folder that points outside the harness", async () => {
    const fs = fsWith(async (path) =>
      path === "/harness/.apm/skills" ? "/elsewhere/skills" : path,
    );

    expect(await resolveHarnessPrimitiveDir(fs, "/harness", "skill")).toEqual({
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

    expect(await resolveHarnessPrimitiveDir(fs, "/harness", "skill")).toEqual({
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

    expect(await resolveHarnessPrimitiveDir(fs, "/harness", "skill")).toEqual({
      ok: false,
      reason: "unreadable",
    });
  });
});
