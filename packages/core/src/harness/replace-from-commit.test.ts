import { describe, expect, it } from "vitest";
import { InMemoryCopyTree } from "../filesystem/copy-tree-fs.fake";
import { skillRef } from "./harness-git.fake";
import { type PrimitiveRef, primitiveEntry } from "./harness-primitive";
import { replaceFromCommit } from "./replace-from-commit";

const ROOT = "/harness";
const SKILLS = "/harness/.apm/skills";
const COMMIT = "commit-release";

// A Harness disk with the skills named, each a folder holding its text.
function build(seed: {
  disk: Record<string, string>;
  // The commit's skills: name → text.
  atCommit: Record<string, string>;
  // A move into this path fails once.
  failMoveInto?: string;
}) {
  const tree = new InMemoryCopyTree();
  tree.makeDir(`${ROOT}/.maestro/prompts`);
  tree.makeDir(SKILLS);
  for (const [name, text] of Object.entries(seed.disk)) {
    tree.write(`${SKILLS}/${name}/SKILL.md`, text);
  }
  let failsLeft = seed.failMoveInto === undefined ? 0 : 1;
  const moves: [string, string][] = [];
  const deps = {
    fs: tree.fileSystem(),
    copyFs: {
      createStagingDir: (parent: string) => tree.createStagingDir(parent),
      removePath: (path: string) => tree.removePath(path),
      movePath: async (from: string, to: string) => {
        if (to === seed.failMoveInto && failsLeft-- > 0) {
          throw new Error("EACCES");
        }
        moves.push([from, to]);
        await tree.movePath(from, to);
      },
    },
    git: {
      writePrimitiveInto: async (
        _root: string,
        ref: PrimitiveRef,
        _commit: string,
        into: string,
      ) => {
        const text = seed.atCommit[ref.name];
        if (text === undefined) {
          return "missing" as const;
        }
        tree.write(`${into}/${primitiveEntry(ref)}/SKILL.md`, text);
        return "written" as const;
      },
    },
  };
  const atCommit = Object.keys(seed.atCommit).map((name) => skillRef(name));
  const read = (name: string) =>
    tree.fileSystem().readFile(`${SKILLS}/${name}/SKILL.md`);
  const replace = (refs: PrimitiveRef[]) =>
    replaceFromCommit(deps, { root: ROOT, commit: COMMIT, atCommit, refs });
  return { replace, read, moves, tree };
}

describe("replaceFromCommit", () => {
  it("writes every name as the commit holds it and removes a name the commit lacks", async () => {
    const { replace, read } = build({
      disk: { renamed: "edited", tdd: "edited tdd" },
      atCommit: { original: "released", tdd: "released tdd" },
    });

    await expect(
      replace([skillRef("renamed"), skillRef("original"), skillRef("tdd")]),
    ).resolves.toBe("replaced");

    expect(await read("renamed")).toBeNull();
    expect(await read("original")).toBe("released");
    expect(await read("tdd")).toBe("released tdd");
  });

  it.each([
    ["setting the first name aside", `${SKILLS}/.maestro-copy-1/discarded`],
    ["moving the first name in", `${SKILLS}/tdd`],
    ["setting the second name aside", `${SKILLS}/.maestro-copy-2/discarded`],
    ["moving the second name in", `${SKILLS}/review`],
  ])(
    "leaves both names as they were when %s fails",
    async (_, failMoveInto) => {
      const { replace, read, tree } = build({
        disk: { tdd: "edited tdd", review: "edited review" },
        atCommit: { tdd: "released tdd", review: "released review" },
        failMoveInto,
      });

      await expect(
        replace([skillRef("tdd"), skillRef("review")]),
      ).resolves.toBe("failed");

      expect(await read("tdd")).toBe("edited tdd");
      expect(await read("review")).toBe("edited review");
      expect((await tree.listNames(SKILLS))?.sort()).toEqual(["review", "tdd"]);
    },
  );

  it.each([
    ["setting the new name aside", `${SKILLS}/.maestro-copy-1/discarded`],
    ["moving the old name in", `${SKILLS}/original`],
  ])("leaves a rename as it was when %s fails", async (_, failMoveInto) => {
    const { replace, read, tree } = build({
      disk: { renamed: "edited" },
      atCommit: { original: "released" },
      failMoveInto,
    });

    await expect(
      replace([skillRef("renamed"), skillRef("original")]),
    ).resolves.toBe("failed");

    expect(await read("renamed")).toBe("edited");
    expect(await tree.listNames(SKILLS)).toEqual(["renamed"]);
  });

  it("leaves one name as it was when its copy cannot move in", async () => {
    const { replace, read, tree } = build({
      disk: { tdd: "edited tdd" },
      atCommit: { tdd: "released tdd" },
      failMoveInto: `${SKILLS}/tdd`,
    });

    await expect(replace([skillRef("tdd")])).resolves.toBe("failed");

    expect(await read("tdd")).toBe("edited tdd");
    expect(await tree.listNames(SKILLS)).toEqual(["tdd"]);
  });

  it("refuses a symlinked name before moving any name", async () => {
    const { replace, read, moves, tree } = build({
      disk: { tdd: "edited tdd" },
      atCommit: { tdd: "released tdd", linked: "released linked" },
    });
    tree.symlink(`${SKILLS}/linked`, "/elsewhere/linked");

    await expect(replace([skillRef("tdd"), skillRef("linked")])).resolves.toBe(
      "destination-unsafe",
    );

    expect(moves).toEqual([]);
    expect(await read("tdd")).toBe("edited tdd");
  });

  it("refuses a name whose type folder resolves outside the Harness before moving any name", async () => {
    const { replace, read, moves, tree } = build({
      disk: { tdd: "edited tdd" },
      atCommit: { tdd: "released tdd", greet: "released greet" },
    });
    tree.remove(`${ROOT}/.maestro/prompts`);
    tree.makeDir("/elsewhere/prompts");
    tree.symlink(`${ROOT}/.maestro/prompts`, "/elsewhere/prompts");

    await expect(
      replace([skillRef("tdd"), { type: "prompt", name: "greet" }]),
    ).resolves.toBe("destination-unsafe");

    expect(moves).toEqual([]);
    expect(await read("tdd")).toBe("edited tdd");
  });
});
