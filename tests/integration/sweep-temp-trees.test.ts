// The sweep that has to survive a crashed run: an `afterEach` never runs when
// the process dies, so this is what keeps `mkdtemp` litter off the disk.
import { mkdir, mkdtemp, readdir, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { removeGitTempTree } from "../helpers/git-fixture";
import { sweepStaleTempTrees } from "../helpers/sweep-temp-trees";

const HOUR_MS = 60 * 60 * 1000;
const CUTOFF_MS = 6 * HOUR_MS;

describe("sweepStaleTempTrees", () => {
  let root: string;

  // A file inside, so removal has to recurse rather than drop an empty dir.
  const tree = async (name: string, hoursOld: number): Promise<void> => {
    const path = join(root, name);
    await mkdir(path);
    await writeFile(join(path, "fixture.txt"), "x", "utf8");
    const when = new Date(Date.now() - hoursOld * HOUR_MS);
    await utimes(path, when, when);
  };

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "maestro-sweep-"));
  });

  afterEach(async () => {
    await removeGitTempTree(root);
  });

  it("removes a maestro tree older than the cutoff", async () => {
    await tree("maestro-connect-abc", 8);

    await sweepStaleTempTrees(root, CUTOFF_MS);

    expect(await readdir(root)).toEqual([]);
  });

  it("keeps a maestro tree a running suite could still be writing", async () => {
    await tree("maestro-connect-abc", 1);

    await sweepStaleTempTrees(root, CUTOFF_MS);

    expect(await readdir(root)).toEqual(["maestro-connect-abc"]);
  });

  it("keeps a tree this suite never created", async () => {
    await tree("something-else", 8);

    await sweepStaleTempTrees(root, CUTOFF_MS);

    expect(await readdir(root)).toEqual(["something-else"]);
  });
});
