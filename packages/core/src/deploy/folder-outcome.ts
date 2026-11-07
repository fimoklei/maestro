import {
  type CopyReadingPort,
  readEach,
  type WrittenReading,
} from "./copy-reading";
import type { DeployedContentPort } from "./deploy-skill";
import { globalFolders, type SupportedTool } from "./deploy-tools";

/** What a Global write left of one skill in one Global folder. */
export type SkillOutcome =
  | { name: string; outcome: "written" | "missing" | "not-confirmed" }
  | { name: string; outcome: "not-updated"; stillAt: string | null };

export type FolderOutcome = {
  /** Home-relative, starting with `~/`, as the screen names it. */
  path: string;
  tool: SupportedTool;
  /** Global writes this folder only while its tool is detected. */
  detected: boolean;
  /** Empty where the tool is not detected: the write skipped its folder. */
  skills: SkillOutcome[];
};

export type FolderOutcomes = {
  release: string;
  folders: FolderOutcome[];
};

const OUTCOME_OF_READING = {
  missing: "missing",
  "at-release": "written",
  unreadable: "not-confirmed",
} as const;

/**
 * The per-folder outcome of a Global write, shared by Deploy and Update target:
 * each (skill, folder) copy measured against the release the write installed.
 */
export class FolderOutcomeReader {
  private readonly deps: {
    content: CopyReadingPort & Pick<DeployedContentPort, "readLockfile">;
    // Newest first; null or a failure names no older release.
    releaseTags: () => Promise<readonly string[] | null>;
  };

  constructor(deps: FolderOutcomeReader["deps"]) {
    this.deps = deps;
  }

  /** Never rejects: a copy nothing could read is `not-confirmed`. */
  async read(input: {
    release: string;
    names: readonly string[];
    /** The tools the write targeted; their folders are read. */
    written: readonly SupportedTool[];
  }): Promise<FolderOutcomes> {
    const target = { kind: "global" } as const;
    const [tags, lockfile] = await Promise.all([
      this.deps.releaseTags().catch(() => null),
      this.deps.content
        .readLockfile(target)
        .catch(() => ({ ok: false }) as const),
    ]);
    const session = this.deps.content.openReading({
      target,
      release: input.release,
      tags: tags ?? [],
      lockfile,
    });
    const folders: FolderOutcome[] = [];
    for (const folder of globalFolders(input.written)) {
      const readings = folder.detected
        ? await readEach(input.names, (name) =>
            session.readWritten(name, folder.tool),
          )
        : new Map<string, WrittenReading | null>();
      const skills: SkillOutcome[] = [...readings].map(([name, read]) => {
        const reading = read ?? { kind: "unreadable" };
        return reading.kind === "not-updated"
          ? { name, outcome: "not-updated", stillAt: reading.stillAt }
          : { name, outcome: OUTCOME_OF_READING[reading.kind] };
      });
      folders.push({
        path: folder.path,
        tool: folder.tool,
        detected: folder.detected,
        skills,
      });
    }
    return { release: input.release, folders };
  }
}
