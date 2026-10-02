import type { Registry } from "@maestro/core";
import type { Context } from "hono";

type RegisteredRepoGate =
  | { ok: false; response: Response }
  | { ok: true; path: string };

// Readers take the canonical path from the registry, never the query string.
export async function requireRegisteredRepo(
  c: Context,
  registry: Pick<Registry, "resolveRegistered">,
): Promise<RegisteredRepoGate> {
  const input = c.req.query("repo");
  if (input === undefined || input.trim() === "") {
    return { ok: false, response: c.json({ error: "missing-repo" }, 400) };
  }

  const registered = await registry.resolveRegistered(input);
  if (registered === undefined) {
    return {
      ok: false,
      response: c.json({ error: "not-registered" }, 403),
    };
  }

  return { ok: true, path: registered.path };
}
