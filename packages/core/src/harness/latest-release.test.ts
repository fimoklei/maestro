import { describe, expect, it } from "vitest";
import { InMemoryHarnessGit } from "./harness-git.fake";
import { readLatestRelease } from "./latest-release";
import type { HarnessFreshness } from "./read-harness-state";

const freshnessOf = (freshness: HarnessFreshness) => ({
  read: async (_root: string) => freshness,
});

const NEVER_FETCHED = freshnessOf({ outcome: null, lastFetchedAt: null });
const FETCHED = freshnessOf({
  outcome: "fetched",
  lastFetchedAt: "2026-10-25T08:00:00.000Z",
});

const taggedWorld = () => {
  const git = new InMemoryHarnessGit().settled({ tdd: "same" }, "bbb");
  git.tags = [
    { name: "v0.9.0", commit: "aaa" },
    { name: "v0.10.0", commit: "bbb" },
    { name: "nightly", commit: "ccc" },
  ];
  return git;
};

describe("readLatestRelease", () => {
  it("reads the highest release tag once a fetch has succeeded", async () => {
    const git = taggedWorld();

    const { latest } = await readLatestRelease(git, FETCHED, git.root);

    expect(latest).toEqual({
      known: true,
      tag: { name: "v0.10.0", commit: "bbb" },
      tags: git.tags,
    });
  });

  it("knows no release before any fetch has succeeded, even with tags on disk", async () => {
    const git = taggedWorld();

    const { latest } = await readLatestRelease(git, NEVER_FETCHED, git.root);

    expect(latest).toEqual({ known: false });
  });

  it("knows no release when the tag namespace cannot be read", async () => {
    const git = taggedWorld();
    git.tags = null;

    const { latest } = await readLatestRelease(git, FETCHED, git.root);

    expect(latest).toEqual({ known: false });
  });

  it("reports a fetched harness without release tags as never released", async () => {
    const git = new InMemoryHarnessGit().settled({ tdd: "same" });
    git.tags = [{ name: "nightly", commit: "settled" }];

    const { latest } = await readLatestRelease(git, FETCHED, git.root);

    expect(latest).toEqual({ known: true, tag: null, tags: git.tags });
  });
});
