import type {
  GlobalDeployStateReader,
  ReadDrift,
  Registry,
} from "@maestro/core";
import type { Context } from "hono";

type RegisteredRepoRouteDeps = {
  registry: Pick<Registry, "resolveRegistered">;
  deployState: Pick<GlobalDeployStateReader, "read">;
  drift: Pick<ReadDrift, "execute">;
};

type RegisteredRepoAccess = {
  readDeployState: () => ReturnType<GlobalDeployStateReader["read"]>;
  readDrift: () => ReturnType<ReadDrift["execute"]>;
};

type RegisteredRepoGate =
  | { ok: false; response: Response }
  | { ok: true; repo: RegisteredRepoAccess };

// Readers receive the canonical path from the registry, never the query string.
export async function requireRegisteredRepo(
  c: Context,
  deps: RegisteredRepoRouteDeps,
): Promise<RegisteredRepoGate> {
  const input = c.req.query("repo");
  if (input === undefined || input.trim() === "") {
    return { ok: false, response: c.json({ error: "missing-repo" }, 400) };
  }

  const registered = await deps.registry.resolveRegistered(input);
  if (registered === undefined) {
    return {
      ok: false,
      response: c.json({ error: "not-registered" }, 403),
    };
  }

  return {
    ok: true,
    repo: {
      readDeployState: () => deps.deployState.read(registered.path),
      readDrift: () =>
        deps.drift.execute({
          target: { kind: "repo", repoPath: registered.path },
        }),
    },
  };
}
