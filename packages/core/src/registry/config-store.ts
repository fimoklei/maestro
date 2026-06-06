// Reads and writes ~/.maestro/config.json — the single persisted home of the
// consuming-repo registry. The path is injected so tests use a temp dir and
// production points at the real home. External data is untrusted: parse →
// Zod-validate → use; a corrupt config is a blocking error, never silently
// treated as empty (see .claude/rules/security.md).
import { z } from "zod";
import type { FileSystemPort } from "./file-system";

const configSchema = z.object({
  repos: z.array(z.object({ path: z.string() })),
});

export type MaestroConfig = z.infer<typeof configSchema>;

// Raised when ~/.maestro/config.json exists but cannot be trusted (unparseable
// or wrong shape). Surfaced as a blocking, recoverable error so the cockpit
// never silently discards a user's registry.
export class ConfigError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ConfigError";
  }
}

export class ConfigStore {
  private readonly fs: FileSystemPort;
  // A thunk so the path is resolved per access, never frozen at construction:
  // the default app can defer reading MAESTRO_HOME until a request arrives.
  private readonly resolvePath: () => string;

  constructor(deps: {
    fs: FileSystemPort;
    configPath: string | (() => string);
  }) {
    this.fs = deps.fs;
    const { configPath } = deps;
    this.resolvePath =
      typeof configPath === "function" ? configPath : () => configPath;
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
