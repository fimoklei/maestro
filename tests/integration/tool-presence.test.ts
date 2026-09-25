// Against a sandbox HOME, never the real one. The signals are the tools' own
// config files (#127); a skills directory a deploy creates is not one.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ToolPresenceAdapter } from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("ToolPresenceAdapter", () => {
  let home: string;

  const adapter = () => new ToolPresenceAdapter({ homeRoot: () => home });

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
    const liveAdapter = new ToolPresenceAdapter();
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
});
