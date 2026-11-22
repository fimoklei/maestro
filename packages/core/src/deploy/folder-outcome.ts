import {
  type CopyReadingPort,
  readEach,
  type WrittenReading,
} from "./copy-reading";
import type { DeployedContentPort } from "./deploy-skill";
import {
  type GlobalLayout,
  globalFolders,
  type SupportedTool,
} from "./deploy-tools";

export type SkillOutcome =
  | { name: string; outcome: "written" | "missing" | "not-confirmed" }
  | { name: string; outcome: "not-updated"; stillAt: string | null };

export type FolderOutcome = {
  path: string;
  tool: SupportedTool;
  detected: boolean;
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

export class FolderOutcomeReader {
  private readonly deps: {
    content: CopyReadingPort & Pick<DeployedContentPort, "readLockfile">;
    releaseTags: () => Promise<readonly string[] | null>;
    globalLayout: () => GlobalLayout;
  };

  constructor(deps: FolderOutcomeReader["deps"]) {
    this.deps = deps;
  }

  async read(input: {
    release: string;
    names: readonly string[];
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
    for (const folder of globalFolders(
      input.written,
      this.deps.globalLayout(),
    )) {
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
