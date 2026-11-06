import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ToolPresenceAdapter } from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nodeApp } from "../helpers/node-app";

// The server resolves the user-scope location itself, so the route takes
// no query. Lockfile root and tool presence point at a sandbox HOME.
const SINGLE_TOOL_LOCKFILE = readFileSync(
  new URL("../fixtures/apm.lock.global-single-tool.yaml", import.meta.url),
  "utf8",
);
const TWO_TOOL_LOCKFILE = readFileSync(
  new URL("../fixtures/apm.lock.global-two-tool.yaml", import.meta.url),
  "utf8",
);

const TDD = { type: "skill", name: "tdd", version: "v0.5.1" };
const claudeFolder = (primitives: unknown[], detected = true) => ({
  path: "~/.claude/skills",
  tool: "claude",
  detected,
  primitives,
});
const agentsFolder = (primitives: unknown[], detected = true) => ({
  path: "~/.agents/skills",
  tool: "codex",
  detected,
  primitives,
});

describe("global deploy-state HTTP route (one target with its folders)", () => {
  let home: string;
  let apmRoot: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "maestro-global-"));
    apmRoot = join(home, ".apm");
    await mkdir(apmRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  async function installClaude() {
    await writeFile(join(home, ".claude.json"), "{}", "utf8");
  }
  async function installCodex() {
    await mkdir(join(home, ".codex"), { recursive: true });
    await writeFile(join(home, ".codex", "config.toml"), "", "utf8");
  }

  // Tool presence is read from the sandbox HOME, as installClaude/installCodex left it.
  function makeApp() {
    return nodeApp(
      { HOME: home, MAESTRO_HOME: home },
      { toolPresence: new ToolPresenceAdapter({ homeRoot: () => home }) },
    );
  }

  it("reads a single-tool install as one target, the other folder not written", async () => {
    await installClaude();
    await writeFile(
      join(apmRoot, "apm.lock.yaml"),
      SINGLE_TOOL_LOCKFILE,
      "utf8",
    );

    const res = await makeApp().request("/api/deploy-state/global");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      primitives: [TDD],
      folders: [claudeFolder([TDD]), agentsFolder([], false)],
      skipped: [],
      otherOrigins: [],
    });
  });

  it("lists a two-tool install's skill once, with a copy in each folder", async () => {
    await installClaude();
    await installCodex();
    await writeFile(join(apmRoot, "apm.lock.yaml"), TWO_TOOL_LOCKFILE, "utf8");

    const res = await makeApp().request("/api/deploy-state/global");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      primitives: [TDD],
      folders: [claudeFolder([TDD]), agentsFolder([TDD])],
      skipped: [],
      otherOrigins: [],
    });
  });

  it("names the skills a detected tool's folder with nothing deployed lacks", async () => {
    await installClaude();
    await installCodex();
    await writeFile(
      join(apmRoot, "apm.lock.yaml"),
      SINGLE_TOOL_LOCKFILE,
      "utf8",
    );

    const res = await makeApp().request("/api/deploy-state/global");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      primitives: [TDD],
      folders: [
        claudeFolder([TDD]),
        { ...agentsFolder([]), missing: [TDD.name] },
      ],
      skipped: [],
      otherOrigins: [],
    });
  });

  it("reads an empty target when nothing is deployed globally", async () => {
    // No global lockfile: an empty target, not an error.
    await installClaude();

    const res = await makeApp().request("/api/deploy-state/global");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      primitives: [],
      folders: [claudeFolder([]), agentsFolder([], false)],
      skipped: [],
      otherOrigins: [],
    });
  });

  it("names the origin of a foreign lockfile entry instead of calling the target empty (#655)", async () => {
    // A pre-attribution install: deployed_files no detected tool's prefix covers.
    await installClaude();
    await writeFile(
      join(apmRoot, "apm.lock.yaml"),
      [
        "lockfile_version: '1'",
        "apm_version: 0.16.0",
        "dependencies:",
        "- repo_url: fimoklei/agent-harness",
        "  host: github.com",
        "  resolved_ref: v0.5.1",
        "  virtual_path: skills/tdd",
        "  package_type: claude_skill",
        "  deployed_files:",
        "  - skills/tdd",
        "",
      ].join("\n"),
      "utf8",
    );

    const res = await makeApp().request("/api/deploy-state/global");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      primitives: [],
      folders: [claudeFolder([]), agentsFolder([], false)],
      skipped: [],
      otherOrigins: ["fimoklei/agent-harness"],
    });
  });

  it("surfaces a visible error for a malformed global lockfile", async () => {
    await installClaude();
    await writeFile(
      join(apmRoot, "apm.lock.yaml"),
      "dependencies: not-a-list\n",
      "utf8",
    );

    const res = await makeApp().request("/api/deploy-state/global");

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("malformed");
  });

  it("takes no client-supplied path: a query cannot redirect the global read", async () => {
    await installClaude();
    await writeFile(
      join(apmRoot, "apm.lock.yaml"),
      SINGLE_TOOL_LOCKFILE,
      "utf8",
    );

    const res = await makeApp().request(
      "/api/deploy-state/global?repo=/etc/passwd&root=/tmp&folder=/etc",
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      primitives: [TDD],
      folders: [claudeFolder([TDD]), agentsFolder([], false)],
      skipped: [],
      otherOrigins: [],
    });
  });
});
