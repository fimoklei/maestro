import { describe, expect, it } from "vitest";
import { ConfigStore } from "../registry/config-store";
import { InMemoryFileSystem } from "../registry/file-system.fake";
import type { CloneOutcome, CloneRepositoryPort } from "./clone-repository";
import { ConnectInventory } from "./connect-inventory";
import type { HeadProbe } from "./head-commit";
import { ScaffoldOffers } from "./scaffold-offers";

const CONFIG_PATH = "/home/me/.maestro/config.json";
const PARSEABLE_ORIGIN = "git@github.com:fimoklei/agent-harness.git";
const HOME_ROOT = "/Users/me";

// Records what it was asked to clone and seeds the destination the way git
// would: the Harness the URL points at, already on disk.
class FakeClone {
  readonly calls: { url: string; destination: string }[] = [];
  constructor(
    private readonly fs: InMemoryFileSystem,
    private readonly outcome: CloneOutcome = "cloned",
  ) {}
  async clone(url: string, destination: string): Promise<CloneOutcome> {
    this.calls.push({ url, destination });
    if (this.outcome === "cloned") {
      await this.fs.ensureDir(destination);
      await this.fs.writeFile(`${destination}/apm.yml`, "dependencies: []\n");
    }
    return this.outcome;
  }
}

function makeConnect(
  fs: InMemoryFileSystem,
  originUrl: string | null = PARSEABLE_ORIGIN,
  defaultBranch: string | null = "main",
  clone: CloneRepositoryPort = new FakeClone(fs),
  head: HeadProbe = "commit",
  homeRoot: string = HOME_ROOT,
  offers: ScaffoldOffers = new ScaffoldOffers(),
): ConnectInventory {
  return new ConnectInventory({
    fs,
    store: new ConfigStore({ fs, configPath: () => CONFIG_PATH }),
    originUrl: async () => originUrl,
    defaultBranch: async () => defaultBranch,
    isRepositoryRoot: async () => true,
    probeHead: async () => head,
    homeRoot: () => homeRoot,
    offers,
    clone,
  });
}

// A Harness is recognised by its apm.yml manifest — never by a skills/ dir.
function harnessSeed() {
  return {
    directories: { "/Users/me/agent-harness": "/Users/me/agent-harness" },
    files: { "/Users/me/agent-harness/apm.yml": "dependencies: []\n" },
  };
}

