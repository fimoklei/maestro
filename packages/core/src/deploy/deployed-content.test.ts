import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InMemoryCopyTree } from "../filesystem/copy-tree-fs.fake";
import type { DeployTarget } from "./deploy-skill";
import { DeployedContentAdapter } from "./deployed-content";
import { DeployedLocation } from "./deployed-location";

const FAKE_REPO = "/repo";
const fakeRepoTarget: DeployTarget = { kind: "repo", repoPath: FAKE_REPO };
const sha = (bytes: Buffer) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

// The adapter over an in-memory tree, with a release reader when `release` is
// given: null makes the release unreadable.
function adapterOn(options: { release?: Record<string, string> | null } = {}) {
  const tree = new InMemoryCopyTree();
  const lockfilePath = `${FAKE_REPO}/apm.lock.yaml`;
  const releaseReads: string[] = [];
  const content = new DeployedContentAdapter({
    location: { treeRoot: () => FAKE_REPO, lockfilePath: () => lockfilePath },
    fs: tree,
    ...(options.release === undefined
      ? {}
      : {
          inventoryGit: {
            readSkillFilesAtTag: async (tag: string) => {
              releaseReads.push(tag);
              if (options.release === null) {
                throw new Error("release unreadable");
              }
              return options.release ?? null;
            },
          },
        }),
  });
  // Writes the lockfile with deployed_file_hashes matching the copy as it is.
  const recordLockfile = (name: string) => {
    const lines = tree.filePaths().map((abs) => {
      const rel = abs.slice(FAKE_REPO.length + 1);
      return `      ${rel}: ${sha(tree.read(abs) ?? Buffer.alloc(0))}`;
    });
    tree.write(
      lockfilePath,
      [
        "dependencies:",
        `  - virtual_path: .apm/skills/${name}`,
        "    package_type: claude_skill",
        "    resolved_ref: v0.5.1",
        "    deployed_file_hashes:",
        ...lines,
        "    content_hash: sha256:opaque",
        "",
      ].join("\n"),
    );
  };
  return { tree, content, recordLockfile, lockfilePath, releaseReads };
}

const SUBTREES = [".claude/skills/tdd", ".agents/skills/tdd"];
const at = (rel: string) => `${FAKE_REPO}/${rel}`;
const classify = (
  content: ReturnType<typeof adapterOn>["content"],
  extra: { tools?: ("claude" | "codex")[]; release?: string } = {},
) =>
  content.readLockfile(fakeRepoTarget).then((lockfile) =>
    content.classify({
      target: fakeRepoTarget,
      name: "tdd",
      lockfile,
      ...extra,
    }),
  );

// A lockfile the test writes by hand, when the shape is the point.
const writeYaml = (fake: ReturnType<typeof adapterOn>, yaml: string) =>
  fake.tree.write(fake.lockfilePath, yaml);

