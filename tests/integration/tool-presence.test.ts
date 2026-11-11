// Against a sandbox HOME, never the real one. The signals are the tools' own
// config files (#127); a skills directory a deploy creates is not one.
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeployedLocation, ToolPresenceAdapter } from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lenientRealpath } from "../../packages/core/src/filesystem/lenient-realpath";

describe("ToolPresenceAdapter", () => {
  let home: string;

  const adapterIn = (env: NodeJS.ProcessEnv) =>
    new ToolPresenceAdapter({
      location: new DeployedLocation(env, lenientRealpath),
    });
  const adapter = () => adapterIn({ HOME: home });

  const addClaude = () => writeFile(join(home, ".claude.json"), "{}\n", "utf8");

  const addCodex = async () => {
    await mkdir(join(home, ".codex"), { recursive: true });
    await writeFile(join(home, ".codex", "config.toml"), "", "utf8");
  };

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "maestro-tool-presence-"));
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(home, { recursive: true, force: true });
  });

  it("reads the current HOME on every detection call", async () => {
    await addClaude();
    const otherHome = join(home, "other-home");
    await mkdir(join(otherHome, ".codex"), { recursive: true });
    await writeFile(join(otherHome, ".codex", "config.toml"), "", "utf8");
    vi.stubEnv("HOME", home);
    const liveAdapter = adapterIn(process.env);
    await expect(liveAdapter.detectGlobalTools()).resolves.toEqual(["claude"]);

    vi.stubEnv("HOME", otherHome);
    await expect(liveAdapter.detectGlobalTools()).resolves.toEqual(["codex"]);
  });

  it("detects both tools when both config files exist", async () => {
    await addClaude();
    await addCodex();
    await expect(adapter().detectGlobalTools()).resolves.toEqual([
      "claude",
      "codex",
    ]);
  });

  it("detects only claude on a Claude-only machine", async () => {
    await addClaude();
    await expect(adapter().detectGlobalTools()).resolves.toEqual(["claude"]);
  });

  it("detects only codex on a Codex-only machine", async () => {
    await addCodex();
    await expect(adapter().detectGlobalTools()).resolves.toEqual(["codex"]);
  });

  it("detects nothing on a machine with no supported tool", async () => {
    await expect(adapter().detectGlobalTools()).resolves.toEqual([]);
  });

  it("ignores the skills directories a deploy creates", async () => {
    // A global deploy writes skills directories for each tool; none of them may
    // read back as an installed tool.
    await mkdir(join(home, ".claude", "skills", "tdd"), { recursive: true });
    await mkdir(join(home, ".agents", "skills", "tdd"), { recursive: true });
    await mkdir(join(home, ".codex"), { recursive: true });
    await expect(adapter().detectGlobalTools()).resolves.toEqual([]);
  });

  it("does not mistake a directory at the marker path for the config file", async () => {
    // A directory is not a config file (isFile, not exists).
    await mkdir(join(home, ".claude.json"), { recursive: true });
    await expect(adapter().detectGlobalTools()).resolves.toEqual([]);
  });

  describe("with CLAUDE_CONFIG_DIR set (#1796)", () => {
    const moved = () =>
      adapterIn({ HOME: home, CLAUDE_CONFIG_DIR: join(home, ".claude-work") });

    it("detects Claude Code by the marker inside the variable's folder", async () => {
      await mkdir(join(home, ".claude-work"), { recursive: true });
      await writeFile(join(home, ".claude-work", ".claude.json"), "{}\n");
      await expect(moved().detectGlobalTools()).resolves.toEqual(["claude"]);
    });

    it("no longer counts the marker in HOME", async () => {
      await addClaude();
      await expect(moved().detectGlobalTools()).resolves.toEqual([]);
    });

    it("finds the marker through a symlinked folder", async () => {
      await mkdir(join(home, "real-claude"), { recursive: true });
      await writeFile(join(home, "real-claude", ".claude.json"), "{}\n");
      await symlink(join(home, "real-claude"), join(home, "linked-claude"));
      await expect(
        adapterIn({
          HOME: home,
          CLAUDE_CONFIG_DIR: join(home, "linked-claude"),
        }).detectGlobalTools(),
      ).resolves.toEqual(["claude"]);
    });
  });
});
