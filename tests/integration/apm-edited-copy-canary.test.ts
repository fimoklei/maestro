import { execFile } from "node:child_process";
import {
  appendFile,
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const run = promisify(execFile);

const enabled = process.env.MAESTRO_REAL_APM === "1";

const ROOT_REF = "github.com/fimoklei/agent-harness#v0.6.0";
const SKILL = "tdd";
const EDIT = "local edit\n";
const fixture = (name: string) =>
  join(import.meta.dirname, "../fixtures", name);

type ApmRun = { exitCode: number; output: string };

describe.runIf(enabled)("real apm install over an edited copy", () => {
  let home: string;
  let neutral: string;
  let env: NodeJS.ProcessEnv;

  const installSelection = async (): Promise<ApmRun> => {
    const args = ["install", ROOT_REF, "--skill", SKILL, "-g", "-t", "claude"];
    try {
      const { stdout, stderr } = await run("apm", args, { cwd: neutral, env });
      return { exitCode: 0, output: normalize(`${stdout}\n${stderr}`) };
    } catch (error) {
      const failed = error as { code: number; stdout: string; stderr: string };
      return {
        exitCode: failed.code,
        output: normalize(`${failed.stdout}\n${failed.stderr}`),
      };
    }
  };

  const skillFile = () => join(home, ".claude", "skills", SKILL, "SKILL.md");

  const useVersionOneRecord = async () => {
    const apmHome = join(home, ".apm");
    await rm(apmHome, { recursive: true, force: true });
    await mkdir(apmHome);
    await copyFile(
      fixture("apm.yml.0.32.0-global-tdd.yaml"),
      join(apmHome, "apm.yml"),
    );
    await copyFile(
      fixture("apm.lock.0.32.0-global-tdd.yaml"),
      join(apmHome, "apm.lock.yaml"),
    );
  };

  const setAside = async () => {
    const aside = join(home, ".claude", `.maestro-set-aside-${SKILL}-canary`);
    await rename(join(home, ".claude", "skills", SKILL), aside);
    return aside;
  };

  beforeEach(async () => {
    home = await realpath(
      await mkdtemp(join(tmpdir(), "maestro-edited-copy-canary-")),
    );
    neutral = join(home, "neutral");
    await mkdir(neutral);
    const { stdout: token } = await run("gh", ["auth", "token"]);
    env = {
      ...process.env,
      HOME: home,
      GITHUB_TOKEN: token.trim(),
      GITHUB_APM_PAT: token.trim(),
    };
    expect((await installSelection()).exitCode).toBe(0);
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it("keeps the edit and still reports success under its own lockfile", {
    timeout: 120_000,
  }, async () => {
    await appendFile(skillFile(), EDIT);

    const reinstall = await installSelection();

    expect(reinstall.exitCode).toBe(0);
    expect(reinstall.output).toContain(
      "no changes -- install state already up to date",
    );
    expect(reinstall.output).toContain(
      `kept .claude/skills/${SKILL}/skill.md: it was modified since apm deployed it`,
    );
    expect(await readFile(skillFile(), "utf8")).toContain(EDIT);
  });

  it("refuses the whole install under a version-1 lockfile", {
    timeout: 120_000,
  }, async () => {
    await useVersionOneRecord();
    await appendFile(skillFile(), EDIT);

    const reinstall = await installSelection();

    expect(reinstall.exitCode).toBe(1);
    expect(reinstall.output).toContain(
      `skipped .claude/skills/${SKILL}/skill.md: no trustworthy local deployment baseline`,
    );
    expect(reinstall.output).toContain(
      "no install transaction changes were committed",
    );
    expect(await readFile(skillFile(), "utf8")).toContain(EDIT);
  });

  for (const record of ["its own", "a version-1"] as const) {
    it(`writes the release over a copy set aside first, under ${record} lockfile`, {
      timeout: 120_000,
    }, async () => {
      const released = await readFile(skillFile(), "utf8");
      if (record === "a version-1") await useVersionOneRecord();
      await appendFile(skillFile(), EDIT);
      await setAside();

      const reinstall = await installSelection();

      expect(reinstall.exitCode).toBe(0);
      expect(reinstall.output).not.toContain("kept .claude/skills");
      expect(reinstall.output).not.toContain("no trustworthy local deployment");
      expect(await readFile(skillFile(), "utf8")).toBe(released);
      expect((await readdir(join(home, ".claude", "skills"))).sort()).toEqual([
        SKILL,
      ]);
    });
  }
});

describe.runIf(!enabled)(
  "real apm install over an edited copy (skipped)",
  () => {
    it("is disabled without MAESTRO_REAL_APM=1", () => {
      expect(enabled).toBe(false);
    });
  },
);

function normalize(output: string): string {
  return output.replace(/\s+/g, " ").toLowerCase();
}
