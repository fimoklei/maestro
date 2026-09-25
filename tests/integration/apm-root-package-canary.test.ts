// Drives `apm` directly, not Maestro's driver, so the evidence stays
// independent of production Deploy code (#957). Every assertion reads files and
// the lockfile; the exit code never proves completion.
import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const run = promisify(execFile);

const enabled = process.env.MAESTRO_REAL_APM === "1";

// Pinned so the canary measures apm, not a moving Harness.
const HARNESS = "fimoklei/agent-harness";
const TAG = "v0.6.0";
const ROOT_REF = `github.com/${HARNESS}#${TAG}`;
const KEPT_SKILL = "prototype";
const DROPPED_SKILL = "caveman";
const FOREIGN_SKILL = "tdd";
const FOREIGN_REF = `github.com/${HARNESS}/.apm/skills/${FOREIGN_SKILL}#${TAG}`;
const HANDMADE = "handmade";

const SUCCESS = "Installed 1 APM dependency";
const EMPTY_REFUSAL = "skills: must contain at least one name";
const UNINSTALL_SUCCESS =
  "Uninstall complete: Removed 1 package(s) from apm.yml";

type Outcome = { code: number; output: string };

// Rich wraps a sentence mid-phrase at a width-dependent point: match phrases
// whitespace-normalized and lowercased.
const flatten = (text: string) => text.replace(/\s+/g, " ").toLowerCase();
const says = (outcome: Outcome, phrase: string) =>
  flatten(outcome.output).includes(flatten(phrase));