describe("DeployedContentAdapter (in-memory copy tree)", () => {
  it("reports not-deployed when the lockfile has no entry for the skill", async () => {
    const fake = adapterOn();
    writeYaml(
      fake,
      "dependencies:\n  - virtual_path: .apm/skills/grill\n    package_type: claude_skill\n    resolved_ref: v0.5.1\n    deployed_file_hashes:\n      .claude/skills/grill/SKILL.md: sha256:aaa\n    content_hash: sha256:opaque\n",
    );
    await expect(classify(fake.content)).resolves.toBe("not-deployed");
  });

  it("reports not-deployed when the target has no lockfile", async () => {
    const fake = adapterOn();
    await expect(classify(fake.content)).resolves.toBe("not-deployed");
  });

  it("reports lockfile-malformed for a present but non-YAML lockfile", async () => {
    // An unreadable lockfile must never stand in for "nothing is deployed" (#58).
    const fake = adapterOn();
    fake.tree.write(at(".claude/skills/tdd/SKILL.md"), "deployed\n");
    writeYaml(fake, "dependencies: [unterminated\n");
    await expect(classify(fake.content)).resolves.toBe("lockfile-malformed");
  });

  it("reports lockfile-malformed for a present lockfile of the wrong shape", async () => {
    const fake = adapterOn();
    fake.tree.write(at(".claude/skills/tdd/SKILL.md"), "deployed\n");
    writeYaml(fake, "dependencies: not-a-list\n");
    await expect(classify(fake.content)).resolves.toBe("lockfile-malformed");
  });

  it("reports lockfile-malformed when this skill's own entry cannot be read", async () => {
    // The view skips an uninterpretable entry (#357); the guard must not read
    // that skip as "nothing deployed" (#58).
    const fake = adapterOn();
    fake.tree.write(at(".claude/skills/tdd/SKILL.md"), "deployed\n");
    writeYaml(
      fake,
      "dependencies:\n  - virtual_path: skills/tdd\n    package_type: claude_skill\n    source: local\n",
    );
    await expect(classify(fake.content)).resolves.toBe("lockfile-malformed");
  });

  it("leaves another skill readable when one entry cannot be read", async () => {
    const fake = adapterOn();
    const body = "deployed\n";
    fake.tree.write(at(".claude/skills/tdd/SKILL.md"), body);
    writeYaml(
      fake,
      [
        "dependencies:",
        "  - virtual_path: skills/local-one",
        "    package_type: claude_skill",
        "    source: local",
        "  - virtual_path: skills/tdd",
        "    package_type: claude_skill",
        "    resolved_ref: v0.5.1",
        "    deployed_file_hashes:",
        `      .claude/skills/tdd/SKILL.md: ${sha(Buffer.from(body))}`,
        "",
      ].join("\n"),
    );
    await expect(classify(fake.content)).resolves.toBe("clean");
  });

  it("reports unverifiable for a legacy entry with no recorded hashes", async () => {
    const fake = adapterOn();
    fake.tree.write(at(".claude/skills/tdd/SKILL.md"), "deployed\n");
    writeYaml(
      fake,
      "dependencies:\n  - virtual_path: .apm/skills/tdd\n    package_type: claude_skill\n    resolved_ref: v0.5.1\n",
    );
    await expect(classify(fake.content)).resolves.toBe("unverifiable");
  });

  it("reports unverifiable when deployed files exist with no lockfile entry", async () => {
    const fake = adapterOn();
    fake.tree.write(at(".claude/skills/tdd/SKILL.md"), "deployed\n");
    writeYaml(fake, "dependencies: []\n");
    await expect(classify(fake.content)).resolves.toBe("unverifiable");
  });

  it("reports not-deployed when the deployed copy was fully deleted", async () => {
    // A fully-deleted copy is restored, never refused as "local edits" (#65).
    const fake = adapterOn();
    fake.tree.write(at(".claude/skills/tdd/SKILL.md"), "deployed\n");
    fake.recordLockfile("tdd");
    fake.tree.remove(at(".claude/skills/tdd"));
    fake.tree.remove(at(".agents/skills/tdd"));
    await expect(classify(fake.content)).resolves.toBe("not-deployed");
  });

  it("diverges when only some recorded files were deleted (partial)", async () => {
    const fake = adapterOn();
    fake.tree.write(at(".claude/skills/tdd/SKILL.md"), "one\n");
    fake.tree.write(at(".claude/skills/tdd/tests.md"), "two\n");
    fake.recordLockfile("tdd");
    fake.tree.remove(at(".claude/skills/tdd/tests.md"));
    await expect(classify(fake.content)).resolves.toBe("diverged");
  });

  it("reports unreadable when a deploy subtree is a file, not a directory", async () => {
    const fake = adapterOn();
    fake.tree.write(at(".claude/skills/tdd/SKILL.md"), "deployed\n");
    fake.recordLockfile("tdd");
    fake.tree.remove(at(".claude/skills/tdd"));
    fake.tree.write(at(".claude/skills/tdd"), "not a directory\n");
    await expect(classify(fake.content)).resolves.toBe("unreadable");
  });

  it("reports unreadable when a deployed subtree cannot be listed", async () => {
    const fake = adapterOn();
    fake.tree.write(at(".claude/skills/tdd/SKILL.md"), "deployed\n");
    fake.recordLockfile("tdd");
    fake.tree.setUnreadable(at(".claude/skills/tdd"));
    await expect(classify(fake.content)).resolves.toBe("unreadable");
  });

  it("is clean when every deployed file matches its recorded hash", async () => {
    const fake = adapterOn();
    for (const subtree of SUBTREES) {
      fake.tree.write(at(`${subtree}/SKILL.md`), "skill\n");
    }
    fake.recordLockfile("tdd");
    await expect(classify(fake.content)).resolves.toBe("clean");
  });

  it("diverges when a deployed file was edited after install", async () => {
    const fake = adapterOn();
    fake.tree.write(at(".claude/skills/tdd/SKILL.md"), "skill\n");
    fake.recordLockfile("tdd");
    fake.tree.write(at(".claude/skills/tdd/SKILL.md"), "skill, edited\n");
    await expect(classify(fake.content)).resolves.toBe("diverged");
  });

  it("diverges on an untracked file the lockfile never recorded", async () => {
    const fake = adapterOn();
    fake.tree.write(at(".claude/skills/tdd/SKILL.md"), "skill\n");
    fake.recordLockfile("tdd");
    fake.tree.write(at(".claude/skills/tdd/STRAY.md"), "stray\n");
    await expect(classify(fake.content)).resolves.toBe("diverged");
  });

  it("diverges when the codex .agents copy is edited but .claude is clean", async () => {
    const fake = adapterOn();
    for (const subtree of SUBTREES) {
      fake.tree.write(at(`${subtree}/SKILL.md`), "skill\n");
    }
    fake.recordLockfile("tdd");
    fake.tree.write(at(".agents/skills/tdd/SKILL.md"), "codex edit\n");
    await expect(classify(fake.content)).resolves.toBe("diverged");
  });

  it("diverges on an edited .agents copy the lockfile never recorded", async () => {
    const fake = adapterOn();
    for (const subtree of SUBTREES) {
      fake.tree.write(at(`${subtree}/SKILL.md`), "skill\n");
    }
    fake.recordLockfile("tdd");
    fake.tree.write(at(".agents/skills/tdd/NOTES.md"), "codex notes\n");
    await expect(classify(fake.content)).resolves.toBe("diverged");
  });

  it("verifies a copy apm recorded under a package type it could not manage", async () => {
    const fake = adapterOn();
    fake.tree.write(at(".claude/skills/tdd/SKILL.md"), "skill\n");
    writeYaml(
      fake,
      [
        "dependencies:",
        "  - virtual_path: .apm/skills/tdd",
        "    package_type: hybrid",
        "    resolved_ref: v0.5.1",
        "    deployed_file_hashes:",
        `      .claude/skills/tdd/SKILL.md: ${sha(Buffer.from("skill\n"))}`,
        "    content_hash: sha256:opaque",
        "",
      ].join("\n"),
    );
    await expect(classify(fake.content)).resolves.toBe("clean");
  });

  it("scopes the comparison to the tools the write targets", async () => {
    // An untargeted tool's absent copy must not read as drift (#136).
    const fake = adapterOn();
    fake.tree.write(at(".claude/skills/tdd/SKILL.md"), "skill\n");
    fake.tree.write(at(".agents/skills/tdd/SKILL.md"), "skill\n");
    fake.recordLockfile("tdd");
    fake.tree.remove(at(".agents/skills/tdd"));
    await expect(classify(fake.content, { tools: ["claude"] })).resolves.toBe(
      "clean",
    );
    await expect(classify(fake.content)).resolves.toBe("diverged");
  });

  it("does not refuse a single-tool redeploy over a prior two-tool lockfile", async () => {
    const fake = adapterOn();
    fake.tree.write(at(".claude/skills/tdd/SKILL.md"), "skill\n");
    fake.tree.write(at(".agents/skills/tdd/SKILL.md"), "skill\n");
    fake.recordLockfile("tdd");
    fake.tree.remove(at(".agents/skills/tdd"));
    await expect(classify(fake.content, { tools: ["claude"] })).resolves.toBe(
      "clean",
    );
  });

  it("still catches an edit in a targeted tool when scoped", async () => {
    const fake = adapterOn();
    fake.tree.write(at(".claude/skills/tdd/SKILL.md"), "skill\n");
    fake.recordLockfile("tdd");
    fake.tree.write(at(".claude/skills/tdd/SKILL.md"), "edited\n");
    await expect(classify(fake.content, { tools: ["claude"] })).resolves.toBe(
      "diverged",
    );
  });

  describe("against the chosen release", () => {
    const release = {
      "SKILL.md": sha(Buffer.from("release\n")),
    };

    it("never reads the release for a copy that matches its record", async () => {
      const fake = adapterOn({ release });
      fake.tree.write(at(".claude/skills/tdd/SKILL.md"), "skill\n");
      fake.recordLockfile("tdd");
      await expect(classify(fake.content, { release: "v0.6.0" })).resolves.toBe(
        "clean",
      );
      expect(fake.releaseReads).toEqual([]);
    });

    it("reads a copy equal in full to the chosen release as clean", async () => {
      const fake = adapterOn({ release });
      fake.tree.write(at(".claude/skills/tdd/SKILL.md"), "skill\n");
      fake.recordLockfile("tdd");
      fake.tree.write(at(".claude/skills/tdd/SKILL.md"), "release\n");
      await expect(classify(fake.content, { release: "v0.6.0" })).resolves.toBe(
        "clean",
      );
    });

    it("keeps a copy with a file the release does not have protected", async () => {
      const fake = adapterOn({ release });
      fake.tree.write(at(".claude/skills/tdd/SKILL.md"), "release\n");
      fake.recordLockfile("tdd");
      fake.tree.write(at(".claude/skills/tdd/NOTES.md"), "mine\n");
      await expect(classify(fake.content, { release: "v0.6.0" })).resolves.toBe(
        "diverged",
      );
    });

    it("keeps the copy protected when the release cannot be read", async () => {
      const fake = adapterOn({ release: null });
      fake.tree.write(at(".claude/skills/tdd/SKILL.md"), "skill\n");
      fake.recordLockfile("tdd");
      fake.tree.write(at(".claude/skills/tdd/SKILL.md"), "release\n");
      await expect(classify(fake.content, { release: "v0.6.0" })).resolves.toBe(
        "diverged",
      );
      expect(fake.releaseReads).toEqual(["v0.6.0"]);
    });

    it("keeps the copy protected when no release was chosen", async () => {
      const fake = adapterOn({ release });
      fake.tree.write(at(".claude/skills/tdd/SKILL.md"), "skill\n");
      fake.recordLockfile("tdd");
      fake.tree.write(at(".claude/skills/tdd/SKILL.md"), "release\n");
      await expect(classify(fake.content)).resolves.toBe("diverged");
      expect(fake.releaseReads).toEqual([]);
    });

    it("reads a single-tool copy as clean when that tool equals the release, whatever the other tool holds", async () => {
      const fake = adapterOn({ release });
      fake.tree.write(at(".claude/skills/tdd/SKILL.md"), "skill\n");
      fake.tree.write(at(".agents/skills/tdd/SKILL.md"), "skill\n");
      fake.recordLockfile("tdd");
      fake.tree.write(at(".claude/skills/tdd/SKILL.md"), "release\n");
      fake.tree.write(at(".agents/skills/tdd/SKILL.md"), "mine\n");
      await expect(
        classify(fake.content, { tools: ["claude"], release: "v0.6.0" }),
      ).resolves.toBe("clean");
    });
    it("keeps a copy missing a file the release has protected", async () => {
      const fake = adapterOn({
        release: { ...release, "NOTES.md": sha(Buffer.from("notes\n")) },
      });
      fake.tree.write(at(".claude/skills/tdd/SKILL.md"), "release\n");
      fake.tree.write(at(".claude/skills/tdd/NOTES.md"), "notes\n");
      fake.recordLockfile("tdd");
      fake.tree.remove(at(".claude/skills/tdd/NOTES.md"));
      await expect(classify(fake.content, { release: "v0.6.0" })).resolves.toBe(
        "diverged",
      );
    });

    it("keeps one tool's edited copy protected when the other matches", async () => {
      const fake = adapterOn({ release });
      for (const subtree of SUBTREES) {
        fake.tree.write(at(`${subtree}/SKILL.md`), "release\n");
      }
      fake.recordLockfile("tdd");
      fake.tree.write(at(".agents/skills/tdd/SKILL.md"), "mine\n");
      await expect(classify(fake.content, { release: "v0.6.0" })).resolves.toBe(
        "diverged",
      );
    });

    it("reads a copy as clean when each tool's folder equals its record or the release", async () => {
      const fake = adapterOn({ release });
      fake.tree.write(at(".claude/skills/tdd/SKILL.md"), "skill\n");
      fake.tree.write(at(".agents/skills/tdd/SKILL.md"), "release\n");
      fake.recordLockfile("tdd");
      fake.tree.write(at(".claude/skills/tdd/SKILL.md"), "release\n");
      await expect(classify(fake.content, { release: "v0.6.0" })).resolves.toBe(
        "clean",
      );
    });

    it("reads a copy with no recorded hashes as unverifiable, release or not", async () => {
      const fake = adapterOn({ release });
      fake.tree.write(at(".claude/skills/tdd/SKILL.md"), "release\n");
      writeYaml(
        fake,
        "dependencies:\n  - virtual_path: .apm/skills/tdd\n    package_type: claude_skill\n    resolved_ref: v0.5.1\n",
      );
      await expect(classify(fake.content, { release: "v0.6.0" })).resolves.toBe(
        "unverifiable",
      );
    });
  });

  describe("a symlinked file", () => {
    it("is hashed through the link, as the copy reads it", async () => {
      const fake = adapterOn();
      fake.tree.write("/elsewhere/SKILL.md", "skill\n");
      fake.tree.symlink(
        at(".claude/skills/tdd/SKILL.md"),
        "/elsewhere/SKILL.md",
      );
      writeYaml(
        fake,
        [
          "dependencies:",
          "  - virtual_path: .apm/skills/tdd",
          "    package_type: claude_skill",
          "    resolved_ref: v0.5.1",
          "    deployed_file_hashes:",
          `      .claude/skills/tdd/SKILL.md: ${sha(Buffer.from("skill\n"))}`,
          "",
        ].join("\n"),
      );
      await expect(classify(fake.content)).resolves.toBe("clean");
    });

    it("reads as unreadable when the link dangles", async () => {
      const fake = adapterOn();
      fake.tree.write(at(".claude/skills/tdd/SKILL.md"), "skill\n");
      fake.recordLockfile("tdd");
      fake.tree.symlink(at(".claude/skills/tdd/NOTES.md"), "/gone/NOTES.md");
      await expect(classify(fake.content)).resolves.toBe("unreadable");
    });

    it("reads a dangling lockfile link as no lockfile", async () => {
      const fake = adapterOn();
      fake.tree.write(at(".claude/skills/tdd/SKILL.md"), "skill\n");
      fake.tree.symlink(fake.lockfilePath, "/gone/apm.lock.yaml");
      await expect(classify(fake.content)).resolves.toBe("unverifiable");
    });

    it("reads a looping lockfile link as malformed, never as no lockfile", async () => {
      const fake = adapterOn();
      fake.tree.write(at(".claude/skills/tdd/SKILL.md"), "skill\n");
      fake.tree.symlink(fake.lockfilePath, at("loop.yaml"));
      fake.tree.symlink(at("loop.yaml"), fake.lockfilePath);
      await expect(classify(fake.content)).resolves.toBe("lockfile-malformed");
    });
  });

  describe("linkedSkillPath", () => {
    it("returns null when the tool's whole skills directory is a link", async () => {
      // The link is one level up: the leaf path reads as absent, never as a link.
      const fake = adapterOn();
      fake.tree.symlink(at(".claude/skills"), "/elsewhere/skills");
      await expect(
        fake.content.linkedSkillPath({
          target: fakeRepoTarget,
          name: "tdd",
          tools: ["claude"],
        }),
      ).resolves.toBeNull();
    });

    it("names the leaf skill directory that is a symlink", async () => {
      const fake = adapterOn();
      fake.tree.symlink(at(".claude/skills/tdd"), "/elsewhere/tdd");
      await expect(
        fake.content.linkedSkillPath({
          target: fakeRepoTarget,
          name: "tdd",
        }),
      ).resolves.toBe(at(".claude/skills/tdd"));
    });

    it("returns null when every destination is a real directory or absent", async () => {
      const fake = adapterOn();
      fake.tree.write(at(".claude/skills/tdd/SKILL.md"), "skill\n");
      await expect(
        fake.content.linkedSkillPath({
          target: fakeRepoTarget,
          name: "tdd",
        }),
      ).resolves.toBeNull();
    });

    it("checks only the tools this deploy targeted", async () => {
      const fake = adapterOn();
      fake.tree.symlink(at(".agents/skills/tdd"), "/elsewhere/tdd");
      await expect(
        fake.content.linkedSkillPath({
          target: fakeRepoTarget,
          name: "tdd",
          tools: ["claude"],
        }),
      ).resolves.toBeNull();
    });
  });

  describe("contentDigest", () => {
    it("changes when a byte of the deployed copy changes", async () => {
      const fake = adapterOn();
      fake.tree.write(at(".claude/skills/tdd/SKILL.md"), "skill\n");
      const before = await fake.content.contentDigest({
        target: fakeRepoTarget,
        name: "tdd",
      });
      fake.tree.write(at(".claude/skills/tdd/SKILL.md"), "skill!\n");
      const after = await fake.content.contentDigest({
        target: fakeRepoTarget,
        name: "tdd",
      });
      expect(after).not.toBe(before);
    });

    it("gives two different local edits two different digests (b7d14a1b)", async () => {
      // Consent is for content: two edits that both read `diverged` must not share one digest.
      const fake = adapterOn();
      fake.tree.write(at(".claude/skills/tdd/SKILL.md"), "skill\n");
      fake.recordLockfile("tdd");
      const digest = async () =>
        fake.content.contentDigest({ target: fakeRepoTarget, name: "tdd" });
      fake.tree.write(at(".claude/skills/tdd/SKILL.md"), "edit one\n");
      const first = await digest();
      fake.tree.write(at(".claude/skills/tdd/SKILL.md"), "edit two\n");
      const second = await digest();
      expect(first).not.toBeNull();
      expect(second).not.toBe(first);
    });

    it("reads an absent copy as an empty digest, not as a failure", async () => {
      const fake = adapterOn();
      await expect(
        fake.content.contentDigest({ target: fakeRepoTarget, name: "tdd" }),
      ).resolves.toBe("");
    });
  });
});

