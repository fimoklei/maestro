// A real DeployedContentAdapter over an in-memory copy tree. A test puts a
// skill's copy into a state with `setCopy`; the drift verdict and digest the
// use case reads are then computed from the files, never scripted.
import { createHash } from "node:crypto";
import { InMemoryCopyTree } from "../filesystem/copy-tree-fs.fake";
import type { DeployedContentState, DeployTarget } from "./deploy-skill";
import { deployTargetSubtrees, type SupportedTool } from "./deploy-tools";
import { DeployedContentAdapter } from "./deployed-content";
import { DeployedLocation } from "./deployed-location";

const FAKE_HOME = "/home/fake";

type ClassifyInput = Parameters<DeployedContentAdapter["classify"]>[0];

// Copies a test places on the use case's first read of them stand for copies
// that were there all along: a lockfile reading taken before a placement is
// taken again, and every other classify uses the caller's reading.
export function placedOnRead(
  content: DeployedContentAdapter,
  place: (target: DeployTarget, name: string) => boolean,
) {
  let placements = 0;
  let readAfter = 0;
  const placeCounted = (target: DeployTarget, name: string) => {
    if (place(target, name)) {
      placements += 1;
    }
  };
  return {
    place: placeCounted,
    readLockfile: (target: DeployTarget) => {
      readAfter = placements;
      return content.readLockfile(target);
    },
    classify: async (input: ClassifyInput) => {
      placeCounted(input.target, input.name);
      return content.classify(
        placements > readAfter
          ? { ...input, lockfile: await content.readLockfile(input.target) }
          : input,
      );
    },
  };
}

const sha = (bytes: Buffer) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

// One tool's copy: clean and diverged keep a recorded baseline, unverifiable
// keeps files but loses that tool's record, not-deployed has no folder, and
// deleted had its recorded folder removed afterwards.
export type ToolCopyState =
  | "clean"
  | "diverged"
  | "unverifiable"
  | "not-deployed"
  | "deleted";

// A whole-copy state, or one per tool (missing tools are clean).
export type CopyStates =
  | DeployedContentState
  | Partial<Record<SupportedTool, ToolCopyState>>;

const TOOLS: SupportedTool[] = ["claude", "codex"];

