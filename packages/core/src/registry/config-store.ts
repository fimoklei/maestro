// A corrupt config is a blocking error, never silently treated as empty.
import { z } from "zod";
import type { FileSystemPort } from "./file-system";

const configSchema = z.object({
  repos: z.array(z.object({ path: z.string() })),
  inventoryPath: z.string().optional(),
  // Unlike the rest, read as absent when it does not parse: a stale shape
  // costs an age label, never the whole cockpit.
  harnessFreshness: z
    .object({
      // So a reconnect cannot inherit another harness's record.
      root: z.string(),
      outcome: z.enum(["fetched", "offline", "fetch-failed"]).nullable(),
      // A non-ISO value would throw in the date formatter (#516).
      lastFetchedAt: z.iso.datetime().nullable(),
    })
    .optional()
    .catch(undefined),
  // Unfinished operations per target (#951). Absent when it does not parse:
  // the disk, not this list, says what is deployed.
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
});

export type MaestroConfig = z.infer<typeof configSchema>;

export class ConfigError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ConfigError";
  }
}

export class ConfigStore {
  private readonly fs: FileSystemPort;
  private readonly resolvePath: () => string;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(deps: { fs: FileSystemPort; configPath: () => string }) {
    this.fs = deps.fs;
    this.resolvePath = deps.configPath;
  }

  async read(): Promise<MaestroConfig> {
    const configPath = this.resolvePath();
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

  // The one serialized read-modify-write: two concurrent writers would drop
  // one. Return no `config` to leave the file untouched.
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
    // Keep the chain alive when an update rejects.
    this.tail = next.catch(() => undefined);
    return next;
  }

  async write(config: MaestroConfig): Promise<void> {
    await this.fs.writeFile(
      this.resolvePath(),
      JSON.stringify(config, null, 2),
    );
  }
}
