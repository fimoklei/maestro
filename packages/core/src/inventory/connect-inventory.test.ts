import { describe, expect, it } from "vitest";
import { ConfigStore } from "../registry/config-store";
import { InMemoryFileSystem } from "../registry/file-system.fake";
import type { CloneOutcome, CloneRepositoryPort } from "./clone-repository";
import { ConnectInventory } from "./connect-inventory";
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
  offers: ScaffoldOffers = new ScaffoldOffers(),
): ConnectInventory {
  return new ConnectInventory({
    fs,
    store: new ConfigStore({ fs, configPath: () => CONFIG_PATH }),
    originUrl: async () => originUrl,
    defaultBranch: async () => defaultBranch,
    isRepositoryRoot: async () => true,
    homeRoot: () => HOME_ROOT,
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

  it("reports a failed clone and persists nothing", async () => {
    const fs = new InMemoryFileSystem();
    const connect = makeConnect(
      fs,
      PARSEABLE_ORIGIN,
      "main",
      new FakeClone(fs, "clone-failed"),
    );

    const result = await connect.connect("https://github.com/o/r.git");

    expect(result).toEqual({ ok: false, error: "clone-failed" });
    const stored = await new ConfigStore({
      fs,
      configPath: () => CONFIG_PATH,
    }).read();
    expect(stored.inventoryPath).toBeUndefined();
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