describe("ConnectInventory", () => {
  it("persists inventoryPath for a clone carrying an apm.yml manifest", async () => {
    const fs = new InMemoryFileSystem(harnessSeed());
    const connect = makeConnect(fs);

    const result = await connect.connect("/Users/me/agent-harness");

    expect(result).toEqual({
      ok: true,
      outcome: "found",
      inventoryPath: "/Users/me/agent-harness",
    });
    const stored = await new ConfigStore({
      fs,
      configPath: () => CONFIG_PATH,
    }).read();
    expect(stored.inventoryPath).toBe("/Users/me/agent-harness");
  });

  it("rejects a directory without an apm.yml manifest and persists nothing", async () => {
    const fs = new InMemoryFileSystem({
      directories: { "/Users/me/not-harness": "/Users/me/not-harness" },
    });
    // No origin, so no repository truth to offer a scaffold against (#556).
    const connect = makeConnect(fs, null);

    const result = await connect.connect("/Users/me/not-harness");

    expect(result).toEqual({ ok: false, error: "not-an-inventory" });
    const stored = await new ConfigStore({
      fs,
      configPath: () => CONFIG_PATH,
    }).read();
    expect(stored.inventoryPath).toBeUndefined();
  });

  it("rejects a directory named apm.yml, which manifests nothing", async () => {
    const fs = new InMemoryFileSystem({
      directories: {
        "/Users/me/odd": "/Users/me/odd",
        "/Users/me/odd/apm.yml": "/Users/me/odd/apm.yml",
      },
    });

    // A GitHub repository, so the offer stands; the scaffold's own guard is
    // what refuses the occupied name, and it can name the path (#556).
    await expect(makeConnect(fs).connect("/Users/me/odd")).resolves.toEqual({
      ok: false,
      error: "scaffoldable",
      scaffoldPath: "/Users/me/odd",
    });
  });

  // The offer is the scaffold's only authority to write into the repository,
  // so a refusal that does not make one leaves it unscaffoldable (#556).
  it("records the offer it hands out, and records nothing when it refuses", async () => {
    const offers = new ScaffoldOffers();
    const offered = new InMemoryFileSystem({
      directories: { "/Users/me/empty": "/Users/me/empty" },
    });
    await makeConnect(
      offered,
      PARSEABLE_ORIGIN,
      "main",
      new FakeClone(offered),
      "commit",
      HOME_ROOT,
      offers,
    ).connect("/Users/me/empty");
    expect(offers.holds("/Users/me/empty")).toBe(true);

    const refused = new InMemoryFileSystem({
      directories: { "/Users/me/plain": "/Users/me/plain" },
    });
    await makeConnect(
      refused,
      null,
      "main",
      new FakeClone(refused),
      "commit",
      HOME_ROOT,
      offers,
    ).connect("/Users/me/plain");
    expect(offers.holds("/Users/me/plain")).toBe(false);
  });

  it("rejects the retired root skills/ shape, which is no longer a fallback", async () => {
    const fs = new InMemoryFileSystem({
      directories: {
        "/Users/me/old-harness": "/Users/me/old-harness",
        "/Users/me/old-harness/skills": "/Users/me/old-harness/skills",
      },
    });

    await expect(
      makeConnect(fs).connect("/Users/me/old-harness"),
    ).resolves.toEqual({
      ok: false,
      error: "scaffoldable",
      scaffoldPath: "/Users/me/old-harness",
    });
  });

  it("offers the scaffold for a GitHub repository that has no apm.yml", async () => {
    const fs = new InMemoryFileSystem({
      directories: { "/Users/me/empty-repo": "/Users/me/empty-repo" },
    });

    const result = await makeConnect(fs).connect("/Users/me/empty-repo");

    expect(result).toEqual({
      ok: false,
      error: "scaffoldable",
      scaffoldPath: "/Users/me/empty-repo",
    });
    // Nothing is connected by an offer — the user has not accepted it yet.
    const stored = await new ConfigStore({
      fs,
      configPath: () => CONFIG_PATH,
    }).read();
    expect(stored.inventoryPath).toBeUndefined();
  });

  // The origin url is answered by the enclosing repository, so a subdirectory
  // reads as a GitHub clone. Offering to scaffold one would aim the write and
  // the push at a repository the user never pointed at.
  it("never offers the scaffold for a subdirectory of a repository", async () => {
    const fs = new InMemoryFileSystem({
      directories: { "/Users/me/repo/docs": "/Users/me/repo/docs" },
    });
    const connect = new ConnectInventory({
      fs,
      store: new ConfigStore({ fs, configPath: () => CONFIG_PATH }),
      originUrl: async () => PARSEABLE_ORIGIN,
      defaultBranch: async () => "main",
      isRepositoryRoot: async () => false,
      probeHead: async () => "commit",
      homeRoot: () => HOME_ROOT,
      clone: new FakeClone(fs),
      offers: new ScaffoldOffers(),
    });

    await expect(connect.connect("/Users/me/repo/docs")).resolves.toEqual({
      ok: false,
      error: "not-an-inventory",
    });
  });

  it("never offers the scaffold for a repository whose origin is not GitHub", async () => {
    const fs = new InMemoryFileSystem({
      directories: { "/Users/me/mirror": "/Users/me/mirror" },
    });

    await expect(
      makeConnect(fs, "https://gitlab.com/o/r.git").connect("/Users/me/mirror"),
    ).resolves.toEqual({ ok: false, error: "not-an-inventory" });
  });

  it("rejects a clone without an origin remote as no-usable-origin and persists nothing", async () => {
    const fs = new InMemoryFileSystem(harnessSeed());
    const connect = makeConnect(fs, null);

    const result = await connect.connect("/Users/me/agent-harness");

    expect(result).toEqual({ ok: false, error: "no-usable-origin" });
    const stored = await new ConfigStore({
      fs,
      configPath: () => CONFIG_PATH,
    }).read();
    expect(stored.inventoryPath).toBeUndefined();
  });

  it("rejects a clone whose origin is unparseable as no-usable-origin", async () => {
    const fs = new InMemoryFileSystem(harnessSeed());
    const connect = makeConnect(fs, "/Users/me/some-local-mirror");

    await expect(connect.connect("/Users/me/agent-harness")).resolves.toEqual({
      ok: false,
      error: "no-usable-origin",
    });
  });

  it("connects a Harness whose default branch is not named main", async () => {
    const fs = new InMemoryFileSystem(harnessSeed());
    const connect = makeConnect(fs, PARSEABLE_ORIGIN, "trunk");

    await expect(connect.connect("/Users/me/agent-harness")).resolves.toEqual({
      ok: true,
      outcome: "found",
      inventoryPath: "/Users/me/agent-harness",
    });
  });

  it("rejects a clone whose default branch cannot be established and persists nothing", async () => {
    const fs = new InMemoryFileSystem(harnessSeed());
    const connect = makeConnect(fs, PARSEABLE_ORIGIN, null);

    const result = await connect.connect("/Users/me/agent-harness");

    expect(result).toEqual({ ok: false, error: "no-default-branch" });
    const stored = await new ConfigStore({
      fs,
      configPath: () => CONFIG_PATH,
    }).read();
    expect(stored.inventoryPath).toBeUndefined();
  });

  it("clones a GitHub url into a new folder under the home ceiling and joins it", async () => {
    const fs = new InMemoryFileSystem();
    const clone = new FakeClone(fs);
    const connect = makeConnect(fs, PARSEABLE_ORIGIN, "main", clone);

    const result = await connect.connect(
      "https://github.com/fimoklei/agent-harness.git",
    );

    expect(result).toEqual({
      ok: true,
      outcome: "joined",
      inventoryPath: "/Users/me/agent-harness",
    });
    expect(clone.calls).toEqual([
      {
        url: "https://github.com/fimoklei/agent-harness.git",
        destination: "/Users/me/agent-harness",
      },
    ]);
  });

  it("refuses a non-GitHub remote url without cloning anything", async () => {
    const fs = new InMemoryFileSystem();
    const clone = new FakeClone(fs);
    const connect = makeConnect(fs, PARSEABLE_ORIGIN, "main", clone);

    const result = await connect.connect("https://gitlab.com/o/r.git");

    expect(result).toEqual({ ok: false, error: "not-a-github-url" });
    expect(clone.calls).toEqual([]);
  });

  it("refuses every remote address when asked for a local clone only, cloning nothing", async () => {
    // Setting the Harness location never clones (#995).
    const fs = new InMemoryFileSystem();
    const clone = new FakeClone(fs);
    const connect = makeConnect(fs, PARSEABLE_ORIGIN, "main", clone);

    for (const url of [
      "https://github.com/fimoklei/agent-harness.git",
      "git@github.com:fimoklei/agent-harness.git",
      "https://gitlab.com/o/r.git",
    ]) {
      expect(await connect.connect(url, { localOnly: true })).toEqual({
        ok: false,
        error: "not-a-folder-path",
      });
    }
    expect(clone.calls).toEqual([]);
  });

  it("reports a clone refused for credentials and persists nothing", async () => {
    const fs = new InMemoryFileSystem();
    const connect = makeConnect(
      fs,
      PARSEABLE_ORIGIN,
      "main",
      new FakeClone(fs, "clone-auth-failed"),
    );

    const result = await connect.connect("https://github.com/o/r.git");

    expect(result).toEqual({ ok: false, error: "clone-auth-failed" });
    const stored = await new ConfigStore({
      fs,
      configPath: () => CONFIG_PATH,
    }).read();
    expect(stored.inventoryPath).toBeUndefined();
  });

  it("reports a repository GitHub will not hand over as unavailable", async () => {
    const fs = new InMemoryFileSystem();
    const connect = makeConnect(
      fs,
      PARSEABLE_ORIGIN,
      "main",
      new FakeClone(fs, "clone-unavailable"),
    );

    await expect(
      connect.connect("https://github.com/o/r.git"),
    ).resolves.toEqual({ ok: false, error: "clone-unavailable" });
  });

  describe("choosing where the clone lands", () => {
    const PARENT = "/Users/me/Projects";

    it("clones into the chosen parent under the repository's own name", async () => {
      const fs = new InMemoryFileSystem({
        directories: { [PARENT]: PARENT },
      });
      const clone = new FakeClone(fs);
      const connect = makeConnect(fs, PARSEABLE_ORIGIN, "main", clone);

      const result = await connect.connect(
        "https://github.com/fimoklei/agent-harness.git",
        { parent: PARENT },
      );

      expect(result).toEqual({
        ok: true,
        outcome: "joined",
        inventoryPath: `${PARENT}/agent-harness`,
      });
      expect(clone.calls[0]?.destination).toBe(`${PARENT}/agent-harness`);
    });

    it("refuses a parent that is not an existing directory", async () => {
      const fs = new InMemoryFileSystem();
      const clone = new FakeClone(fs);
      const connect = makeConnect(fs, PARSEABLE_ORIGIN, "main", clone);

      const result = await connect.connect("https://github.com/o/r.git", {
        parent: "/Users/me/nowhere",
      });

      expect(result).toEqual({ ok: false, error: "invalid-parent" });
      expect(clone.calls).toEqual([]);
    });

    // The picker cannot reach past the home ceiling, and neither may a
    // hand-made request: this is where a clone gets written (security.md).
    it("refuses a parent outside the home ceiling", async () => {
      const fs = new InMemoryFileSystem({
        directories: { "/etc": "/etc" },
      });
      const clone = new FakeClone(fs);
      const connect = makeConnect(fs, PARSEABLE_ORIGIN, "main", clone);

      const result = await connect.connect("https://github.com/o/r.git", {
        parent: "/etc",
      });

      expect(result).toEqual({ ok: false, error: "invalid-parent" });
      expect(clone.calls).toEqual([]);
    });

    // A neighbour whose name merely starts with the ceiling's is outside it.
    it("refuses a sibling of the home ceiling sharing its prefix", async () => {
      const sibling = `${HOME_ROOT}-elsewhere`;
      const fs = new InMemoryFileSystem({
        directories: { [sibling]: sibling },
      });
      const connect = makeConnect(fs);

      await expect(
        connect.connect("https://github.com/o/r.git", { parent: sibling }),
      ).resolves.toEqual({ ok: false, error: "invalid-parent" });
    });

    it("accepts the home ceiling itself as the parent", async () => {
      const fs = new InMemoryFileSystem({
        directories: { [HOME_ROOT]: HOME_ROOT },
      });
      const clone = new FakeClone(fs);
      const connect = makeConnect(fs, PARSEABLE_ORIGIN, "main", clone);

      const result = await connect.connect("https://github.com/o/r.git", {
        parent: HOME_ROOT,
      });

      expect(result.ok).toBe(true);
      expect(clone.calls[0]?.destination).toBe(`${HOME_ROOT}/r`);
    });

    it("refuses a relative parent", async () => {
      const fs = new InMemoryFileSystem();
      const connect = makeConnect(fs);

      await expect(
        connect.connect("https://github.com/o/r.git", { parent: "../etc" }),
      ).resolves.toEqual({ ok: false, error: "invalid-parent" });
    });

    // A forgotten local copy is not a reason to make a second one.
    it("connects an existing clone of the same repository instead of re-cloning", async () => {
      const destination = `${HOME_ROOT}/agent-harness`;
      const fs = new InMemoryFileSystem({
        directories: {
          [destination]: destination,
          [`${destination}/.git`]: `${destination}/.git`,
        },
        listings: { [destination]: [".git", "apm.yml"] },
        files: { [`${destination}/apm.yml`]: "dependencies: []\n" },
      });
      const clone = new FakeClone(fs);
      const connect = makeConnect(fs, PARSEABLE_ORIGIN, "main", clone);

      const result = await connect.connect(
        "https://github.com/fimoklei/agent-harness.git",
      );

      expect(result).toEqual({
        ok: true,
        outcome: "found",
        inventoryPath: destination,
      });
      expect(clone.calls).toEqual([]);
    });

    it("refuses a destination occupied by anything else, leaving it alone", async () => {
      const destination = `${HOME_ROOT}/agent-harness`;
      const fs = new InMemoryFileSystem({
        directories: { [destination]: destination },
        listings: { [destination]: ["notes.txt"] },
        files: { [`${destination}/notes.txt`]: "mine" },
      });
      const clone = new FakeClone(fs);
      const connect = makeConnect(fs, PARSEABLE_ORIGIN, "main", clone);

      const result = await connect.connect(
        "https://github.com/fimoklei/agent-harness.git",
      );

      expect(result).toEqual({ ok: false, error: "destination-occupied" });
      expect(clone.calls).toEqual([]);
      expect(await fs.readFile(`${destination}/notes.txt`)).toBe("mine");
    });

    it("reports a partial clone rather than cloning over it", async () => {
      const destination = `${HOME_ROOT}/agent-harness`;
      const fs = new InMemoryFileSystem({
        directories: {
          [destination]: destination,
          [`${destination}/.git`]: `${destination}/.git`,
        },
        listings: { [destination]: [".git"] },
      });
      const clone = new FakeClone(fs);
      const connect = makeConnect(
        fs,
        PARSEABLE_ORIGIN,
        "main",
        clone,
        // No commit at HEAD: what an interrupted clone leaves behind.
        "no-head",
      );

      const result = await connect.connect(
        "https://github.com/fimoklei/agent-harness.git",
      );

      expect(result).toEqual({ ok: false, error: "destination-partial-clone" });
      expect(clone.calls).toEqual([]);
      expect(await fs.isDirectory(destination)).toBe(true);
    });

    // The ceiling is compared canonical-to-canonical: on macOS a home under
    // /var resolves to /private/var, and a real choice must not be refused
    // for it (ADR-0009).
    it("accepts a parent inside a home whose own path is a symlink", async () => {
      const linked = "/private/Users/me";
      const fs = new InMemoryFileSystem({
        directories: {
          [HOME_ROOT]: linked,
          [`${HOME_ROOT}/Projects`]: `${linked}/Projects`,
          [`${linked}/Projects`]: `${linked}/Projects`,
        },
      });
      const clone = new FakeClone(fs);
      const connect = makeConnect(fs, PARSEABLE_ORIGIN, "main", clone);

      await connect.connect("https://github.com/o/r.git", {
        parent: `${HOME_ROOT}/Projects`,
      });

      expect(clone.calls[0]?.destination).toBe(`${linked}/Projects/r`);
    });

    // The lexical refusal comes first, so a path outside the ceiling is never
    // resolved — not even to throw it away (security.md).
    it("refuses a parent outside the ceiling without resolving it", async () => {
      const fs = new InMemoryFileSystem({
        directories: {
          [HOME_ROOT]: HOME_ROOT,
          "/etc/passwd.d": "/etc/passwd.d",
        },
      });
      const resolved: string[] = [];
      const original = fs.realpath.bind(fs);
      fs.realpath = async (path: string) => {
        resolved.push(path);
        return original(path);
      };
      const connect = makeConnect(fs);

      await expect(
        connect.connect("https://github.com/o/r.git", {
          parent: "/etc/passwd.d",
        }),
      ).resolves.toEqual({ ok: false, error: "invalid-parent" });
      expect(resolved).not.toContain("/etc/passwd.d");
    });

    // Two requests for the same destination: the second would classify the
    // first one's half-written clone and tell the user to delete it (#555).
    it("refuses a second connect while the first is still cloning there", async () => {
      const fs = new InMemoryFileSystem({
        directories: { [HOME_ROOT]: HOME_ROOT },
      });
      let announce: () => void = () => {};
      let release: () => void = () => {};
      const cloning = new Promise<void>((resolve) => {
        announce = resolve;
      });
      const finish = new Promise<void>((resolve) => {
        release = resolve;
      });
      const clone: CloneRepositoryPort = {
        clone: async (_url, destination) => {
          announce();
          await finish;
          await fs.ensureDir(destination);
          await fs.writeFile(`${destination}/apm.yml`, "dependencies: []\n");
          return "cloned";
        },
      };
      const connect = makeConnect(fs, PARSEABLE_ORIGIN, "main", clone);

      const first = connect.connect("https://github.com/o/r.git");
      await cloning;
      const second = await connect.connect("https://github.com/o/r.git");
      release();

      expect(second).toEqual({ ok: false, error: "clone-in-progress" });
      expect((await first).ok).toBe(true);
    });
  });

  // The clone succeeded and stays on disk; only the connect is refused, so a
  // second attempt is the user's to make, not Maestro's to clean up (#554).
  it("offers the scaffold for an empty repository it just cloned", async () => {
    const fs = new InMemoryFileSystem();
    // A clone of an empty repository: a real directory, no apm.yml.
    const clone: CloneRepositoryPort = {
      clone: async (_url, destination) => {
        await fs.ensureDir(destination);
        return "cloned";
      },
    };
    const connect = makeConnect(fs, PARSEABLE_ORIGIN, "main", clone);

    await expect(
      connect.connect("https://github.com/o/r.git"),
    ).resolves.toEqual({
      ok: false,
      error: "scaffoldable",
      // The destination, not the url the user typed.
      scaffoldPath: "/Users/me/r",
    });
    expect(await fs.isDirectory("/Users/me/r")).toBe(true);
  });

  it("rejects a relative or traversal path as relative", async () => {
    const fs = new InMemoryFileSystem();
    const connect = makeConnect(fs);

    await expect(connect.connect("../../etc")).resolves.toEqual({
      ok: false,
      error: "relative",
    });
  });

  it("rejects a path that exists but is a file as not-a-directory", async () => {
    const fs = new InMemoryFileSystem({
      files: { "/Users/me/notes.txt": "hello" },
    });
    const connect = makeConnect(fs);

    await expect(connect.connect("/Users/me/notes.txt")).resolves.toEqual({
      ok: false,
      error: "not-a-directory",
    });
  });
});
