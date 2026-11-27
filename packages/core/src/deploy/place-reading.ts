import {
  type CopyReadingPort,
  readEach,
  type WrittenReading,
} from "./copy-reading";
import type { DeployedContentPort, DeployTarget } from "./deploy-skill";
import {
  type GlobalLayout,
  globalFolders,
  SUPPORTED_TOOLS,
  type SupportedTool,
} from "./deploy-tools";

export type SkillReading =
  | { name: string; reading: "at-release" | "missing" | "not-confirmed" }
  | { name: string; reading: "not-updated"; stillAt: string | null };

type PlaceReading = {
  tool: SupportedTool;
  path: string | null;
  detected: boolean;
  skills: SkillReading[];
};

export type PlaceReadings = {
  release: string | null;
  places: PlaceReading[];
};

const READING_OF = {
  missing: "missing",
  "at-release": "at-release",
  unreadable: "not-confirmed",
} as const;

type Place = Omit<PlaceReading, "skills">;

export class PlaceReader {
  private readonly deps: {
    content: CopyReadingPort & Pick<DeployedContentPort, "readLockfile">;
    releaseTags: () => Promise<readonly string[] | null>;
    globalLayout: () => GlobalLayout;
  };

  constructor(deps: PlaceReader["deps"]) {
    this.deps = deps;
  }

  async read(input: {
    target: DeployTarget;
    release: string | null;
    names: readonly string[];
    tools: readonly SupportedTool[];
  }): Promise<PlaceReadings> {
    const { target } = input;
    const places: Place[] =
      target.kind === "global"
        ? globalFolders(input.tools, this.deps.globalLayout())
        : SUPPORTED_TOOLS.map((tool) => ({ tool, path: null, detected: true }));
    if (input.names.length === 0) {
      return {
        release: input.release,
        places: places.map(({ tool, path, detected }) => ({
          tool,
          path,
          detected,
          skills: [],
        })),
      };
    }
    const [tags, lockfile] = await Promise.all([
      this.deps.releaseTags().catch(() => null),
      this.deps.content
        .readLockfile(target)
        .catch(() => ({ ok: false }) as const),
    ]);
    const session = this.deps.content.openReading({
      target,
      release: input.release ?? undefined,
      tags: tags ?? [],
      lockfile,
    });
    const read: PlaceReading[] = [];
    for (const place of places) {
      const readings = place.detected
        ? await readEach(input.names, (name) =>
            session.readWritten(name, place.tool),
          )
        : new Map<string, WrittenReading | null>();
      read.push({
        tool: place.tool,
        path: place.path,
        detected: place.detected,
        skills: [...readings].map(([name, found]) => {
          const reading = found ?? { kind: "unreadable" };
          return reading.kind === "not-updated"
            ? { name, reading: "not-updated", stillAt: reading.stillAt }
            : { name, reading: READING_OF[reading.kind] };
        }),
      });
    }
    return { release: input.release, places: read };
  }
}
