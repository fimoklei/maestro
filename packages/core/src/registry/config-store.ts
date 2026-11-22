import { z } from "zod";
import { type FileStamp, type FileSystemPort, sameStamp } from "./file-system";

const configSchema = z.object({
  repos: z.array(z.object({ path: z.string() })),
  inventoryPath: z.string().optional(),
  harnessFreshness: z
    .object({
      root: z.string(),
      outcome: z.enum(["fetched", "offline", "fetch-failed"]).nullable(),
      lastFetchedAt: z.iso.datetime().nullable(),
    })
    .optional()
    .catch(undefined),
  targetOperations: z
    .array(
      z.object({
        key: z.string(),
        target: z.discriminatedUnion("kind", [
          z.object({ kind: z.literal("repo"), repoPath: z.string() }),
          z.object({ kind: z.literal("global") }),
        ]),
        harness: z.string(),
        kind: z.enum(["deploy", "remove", "update"]),
        release: z.string(),
        previous: z.array(z.string()),
        desired: z.array(z.string()),
        tools: z.array(z.enum(["claude", "codex"])).nullable(),
        startedAt: z.iso.datetime(),
      }),
    )
    .optional()
    .catch(undefined),
  categories: z.unknown().optional(),
});

export type MaestroConfig = z.infer<typeof configSchema>;

class ConfigError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ConfigError";
  }
}

type ConfigFs = Pick<FileSystemPort, "readFile" | "writeFile" | "stamp">;

export class ConfigStore {
  private readonly fs: ConfigFs;
  private readonly resolvePath: () => string;
  private tail: Promise<unknown> = Promise.resolve();
  private remembered:
    | { path: string; stamp: FileStamp; config: MaestroConfig }
    | undefined;

  constructor(deps: { fs: ConfigFs; configPath: () => string }) {
    this.fs = deps.fs;
    this.resolvePath = deps.configPath;
  }

  async read(): Promise<MaestroConfig> {
    const configPath = this.resolvePath();
    // Stamped before the read: a write in between leaves a stale stamp, which
    // only costs one extra read later.
    const stamp = await this.fs.stamp(configPath);
    const known = this.remembered;
    if (
      stamp !== null &&
      known !== undefined &&
      known.path === configPath &&
      sameStamp(known.stamp, stamp)
    ) {
      return structuredClone(known.config);
    }
    const config = await this.parse(configPath);
    this.remembered =
      stamp === null ? undefined : { path: configPath, stamp, config };
    return structuredClone(config);
  }

  private async parse(configPath: string): Promise<MaestroConfig> {
    const raw = await this.fs.readFile(configPath);
    if (raw === null) {
      return { repos: [] };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (cause) {
      throw new ConfigError(`Config at ${configPath} is not valid JSON.`, {
        cause,
      });
    }

    const result = configSchema.safeParse(parsed);
    if (!result.success) {
      throw new ConfigError(
        `Config at ${configPath} does not match the expected shape.`,
        { cause: result.error },
      );
    }
    return result.data;
  }

  async update<T = void>(
    mutate: (config: MaestroConfig) =>
      | Promise<{ config?: MaestroConfig; result?: T }>
      | {
          config?: MaestroConfig;
          result?: T;
        },
  ): Promise<T> {
    const next = this.tail.then(async () => {
      const { config, result } = await mutate(await this.read());
      if (config !== undefined) {
        await this.write(config);
      }
      return result as T;
    });
    this.tail = next.catch(() => undefined);
    return next;
  }

  async write(config: MaestroConfig): Promise<void> {
    const configPath = this.resolvePath();
    // Dropped first, so a failed write never leaves the old config trusted.
    this.remembered = undefined;
    await this.fs.writeFile(configPath, JSON.stringify(config, null, 2));
  }
}
