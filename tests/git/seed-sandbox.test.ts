import { ok } from "node:assert";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seededPaths, seedSandbox } from "../../scripts/seed-sandbox.mjs";

// The smoke rehearsal browses from the sandbox HOME down (ADR-0009's ceiling is
// os.homedir()). Anything seeded beside HOME is unreachable through the picker,
// which is the defect ADR-0010's #168 amendment fixes.
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

    // Connect refuses a clone without a parseable GitHub origin (ADR-0014), and
    // the origin lives in .git — a copy without it is unusable.
    expect(existsSync(join(inventory, ".git"))).toBe(true);
    expect(existsSync(join(inventory, "README.md"))).toBe(true);
  });

  it("warns and keeps seeding when the inventory source is absent", () => {
    // Same posture the harness already takes for an unauthenticated gh: the
    // auth-free part of the rehearsal stays usable (ADR-0010).
    const seeded = seedSandbox({
      home,
      inventorySource: join(root, "no-such-clone"),
    });

    expect(seeded.inventory).toBeNull();
    expect(seeded.warnings).toHaveLength(1);
    expect(seeded.candidates.length).toBeGreaterThan(0);
  });

  it("warns when the inventory source is not a clone", async () => {
    // A tree without .git carries no origin, so connect would fail with
    // no-usable-origin at the screen. The harness says so at launch instead.
    const notAClone = join(root, "plain-tree");
    await mkdir(notAClone);

    const seeded = seedSandbox({ home, inventorySource: notAClone });

    expect(seeded.inventory).toBeNull();
    expect(seeded.warnings).toHaveLength(1);
  });

  it("seeds candidates the picker can tell apart", () => {
    const { candidates } = seedSandbox({ home, inventorySource });

    const gitRepos = candidates.filter((path) =>
      existsSync(join(path, ".git")),
    );
    expect(gitRepos.length).toBeGreaterThanOrEqual(2);
    expect(candidates.length).toBeGreaterThan(gitRepos.length);
    expect(candidates.some((path) => path.includes(" "))).toBe(true);
  });

  // Redirecting HOME hides the real ~/.gitconfig, so git loses the credential
  // helper it would normally use and every fetch of the seeded clone fails
  // auth — read back as "Read failed" on the harness strip.
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
    // Helpers accumulate, and a git install can configure one system-wide
    // (macOS ships osxkeychain). Left in place it also gets asked to *store*
    // the credential, and under a HOME with no keychain that prompts the user.
    seedSandbox({ home, inventorySource, githubToken: "smoke-token" });

    // Which helper *runs* is the question; `git config --get-all` still lists
    // a reset one, because the reset is applied by the credential machinery.
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
    // Same posture as the rest of seeding: an unauthenticated gh degrades the
    // rehearsal, it never fabricates a credential.
    seedSandbox({ home, inventorySource });

    expect(existsSync(join(home, ".git-credentials"))).toBe(false);
  });

  // The readiness step (scripts/smoke-ready.mjs) needs the paths this seeding
  // creates. It asks for them here rather than restating the directory names,
  // so a rename cannot leave the two halves pointing at different places.
  it("names the seeded paths the readiness step needs", () => {
    const seeded = seedSandbox({ home, inventorySource });
    const paths = seededPaths(home);

    expect(paths.inventory).toBe(seeded.inventory);
    expect(seeded.candidates).toContain(paths.firstRepo);
    expect(existsSync(paths.firstRepo)).toBe(true);
  });
});