async function apm(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<Outcome> {
  try {
    const { stdout, stderr } = await run("apm", args, {
      cwd,
      env,
      maxBuffer: 10_000_000,
    });
    return { code: 0, output: `${stdout}${stderr}` };
  } catch (error) {
    const failure = error as {
      code?: number;
      stdout?: string;
      stderr?: string;
    };
    return {
      code: failure.code ?? 1,
      output: `${failure.stdout ?? ""}${failure.stderr ?? ""}`,
    };
  }
}

async function tokenEnv(home: string): Promise<NodeJS.ProcessEnv> {
  // gh reads its own config, so the token is taken before HOME is redirected.
  const { stdout } = await run("gh", ["auth", "token"]);
  return { ...process.env, HOME: home, GITHUB_TOKEN: stdout.trim() };
}

async function seedHandmade(root: string): Promise<void> {
  await mkdir(join(root, ".claude", "skills", HANDMADE), { recursive: true });
  await writeFile(
    join(root, ".claude", "skills", HANDMADE, "SKILL.md"),
    "hand-placed\n",
  );
}

/** Rewrites the `skills:` list apm just wrote; the real writer parses the document. */
async function writeSelection(
  manifestPath: string,
  names: string[],
): Promise<string> {
  const manifest = await readFile(manifestPath, "utf8");
  const list =
    names.length === 0
      ? " []"
      : `\n${names.map((n) => `        - ${n}`).join("\n")}`;
  const rewritten = manifest.replace(
    / {6}skills:( \[\]|(\n {8}- .*)+)/,
    `      skills:${list}`,
  );
  expect(rewritten).not.toEqual(manifest);
  await writeFile(manifestPath, rewritten);
  return rewritten;
}

async function lockfile(path: string): Promise<string> {
  return await readFile(path, "utf8");
}

describe.runIf(enabled)("real apm root-package canary", () => {
  let home: string;
  let repo: string;

  beforeEach(async () => {
    // A symlinked HOME makes apm ≥0.29.0 deploy nothing.
    home = await realpath(await mkdtemp(join(tmpdir(), "maestro-root-home-")));
    repo = await realpath(await mkdtemp(join(tmpdir(), "maestro-root-repo-")));
  });

  afterEach(async () => {
    for (const dir of [home, repo]) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("creates, narrows and removes the Harness dependency in a repo", {
    timeout: 300_000,
  }, async () => {
    const env = await tokenEnv(home);
    const manifestPath = join(repo, "apm.yml");
    const lockPath = join(repo, "apm.lock.yaml");
    const skillDir = (name: string) => join(repo, ".claude", "skills", name);
    await seedHandmade(repo);

    const created = await apm(
      [
        "install",
        ROOT_REF,
        "--skill",
        KEPT_SKILL,
        "--skill",
        DROPPED_SKILL,
        "-t",
        "claude",
      ],
      repo,
      env,
    );
    expect(says(created, SUCCESS)).toBe(true);

    const manifest = await readFile(manifestPath, "utf8");
    expect(manifest).toContain(`git: ${HARNESS}`);
    expect(manifest).toContain(`ref: ${TAG}`);
    expect(manifest).toMatch(/skills:\n {8}- caveman\n {8}- prototype\n/);
    const firstLock = await lockfile(lockPath);
    expect(firstLock).toContain("package_type: apm_package");
    expect(firstLock).toMatch(
      /skill_subset:\n {2}- caveman\n {2}- prototype\n/,
    );
    expect(firstLock).toContain(`.claude/skills/${KEPT_SKILL}/SKILL.md`);
    await expect(
      readFile(join(skillDir(DROPPED_SKILL), "SKILL.md"), "utf8"),
    ).resolves.toContain("");
    expect(firstLock).not.toContain(`.claude/skills/${FOREIGN_SKILL}`);

    // Same repository, own package: a removal keyed on the repository would take it.
    const foreign = await apm(
      ["install", FOREIGN_REF, "-t", "claude"],
      repo,
      env,
    );
    expect(says(foreign, SUCCESS)).toBe(true);

    // A `--skill` flag alone unions with the persisted list.
    await writeSelection(manifestPath, [KEPT_SKILL]);
    const narrowed = await apm(
      ["install", ROOT_REF, "--skill", KEPT_SKILL, "-t", "claude"],
      repo,
      env,
    );
    expect(says(narrowed, SUCCESS)).toBe(true);

    const narrowedLock = await lockfile(lockPath);
    expect(narrowedLock).toMatch(/skill_subset:\n {2}- prototype\n/);
    expect(narrowedLock).not.toContain(`.claude/skills/${DROPPED_SKILL}`);
    await expect(
      readFile(join(skillDir(DROPPED_SKILL), "SKILL.md"), "utf8"),
    ).rejects.toThrow();
    await expect(
      readFile(join(skillDir(KEPT_SKILL), "SKILL.md"), "utf8"),
    ).resolves.toBeTruthy();
    await expect(
      readFile(join(skillDir(FOREIGN_SKILL), "SKILL.md"), "utf8"),
    ).resolves.toBeTruthy();
    await expect(
      readFile(join(skillDir(HANDMADE), "SKILL.md"), "utf8"),
    ).resolves.toContain("hand-placed");

    await writeSelection(manifestPath, []);
    const emptied = await apm(["install", "-t", "claude"], repo, env);
    expect(emptied.code).toBe(1);
    expect(says(emptied, EMPTY_REFUSAL)).toBe(true);
    expect(says(emptied, SUCCESS)).toBe(false);
    expect(await lockfile(lockPath)).toEqual(narrowedLock);
    await expect(
      readFile(join(skillDir(KEPT_SKILL), "SKILL.md"), "utf8"),
    ).resolves.toBeTruthy();
    await writeSelection(manifestPath, [KEPT_SKILL]);

    const removed = await apm(["uninstall", ROOT_REF], repo, env);
    expect(says(removed, UNINSTALL_SUCCESS)).toBe(true);

    await expect(
      readFile(join(skillDir(KEPT_SKILL), "SKILL.md"), "utf8"),
    ).rejects.toThrow();
    const afterRemoval = await readFile(manifestPath, "utf8");
    expect(afterRemoval).not.toContain(`git: ${HARNESS}`);
    expect(afterRemoval).toContain(
      `${HARNESS}/.apm/skills/${FOREIGN_SKILL}#${TAG}`,
    );
    const finalLock = await lockfile(lockPath);
    expect(finalLock).toContain(`virtual_path: .apm/skills/${FOREIGN_SKILL}`);
    expect(finalLock).not.toContain("package_type: apm_package");
    await expect(
      readFile(join(skillDir(FOREIGN_SKILL), "SKILL.md"), "utf8"),
    ).resolves.toBeTruthy();
    await expect(
      readFile(join(skillDir(HANDMADE), "SKILL.md"), "utf8"),
    ).resolves.toContain("hand-placed");
  });

  it("creates, narrows and removes the Harness dependency in the global scope", {
    timeout: 300_000,
  }, async () => {
    const env = await tokenEnv(home);
    const manifestPath = join(home, ".apm", "apm.yml");
    const lockPath = join(home, ".apm", "apm.lock.yaml");
    // apm appends apm_modules/ to the cwd's .gitignore even for -g.
    const cwd = join(home, ".apm-scratch");
    await mkdir(cwd, { recursive: true });
    await seedHandmade(home);
    const copies = (name: string) =>
      [".claude", ".agents"].map((tool) =>
        join(home, tool, "skills", name, "SKILL.md"),
      );

    const created = await apm(
      [
        "install",
        ROOT_REF,
        "--skill",
        KEPT_SKILL,
        "--skill",
        DROPPED_SKILL,
        "-g",
        "-t",
        "claude,codex",
      ],
      cwd,
      env,
    );
    expect(says(created, SUCCESS)).toBe(true);
    expect(await readFile(manifestPath, "utf8")).toMatch(
      /skills:\n {8}- caveman\n {8}- prototype\n/,
    );
    expect(await lockfile(lockPath)).toMatch(
      /skill_subset:\n {2}- caveman\n {2}- prototype\n/,
    );
    for (const copy of [...copies(KEPT_SKILL), ...copies(DROPPED_SKILL)]) {
      await expect(readFile(copy, "utf8")).resolves.toBeTruthy();
    }

    const foreign = await apm(
      ["install", FOREIGN_REF, "-g", "-t", "claude,codex"],
      cwd,
      env,
    );
    expect(says(foreign, SUCCESS)).toBe(true);

    await writeSelection(manifestPath, [KEPT_SKILL]);
    const narrowed = await apm(
      ["install", ROOT_REF, "--skill", KEPT_SKILL, "-g", "-t", "claude,codex"],
      cwd,
      env,
    );
    expect(says(narrowed, SUCCESS)).toBe(true);
    const narrowedLock = await lockfile(lockPath);
    expect(narrowedLock).toMatch(/skill_subset:\n {2}- prototype\n/);
    for (const copy of copies(DROPPED_SKILL)) {
      await expect(readFile(copy, "utf8")).rejects.toThrow();
    }

    await writeSelection(manifestPath, []);
    const emptied = await apm(
      ["install", "-g", "-t", "claude,codex"],
      cwd,
      env,
    );
    expect(emptied.code).toBe(1);
    expect(says(emptied, EMPTY_REFUSAL)).toBe(true);
    expect(await lockfile(lockPath)).toEqual(narrowedLock);
    await writeSelection(manifestPath, [KEPT_SKILL]);

    // Never run a bare `apm uninstall -g`; always name the package.
    const removed = await apm(["uninstall", "-g", ROOT_REF], cwd, env);
    expect(says(removed, UNINSTALL_SUCCESS)).toBe(true);
    for (const copy of copies(KEPT_SKILL)) {
      await expect(readFile(copy, "utf8")).rejects.toThrow();
    }
    for (const copy of copies(FOREIGN_SKILL)) {
      await expect(readFile(copy, "utf8")).resolves.toBeTruthy();
    }
    const afterRemoval = await readFile(manifestPath, "utf8");
    expect(afterRemoval).not.toContain(`git: ${HARNESS}`);
    expect(afterRemoval).toContain(
      `${HARNESS}/.apm/skills/${FOREIGN_SKILL}#${TAG}`,
    );
    expect(await lockfile(lockPath)).toContain(
      `virtual_path: .apm/skills/${FOREIGN_SKILL}`,
    );
    await expect(
      readFile(join(home, ".claude", "skills", HANDMADE, "SKILL.md"), "utf8"),
    ).resolves.toContain("hand-placed");
  });

  it("stops a named removal on a locally edited copy after deleting the rest", {
    timeout: 300_000,
  }, async () => {
    const env = await tokenEnv(home);
    const skillDir = (name: string) => join(repo, ".claude", "skills", name);

    const created = await apm(
      [
        "install",
        ROOT_REF,
        "--skill",
        KEPT_SKILL,
        "--skill",
        DROPPED_SKILL,
        "-t",
        "claude",
      ],
      repo,
      env,
    );
    expect(says(created, SUCCESS)).toBe(true);

    const edited = join(skillDir(DROPPED_SKILL), "SKILL.md");
    await writeFile(edited, `${await readFile(edited, "utf8")}\nlocal edit\n`);

    const removed = await apm(["uninstall", ROOT_REF], repo, env);
    expect(removed.code).toBe(1);
    expect(says(removed, UNINSTALL_SUCCESS)).toBe(false);
    expect(says(removed, "Retained user-edited file")).toBe(true);

    await expect(readFile(edited, "utf8")).resolves.toContain("local edit");
    await expect(
      readFile(join(skillDir(KEPT_SKILL), "SKILL.md"), "utf8"),
    ).rejects.toThrow();
    const manifest = await readFile(join(repo, "apm.yml"), "utf8");
    expect(manifest).toMatch(/skills:\n {8}- caveman\n {8}- prototype\n/);
    expect(await lockfile(join(repo, "apm.lock.yaml"))).toContain(
      `.claude/skills/${KEPT_SKILL}/SKILL.md`,
    );
  });
});

describe.runIf(!enabled)("real apm root-package canary (skipped)", () => {
  it("is disabled without MAESTRO_REAL_APM=1", () => {
    expect(enabled).toBe(false);
  });
});
