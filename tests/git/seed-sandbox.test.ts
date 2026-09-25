import { ok } from "node:assert";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seededPaths, seedSandbox } from "../../scripts/seed-sandbox.mjs";

// The folder chooser opens on the sandbox HOME, so everything is seeded under it.
describe("smoke sandbox seeding", () => {
  let root: string;
  let home: string;
  let inventorySource: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "maestro-seed-"));
    home = join(root, "home");
    inventorySource = join(root, "source-clone");
    execFileSync("git", ["init", inventorySource], { stdio: "ignore" });
    await writeFile(join(inventorySource, "README.md"), "# source\n");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("places every seeded directory under the sandbox home", () => {
    const seeded = seedSandbox({ home, inventorySource });

    ok(seeded.inventory);
    for (const path of [seeded.inventory, ...seeded.candidates]) {
      expect(path.startsWith(home + sep)).toBe(true);
      expect(existsSync(path)).toBe(true);
    }
  });

  it("copies the inventory source with its git directory intact", () => {
    const { inventory } = seedSandbox({ home, inventorySource });
    ok(inventory);

    // Connect refuses a clone without a parseable GitHub origin, which lives in .git.
    expect(existsSync(join(inventory, ".git"))).toBe(true);
    expect(existsSync(join(inventory, "README.md"))).toBe(true);
  });

  it("warns and keeps seeding when the inventory source is absent", () => {
    // An unauthenticated gh leaves the auth-free rehearsal usable.
    const seeded = seedSandbox({
      home,
      inventorySource: join(root, "no-such-clone"),
    });

    expect(seeded.inventory).toBeNull();
    expect(seeded.warnings).toHaveLength(1);
    expect(seeded.candidates.length).toBeGreaterThan(0);
  });

  it("warns when the inventory source is not a clone", async () => {
    const notAClone = join(root, "plain-tree");
    await mkdir(notAClone);

    const seeded = seedSandbox({ home, inventorySource: notAClone });

    expect(seeded.inventory).toBeNull();
    expect(seeded.warnings).toHaveLength(1);
  });

  it("seeds git repos, a plain directory and a name with a space", () => {
    const { candidates } = seedSandbox({ home, inventorySource });

    const gitRepos = candidates.filter((path) =>
      existsSync(join(path, ".git")),
    );
    expect(gitRepos.length).toBeGreaterThanOrEqual(2);
    expect(candidates.length).toBeGreaterThan(gitRepos.length);
    expect(candidates.some((path) => path.includes(" "))).toBe(true);
  });

  // Redirecting HOME hides the real ~/.gitconfig and its credential helper,
  // so every fetch of the seeded clone would fail auth.
  it("gives git a github credential under the sandbox home", () => {
    seedSandbox({ home, inventorySource, githubToken: "smoke-token" });

    const filled = execFileSync("git", ["credential", "fill"], {
      input: "protocol=https\nhost=github.com\n\n",
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: home,
        XDG_CONFIG_HOME: join(home, ".config"),
        GIT_TERMINAL_PROMPT: "0",
      },
    });

    expect(filled).toContain("password=smoke-token");
  });

  it("leaves the sandbox with no credential helper but its own", () => {
    // A system-wide helper (macOS osxkeychain) would also be asked to store
    // the credential, and prompt the user under this HOME.
    seedSandbox({ home, inventorySource, githubToken: "smoke-token" });

    // `git config --get-all` still lists a reset helper; which one runs is the question.
    const run = spawnSync("git", ["credential", "fill"], {
      input: "protocol=https\nhost=github.com\n\n",
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: home,
        XDG_CONFIG_HOME: join(home, ".config"),
        GIT_TERMINAL_PROMPT: "0",
        GIT_TRACE: "1",
      },
    });
    const invoked = [
      ...new Set(
        [...run.stderr.matchAll(/credential-([a-z]+)/g)].map(
          ([, helper]) => helper,
        ),
      ),
    ];

    expect(invoked).toEqual(["store"]);
  });

  it("writes no credential file when no token was bridged", () => {
    seedSandbox({ home, inventorySource });

    expect(existsSync(join(home, ".git-credentials"))).toBe(false);
  });

  // Asks the seeding for its paths, so a rename cannot split the two halves.
  it("names the seeded paths the readiness step needs", () => {
    const seeded = seedSandbox({ home, inventorySource });
    const paths = seededPaths(home);

    expect(paths.inventory).toBe(seeded.inventory);
    expect(seeded.candidates).toContain(paths.firstRepo);
    expect(existsSync(paths.firstRepo)).toBe(true);
  });
});