// `release` answers the chosen release's file hashes per skill, as the git
// reader does; null stands for an unreadable release.
export function inMemoryDeployedContent(
  options: {
    release?: (tag: string, name: string) => Record<string, string> | null;
  } = {},
) {
  const tree = new InMemoryCopyTree();
  // Per lockfile path: the entries apm would have written there.
  const lockfiles = new Map<string, Map<string, Record<string, string>>>();
  const malformed = new Set<string>();

  const location = new DeployedLocation({ HOME: FAKE_HOME });
  const treeRoot = (target: DeployTarget) => location.treeRoot(target);
  const lockfilePath = (target: DeployTarget) => location.lockfilePath(target);

  const content = new DeployedContentAdapter({
    location,
    fs: tree,
    ...(options.release === undefined
      ? {}
      : {
          inventoryGit: {
            readSkillFilesAtTag: async (tag: string, name: string) => {
              const released = options.release?.(tag, name) ?? null;
              if (released === null) {
                throw new Error("release unreadable");
              }
              return released;
            },
          },
        }),
  });

  const writeLockfile = (lockPath: string) => {
    if (malformed.has(lockPath)) {
      tree.write(lockPath, "dependencies: not-a-list\n");
      return;
    }
    const entries = lockfiles.get(lockPath) ?? new Map();
    const blocks = [...entries].map(([name, hashes]) =>
      [
        `  - virtual_path: .apm/skills/${name}`,
        "    package_type: claude_skill",
        "    resolved_ref: v0.5.1",
        ...(Object.keys(hashes).length === 0
          ? []
          : [
              "    deployed_file_hashes:",
              ...Object.entries(hashes).map(
                ([rel, hash]) => `      ${rel}: ${hash}`,
              ),
            ]),
        "    content_hash: sha256:opaque",
      ].join("\n"),
    );
    tree.write(
      lockPath,
      blocks.length === 0
        ? "dependencies: []\n"
        : ["dependencies:", ...blocks, ""].join("\n"),
    );
  };

  // Puts `name`'s copy at `target` into `states`. Each tool folder holds the
  // same skill file; the record is taken before any edit, so an edit diverges.
  const setCopy = (target: DeployTarget, name: string, states: CopyStates) => {
    const root = treeRoot(target);
    const lockPath = lockfilePath(target);
    const entries =
      lockfiles.get(lockPath) ?? new Map<string, Record<string, string>>();
    lockfiles.set(lockPath, entries);
    malformed.delete(lockPath);
    const folder = (tool: SupportedTool) =>
      `${root}/${deployTargetSubtrees(name, [tool])[0]}`;
    for (const tool of TOOLS) {
      tree.remove(folder(tool));
    }
    const skillFile = (tool: SupportedTool) => `${folder(tool)}/SKILL.md`;

    if (states === "not-deployed") {
      entries.delete(name);
    } else if (states === "lockfile-malformed") {
      for (const tool of TOOLS) {
        tree.write(skillFile(tool), `${name}\n`);
      }
      malformed.add(lockPath);
    } else if (states === "unreadable") {
      // A file where the skill directory belongs.
      tree.write(folder("claude"), "not a directory\n");
      entries.set(name, {});
    } else {
      const perTool: Record<SupportedTool, ToolCopyState> =
        typeof states === "string"
          ? {
              claude: toolState(states),
              codex: toolState(states),
            }
          : {
              claude: states.claude ?? "clean",
              codex: states.codex ?? "clean",
            };
      for (const tool of TOOLS) {
        if (perTool[tool] !== "not-deployed") {
          tree.write(skillFile(tool), `${name}\n`);
        }
      }
      const recorded = Object.fromEntries(
        TOOLS.filter((tool) =>
          ["clean", "diverged", "deleted"].includes(perTool[tool]),
        ).flatMap((tool) =>
          tree
            .filePaths()
            .filter((abs) => abs.startsWith(`${folder(tool)}/`))
            .map((abs) => [
              abs.slice(root.length + 1),
              sha(tree.read(abs) ?? Buffer.alloc(0)),
            ]),
        ),
      );
      entries.set(name, recorded);
      for (const tool of TOOLS) {
        if (perTool[tool] === "diverged") {
          tree.write(skillFile(tool), `${name}, edited\n`);
        }
        if (perTool[tool] === "deleted") {
          tree.remove(folder(tool));
        }
      }
    }
    writeLockfile(lockPath);
  };

  // A local edit, as the user would make it, after the copy was recorded.
  const editFile = (path: string, contents: string) =>
    tree.write(path, contents);

  // The file hashes the fake's lockfile records for `name`'s copy, for a test
  // whose own lockfile must agree with it.
  const recordedHashes = (target: DeployTarget, name: string) => ({
    ...lockfiles.get(lockfilePath(target))?.get(name),
  });

  return {
    tree,
    content,
    setCopy,
    editFile,
    lockfilePath,
    treeRoot,
    recordedHashes,
  };
}

// What one whole-copy state means for each tool folder.
function toolState(state: DeployedContentState): ToolCopyState {
  switch (state) {
    case "diverged":
      return "diverged";
    case "unverifiable":
      return "unverifiable";
    case "not-deployed":
      return "not-deployed";
    default:
      return "clean";
  }
}

// The fake with each listed copy already in its state.
export function deployedCopies(
  copies: { target: DeployTarget; name: string; state: CopyStates }[],
) {
  const fake = inMemoryDeployedContent();
  for (const copy of copies) {
    fake.setCopy(copy.target, copy.name, copy.state);
  }
  return fake;
}

// Every copy the use case reads is placed in `states` on first read, for tests
// that care about the verdict's effect, not about which skill it lands on.
export function copiesIn(states: CopyStates | ((name: string) => CopyStates)) {
  const fake = inMemoryDeployedContent();
  const placed = new Set<string>();
  const place = (target: DeployTarget, name: string) => {
    const key = `${fake.treeRoot(target)}/${name}`;
    if (placed.has(key)) {
      return false;
    }
    placed.add(key);
    fake.setCopy(
      target,
      name,
      typeof states === "function" ? states(name) : states,
    );
    return true;
  };
  const onRead = placedOnRead(fake.content, place);
  return {
    ...fake,
    content: {
      readLockfile: onRead.readLockfile,
      classify: onRead.classify,
      contentDigest: (
        input: Parameters<typeof fake.content.contentDigest>[0],
      ) => {
        onRead.place(input.target, input.name);
        return fake.content.contentDigest(input);
      },
      linkedSkillPath: (
        input: Parameters<typeof fake.content.linkedSkillPath>[0],
      ) => fake.content.linkedSkillPath(input),
    },
  };
}
