import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ChooseFolder,
  type FolderChooserPort,
  type HelperOutcome,
  InFlightLocks,
  InventoryReader,
  MacosFolderChooser,
  NodeFileSystem,
  type RunHelper,
  runHelper,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { realRegistry } from "../helpers/real-registry";
import { stubConnect } from "../helpers/stub-connect";
import { stubDeploy, stubRetryOperation } from "../helpers/stub-deploy";
import { stubDeployState } from "../helpers/stub-deploy-state";
import { stubDrift } from "../helpers/stub-drift";
import { stubHarness } from "../helpers/stub-harness";
import { stubImport } from "../helpers/stub-import";
import { stubPromotes } from "../helpers/stub-promote";
import { stubPublish } from "../helpers/stub-publish";
import { stubRemove } from "../helpers/stub-remove";
import { stubScaffold } from "../helpers/stub-scaffold";
import { stubUpdate } from "../helpers/stub-update";

// The system folder chooser's route (ADR-0032), driven with controlled process
// outcomes: the helper is a fake runner, so no real chooser ever opens. The
// returned path is checked against a real sandbox disk.
describe("folder chooser HTTP route", () => {
  let home: string;

  beforeEach(async () => {
    home = await realpath(await mkdtemp(join(tmpdir(), "maestro-chooser-")));
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  type Call = {
    file: string;
    args: string[];
    env: NodeJS.ProcessEnv;
    timeout: number;
  };

  // Answers every run with `outcome`, recording what it was asked to start.
  function fakeRunner(outcome: Partial<HelperOutcome>) {
    const calls: Call[] = [];
    const run: RunHelper = async (file, args, options) => {
      calls.push({ file, args, env: options.env, timeout: options.timeout });
      return { exitCode: 0, killed: false, stdout: "", stderr: "", ...outcome };
    };
    return { run, calls };
  }

  function macos(run: RunHelper, present = true): FolderChooserPort {
    return new MacosFolderChooser({ run, helperExists: async () => present });
  }

  function makeApp(chooser: FolderChooserPort | null) {
    const fs = new NodeFileSystem();
    const registry = realRegistry(fs, join(home, "config.json"));
    const inventory = new InventoryReader({
      fs,
      resolvePath: () => undefined,
      readReleasedSkills: async () => [],
    });
    const locks = new InFlightLocks();
    return createApp({
      importSkill: stubImport(),
      registry,
      inventory,
      harness: stubHarness(),
      publish: stubPublish(),
      ...stubPromotes(),
      connect: stubConnect(),
      scaffold: stubScaffold(),
      deployState: stubDeployState({ fs }),
      deploy: stubDeploy({ inventory, registry, locks }),
      remove: stubRemove({ registry, locks }),
      retryOperation: stubRetryOperation({ registry, locks }),
      drift: stubDrift({ registry }),
      resolveGlobalRoot: () => "/nonexistent-apm-root",
      folderChooser: new ChooseFolder({ chooser, fs, homeRoot: () => home }),
      update: stubUpdate(),
      enforceOriginHost: false,
    });
  }

  function choose(app: ReturnType<typeof makeApp>, path: string) {
    return app.request("/api/folder-chooser", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
  }

  async function available(app: ReturnType<typeof makeApp>) {
    const res = await app.request("/api/folder-chooser");
    expect(res.status).toBe(200);
    return ((await res.json()) as { available: boolean }).available;
  }

  it("reports a chooser where the helper is present", async () => {
    expect(await available(makeApp(macos(fakeRunner({}).run)))).toBe(true);
  });

  it("reports no chooser where the helper is missing, and refuses to open one", async () => {
    const { run, calls } = fakeRunner({});
    const app = makeApp(macos(run, false));

    expect(await available(app)).toBe(false);
    const res = await choose(app, home);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "chooser-unavailable" });
    expect(calls).toEqual([]);
  });

  it("reports no chooser on a platform without a helper", async () => {
    const app = makeApp(null);

    expect(await available(app)).toBe(false);
    expect((await choose(app, home)).status).toBe(409);
  });

  it("returns the picked folder, validated like a typed path", async () => {
    const picked = join(home, "Work");
    await mkdir(picked);
    const { run, calls } = fakeRunner({ stdout: `${picked}/\n` });

    const res = await choose(makeApp(macos(run)), home);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ path: picked });
    expect(calls).toHaveLength(1);
  });

  it("starts the helper by absolute path with a constant script and the start folder as data", async () => {
    const start = join(home, `it's "quoted"`);
    await mkdir(start);
    const first = fakeRunner({});
    const second = fakeRunner({});

    await choose(makeApp(macos(first.run)), start);
    await choose(makeApp(macos(second.run)), home);

    const [call] = first.calls;
    expect(call?.file).toBe("/usr/bin/osascript");
    expect(call?.args).toHaveLength(3);
    expect(call?.args[0]).toBe("-e");
    expect(call?.args[2]).toBe(start);
    expect(call?.args[1]).not.toContain("quoted");
    // The same script whatever the start folder: nothing typed becomes code.
    expect(second.calls[0]?.args[1]).toBe(call?.args[1]);
    // Closed after 5 minutes.
    expect(call?.timeout).toBe(5 * 60 * 1000);
  });

  it("opens on the home folder when the start folder does not exist", async () => {
    const { run, calls } = fakeRunner({});

    await choose(makeApp(macos(run)), join(home, "gone"));
    await choose(makeApp(macos(run)), "relative/path");

    expect(calls.map((call) => call.args[2])).toEqual([home, home]);
  });

  it("reads a cancelled chooser as nothing picked", async () => {
    const { run } = fakeRunner({
      exitCode: 1,
      stderr: "0:98: execution error: User canceled. (-128)\n",
    });

    const res = await choose(makeApp(macos(run)), home);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ path: null });
  });

  it("reads a chooser closed after the time limit as nothing picked", async () => {
    const { run } = fakeRunner({ exitCode: null, killed: true });

    const res = await choose(makeApp(macos(run)), home);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ path: null });
  });

  it.each([
    ["a relative path", "Work/\n"],
    ["a folder that does not exist", "/nonexistent-maestro-folder/\n"],
    ["more than one line", "/tmp/\n/etc/\n"],
    ["nothing at all", ""],
  ])("refuses a returned path that fails validation: %s", async (_, stdout) => {
    const { run } = fakeRunner({ stdout });

    const res = await choose(makeApp(macos(run)), home);

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "chooser-failed" });
  });

  it("refuses a file as the returned path", async () => {
    await writeFile(join(home, "notes.txt"), "x");
    const { run } = fakeRunner({ stdout: `${join(home, "notes.txt")}\n` });

    const res = await choose(makeApp(macos(run)), home);

    expect(res.status).toBe(502);
  });

  it("states any other helper failure from its own table, never the helper's words", async () => {
    const { run } = fakeRunner({
      exitCode: 1,
      stderr: "execution error: secret-token-text (-1700)\n",
    });

    const res = await choose(makeApp(macos(run)), home);

    expect(res.status).toBe(502);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: "chooser-failed" });
    expect(text).not.toContain("secret-token-text");
  });

  it("opens one chooser at a time", async () => {
    // Each run stays open until the test releases it.
    const releases: ((outcome: HelperOutcome) => void)[] = [];
    let started: () => void = () => {};
    const run: RunHelper = () =>
      new Promise((resolve) => {
        releases.push(resolve);
        started();
      });
    const opened = () =>
      new Promise<void>((resolve) => {
        started = resolve;
      });
    const cancel = { exitCode: 1, killed: false, stdout: "", stderr: "(-128)" };
    const app = makeApp(macos(run));

    const firstOpen = opened();
    const first = choose(app, home);
    await firstOpen;
    const second = await choose(app, home);
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: "chooser-busy" });

    releases[0]?.(cancel);
    expect((await first).status).toBe(200);

    // Free again once the first one closed.
    const thirdOpen = opened();
    const third = choose(app, home);
    await thirdOpen;
    releases[1]?.(cancel);
    expect((await third).status).toBe(200);
    expect(releases).toHaveLength(2);
  });

  // The one real process in this file: how the runner reports each way a
  // helper can end, without opening a chooser.
  describe("the helper runner", () => {
    const node = process.execPath;
    const opts = { env: process.env, timeout: 10_000 };

    it("reports the exit code and output", async () => {
      const outcome = await runHelper(
        node,
        ["-e", "process.stdout.write('/picked'); process.exit(3)"],
        opts,
      );
      expect(outcome).toMatchObject({
        exitCode: 3,
        killed: false,
        stdout: "/picked",
      });
    });

    it("kills a helper at the time limit", async () => {
      const outcome = await runHelper(
        node,
        ["-e", "setTimeout(() => {}, 60000)"],
        {
          ...opts,
          timeout: 200,
        },
      );
      expect(outcome.killed).toBe(true);
    });

    it("reports a missing program without an exit code", async () => {
      const outcome = await runHelper("/nonexistent-maestro-helper", [], opts);
      expect(outcome).toMatchObject({ exitCode: null, killed: false });
    });
  });
});
