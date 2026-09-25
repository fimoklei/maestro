import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { HarnessGitAdapter } from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const run = promisify(execFile);

const IDENTITY = {
  ...process.env,
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.invalid",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.invalid",
};

describe("HarnessGitAdapter catch-up", () => {
  let remote: string;
  let teammate: string;
  let root: string;

  const git = async (cwd: string, ...args: string[]) =>
    (await run("git", args, { cwd, env: IDENTITY })).stdout;

  const skillFile = (dir: string, name: string, file = "SKILL.md") =>
    join(dir, ".apm", "skills", name, file);

  const writeSkill = async (dir: string, name: string, description: string) => {
    await mkdir(join(dir, ".apm", "skills", name), { recursive: true });
    await writeFile(
      skillFile(dir, name),
      `---\nname: ${name}\ndescription: ${description}\n---\n`,
      "utf8",
    );
  };

  const landUpstream = async (change: () => Promise<void>) => {
    await change();
    await git(teammate, "add", "-A");
    await git(teammate, "commit", "-m", "land change");
    await git(teammate, "push", "origin", "main");
    await git(root, "fetch", "origin");
  };

  const snapshot = async () => ({
    head: (await git(root, "rev-parse", "HEAD")).trim(),
    status: await git(root, "status", "--porcelain", "--untracked-files=all"),
  });

  const upstream = async () =>
    (await git(root, "rev-parse", "origin/main")).trim();

  beforeEach(async () => {
    remote = await mkdtemp(join(tmpdir(), "maestro-catch-up-remote-"));
    await run("git", ["init", "--bare", "-b", "main", remote]);
    teammate = await mkdtemp(join(tmpdir(), "maestro-catch-up-teammate-"));
    await git(teammate, "clone", remote, ".");
    await git(teammate, "checkout", "-b", "main");
    await writeSkill(teammate, "tdd", "A skill");
    await git(teammate, "add", "-A");
    await git(teammate, "commit", "-m", "add tdd");
    await git(teammate, "push", "-u", "origin", "main");
    root = await mkdtemp(join(tmpdir(), "maestro-catch-up-root-"));
    await git(root, "clone", remote, ".");
    // The machine's global ignore rules must not hide an untracked file.
    await git(root, "config", "core.excludesFile", "/dev/null");
  });

  afterEach(async () => {
    for (const dir of [remote, teammate, root]) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  const adapter = new HarnessGitAdapter();

  it("reads a clone at its upstream as current", async () => {
    await expect(adapter.readCloneSync(root)).resolves.toBe("current");
  });

  it("fast-forwards a clean clone that fell behind", async () => {
    await landUpstream(() => writeSkill(teammate, "tdd", "Improved"));
    await expect(adapter.readCloneSync(root)).resolves.toBe("behind");

    await adapter.catchUp(root);

    expect((await snapshot()).head).toBe(await upstream());
    await expect(adapter.readCloneSync(root)).resolves.toBe("current");
  });

  it("clears an unstaged change that landed upstream and catches up", async () => {
    await landUpstream(() => writeSkill(teammate, "tdd", "Improved"));
    await writeSkill(root, "tdd", "Improved");

    await adapter.catchUp(root);

    expect(await snapshot()).toEqual({ head: await upstream(), status: "" });
  });

  it("clears a staged change that landed upstream and catches up", async () => {
    await landUpstream(() => writeSkill(teammate, "tdd", "Improved"));
    await writeSkill(root, "tdd", "Improved");
    await git(root, "add", "-A");

    await adapter.catchUp(root);

    expect(await snapshot()).toEqual({ head: await upstream(), status: "" });
  });

  it("clears an imported skill that landed upstream and catches up", async () => {
    await landUpstream(() => writeSkill(teammate, "review", "New skill"));
    await writeSkill(root, "review", "New skill");

    await adapter.catchUp(root);

    expect(await snapshot()).toEqual({ head: await upstream(), status: "" });
  });

  it("clears a deletion that landed upstream and catches up", async () => {
    await landUpstream(() =>
      rm(join(teammate, ".apm", "skills", "tdd"), { recursive: true }),
    );
    await rm(join(root, ".apm", "skills", "tdd"), { recursive: true });

    await adapter.catchUp(root);

    expect(await snapshot()).toEqual({ head: await upstream(), status: "" });
  });

  it("clears a deletion staged with git rm that landed upstream and catches up", async () => {
    await landUpstream(() =>
      rm(join(teammate, ".apm", "skills", "tdd"), { recursive: true }),
    );
    await git(root, "rm", "-r", "-q", ".apm/skills/tdd");

    await adapter.catchUp(root);

    expect(await snapshot()).toEqual({ head: await upstream(), status: "" });
  });

  it("catches up past local work on files upstream never touched, leaving it as it was", async () => {
    // The fast-forward carries untracked and unrelated edits over, unstaged (#978).
    await writeSkill(teammate, "other", "Teammate's");
    await git(teammate, "add", "-A");
    await git(teammate, "commit", "-m", "add other");
    await git(teammate, "push", "origin", "main");
    await git(root, "pull", "-q");
    await landUpstream(() => writeSkill(teammate, "tdd", "Improved"));
    await writeSkill(root, "tdd", "Improved");
    await writeSkill(root, "other", "Edited locally");
    await writeFile(join(root, "notes.txt"), "{}\n");

    await adapter.catchUp(root);

    expect(await snapshot()).toEqual({
      head: await upstream(),
      status: " M .apm/skills/other/SKILL.md\n?? notes.txt\n",
    });
    await expect(readFile(skillFile(root, "other"), "utf8")).resolves.toContain(
      "Edited locally",
    );
    await expect(adapter.readCloneSync(root)).resolves.toBe("current");
  });

  it("leaves a change that differs from upstream exactly as it was", async () => {
    await landUpstream(() => writeSkill(teammate, "tdd", "Improved"));
    await writeSkill(root, "tdd", "Edited locally");
    const before = await snapshot();

    await adapter.catchUp(root);

    expect(await snapshot()).toEqual(before);
    await expect(readFile(skillFile(root, "tdd"), "utf8")).resolves.toContain(
      "Edited locally",
    );
    await expect(adapter.readCloneSync(root)).resolves.toBe("local-changes");
  });

  it("leaves a mix of landed and differing changes exactly as it was", async () => {
    await landUpstream(async () => {
      await writeSkill(teammate, "tdd", "Improved");
      await writeSkill(teammate, "review", "New skill");
    });
    await writeSkill(root, "tdd", "Improved");
    await writeSkill(root, "review", "Different locally");
    const before = await snapshot();

    await adapter.catchUp(root);

    expect(await snapshot()).toEqual(before);
    await expect(adapter.readCloneSync(root)).resolves.toBe("local-changes");
  });

  it("keeps a staged change whose working copy already matches upstream", async () => {
    await landUpstream(() => writeSkill(teammate, "tdd", "Improved"));
    await writeSkill(root, "tdd", "Staged locally");
    await git(root, "add", "-A");
    await writeSkill(root, "tdd", "Improved");
    const before = await snapshot();

    await adapter.catchUp(root);

    expect(await snapshot()).toEqual(before);
    await expect(
      git(root, "show", ":.apm/skills/tdd/SKILL.md"),
    ).resolves.toContain("Staged locally");
    await expect(adapter.readCloneSync(root)).resolves.toBe("local-changes");
  });

  it("stages nothing when git refuses the fast-forward", async () => {
    await landUpstream(async () => {
      await writeSkill(teammate, "tdd", "Improved");
      await writeFile(join(teammate, "notes"), "upstream file\n");
    });
    await writeSkill(root, "tdd", "Improved");
    // An untracked folder where upstream adds a file blocks the merge.
    await mkdir(join(root, "notes"));
    await writeFile(join(root, "notes", "draft.md"), "local\n");
    const before = await snapshot();

    await adapter.catchUp(root);

    expect(await snapshot()).toEqual(before);
    await expect(adapter.readCloneSync(root)).resolves.toBe("behind");
  });

  it("keeps an ignored local file that upstream starts tracking", async () => {
    await writeFile(join(root, ".git", "info", "exclude"), ".env\n");
    await writeFile(join(root, ".env"), "my-secret\n");
    await landUpstream(() => writeFile(join(teammate, ".env"), "shared\n"));
    const before = await snapshot();

    await adapter.catchUp(root);

    expect(await snapshot()).toEqual(before);
    await expect(readFile(join(root, ".env"), "utf8")).resolves.toBe(
      "my-secret\n",
    );
    await expect(adapter.readCloneSync(root)).resolves.toBe("local-changes");
  });

  it("leaves a local change with no upstream movement alone", async () => {
    await writeSkill(root, "tdd", "Edited locally");
    const before = await snapshot();

    await adapter.catchUp(root);

    expect(await snapshot()).toEqual(before);
    await expect(adapter.readCloneSync(root)).resolves.toBe("current");
  });

  it("never rewrites a local commit when the clone has diverged", async () => {
    await landUpstream(() => writeSkill(teammate, "tdd", "Improved"));
    await writeSkill(root, "tdd", "Committed locally");
    await git(root, "commit", "-am", "local commit");
    const before = await snapshot();

    await adapter.catchUp(root);

    expect(await snapshot()).toEqual(before);
    await expect(adapter.readCloneSync(root)).resolves.toBe("diverged");
  });

  it("reads a local commit ahead of upstream as current", async () => {
    await writeSkill(root, "tdd", "Committed locally");
    await git(root, "commit", "-am", "local commit");

    await expect(adapter.readCloneSync(root)).resolves.toBe("current");
  });

  it("reads a branch without upstream as no-upstream and leaves it alone", async () => {
    await git(root, "checkout", "-b", "local-only");
    const before = await snapshot();

    await adapter.catchUp(root);

    expect(await snapshot()).toEqual(before);
    await expect(adapter.readCloneSync(root)).resolves.toBe("no-upstream");
  });

  it("reads a folder git cannot answer for as unreadable", async () => {
    const missing = join(root, "not-a-clone");

    await expect(adapter.readCloneSync(missing)).resolves.toBe("unreadable");
    await expect(adapter.catchUp(missing)).resolves.toBeUndefined();
  });
});
