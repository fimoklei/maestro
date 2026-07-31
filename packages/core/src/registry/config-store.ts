// Reads and writes ~/.maestro/config.json. A corrupt config is a blocking
// error, never silently treated as empty (security.md).
import { z } from "zod";
import type { FileSystemPort } from "./file-system";

const configSchema = z.object({
  repos: z.array(z.object({ path: z.string() })),
  // Absent on a fresh config; the inventory then falls back to the env var.
  inventoryPath: z.string().optional(),
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

  async write(config: MaestroConfig): Promise<void> {
    await this.fs.writeFile(
      this.resolvePath(),
      JSON.stringify(config, null, 2),
    );
  }
}
