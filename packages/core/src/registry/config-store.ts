// Reads and writes ~/.maestro/config.json. A corrupt config is a blocking
// error, never silently treated as empty (security.md).
import { z } from "zod";
import type { FileSystemPort } from "./file-system";

const configSchema = z.object({
  repos: z.array(z.object({ path: z.string() })),
  // Absent on a fresh config; the inventory then falls back to the env var.
  inventoryPath: z.string().optional(),
  // How the connected Harness's last fetch went, and when one last succeeded.
  // Absent until the Harness view has fetched once.
  // Read as absent when it does not parse, unlike the rest of the config: this
  // is a cache of how the last fetch went, so a record left by an older shape
  // or a hand-edited timestamp costs an age label, never the whole cockpit.
  harnessFreshness: z
    .object({
      // Which harness the record belongs to, so a reconnect cannot inherit it.
      root: z.string(),
      outcome: z.enum(["fetched", "offline", "fetch-failed"]).nullable(),
      // An ISO moment or nothing: a hand-edited "yesterday" reaches a date
      // formatter and throws, taking the Harness view down (#516).
      lastFetchedAt: z.iso.datetime().nullable(),
    })
    .optional()
    .catch(undefined),
  // The unfinished Deploy or Remove per target, so recovery survives a restart
  // (ADR-0031, #951). Read as absent when it does not parse, like the record
  // above: a record left by an older shape costs one retry offer, and the disk
  // rather than this list is what says whether a skill is deployed.
  targetOperations: z
    .array(
      z.object({
        key: z.string(),
        target: z.discriminatedUnion("kind", [
          z.object({ kind: z.literal("repo"), repoPath: z.string() }),
          z.object({ kind: z.literal("global") }),
        ]),
        harness: z.string(),
        kind: z.enum(["deploy", "remove"]),
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

// Blocking and recoverable, so the cockpit never silently discards a registry.
export class ConfigError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ConfigError";
  }
}

export class ConfigStore {
  private readonly fs: FileSystemPort;
  // A thunk, so MAESTRO_HOME is read per access and never frozen at
  // construction.
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

  // The one serialized read-modify-write. Every writer rewrites the whole
  // file, so two landing at once would silently drop one of them; a promise
  // chain is enough because a single server owns the file.
  // Return no `config` to leave the file untouched (a refused change).
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