// The global copy lives under HOME, its lockfile under ~/.apm, and apm keys the
// hashes HOME-relative. Only the real DeployedLocation maps those two places.
describe("DeployedContentAdapter, global target", () => {
  it("is clean when the HOME copy matches the hash its ~/.apm lockfile records", async () => {
    const tree = new InMemoryCopyTree();
    const content = new DeployedContentAdapter({
      location: new DeployedLocation({
        HOME: "/home/fake",
      } as NodeJS.ProcessEnv),
      fs: tree,
    });
    tree.write("/home/fake/.claude/skills/tdd/SKILL.md", "skill\n");
    tree.write(
      "/home/fake/.apm/apm.lock.yaml",
      [
        "dependencies:",
        "  - virtual_path: .apm/skills/tdd",
        "    package_type: claude_skill",
        "    resolved_ref: v0.5.1",
        "    deployed_file_hashes:",
        `      .claude/skills/tdd/SKILL.md: ${sha(Buffer.from("skill\n"))}`,
        "    content_hash: sha256:opaque",
        "",
      ].join("\n"),
    );

    await expect(
      content.classify({
        target: { kind: "global" },
        name: "tdd",
        lockfile: await content.readLockfile({ kind: "global" }),
      }),
    ).resolves.toBe("clean");
  });
});
