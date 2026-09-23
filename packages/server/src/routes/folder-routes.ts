import type { Hono } from "hono";
import type { AppDeps } from "../app-deps";
import { chooseFolderErrorResponses } from "../error-responses";
import {
  chooseFolderBodySchema,
  PATH_BODY,
  parseBody,
  registerBodySchema,
} from "../request-bodies";

type Deps = Pick<AppDeps, "registry" | "folderChooser">;

// Naming a folder on disk: the system folder chooser that finds one, and the
// registry of consuming repos that records it.
export function registerFolderRoutes(app: Hono, deps: Deps) {
  // Whether **Browse** renders at all (ADR-0032 §7).
  app.get("/api/folder-chooser", async (c) =>
    c.json({ available: await deps.folderChooser.available() }),
  );

  // A write: it opens a window on the reader's machine, so the origin-host
  // guard covers it (ADR-0032 §9).
  app.post("/api/folder-chooser", async (c) => {
    const body = await parseBody(c, chooseFolderBodySchema, PATH_BODY);
    if (!body.ok) {
      return body.response;
    }

    const result = await deps.folderChooser.choose(body.data.path);
    if (!result.ok) {
      const { status } = chooseFolderErrorResponses[result.error];
      return c.json({ error: result.error }, status);
    }
    return c.json({ path: result.path });
  });

  app.get("/api/registry/repos", async (c) =>
    c.json({ repos: await deps.registry.listWithStatus() }),
  );

  // Every refusal a registration would give, stated right after a pick
  // (#1009). POST, so the origin-host guard covers this path probe.
  app.post("/api/registry/repos/check", async (c) => {
    const body = await parseBody(c, registerBodySchema, PATH_BODY);
    if (!body.ok) {
      return body.response;
    }

    const result = await deps.registry.check(body.data.path);
    if (!result.ok) {
      return c.json({ error: result.error }, 400);
    }
    return c.json({ path: result.path });
  });

  app.post("/api/registry/repos", async (c) => {
    const body = await parseBody(c, registerBodySchema, PATH_BODY);
    if (!body.ok) {
      return body.response;
    }

    const result = await deps.registry.register(body.data.path);
    if (!result.ok) {
      return c.json({ error: result.error }, 400);
    }

    return c.json({ repos: result.repos }, 201);
  });

  // Matched against the stored list only, so nothing on disk is touched.
  app.delete("/api/registry/repos", async (c) => {
    const body = await parseBody(c, registerBodySchema, PATH_BODY);
    if (!body.ok) {
      return body.response;
    }

    const result = await deps.registry.unregister(body.data.path);
    if (!result.ok) {
      return c.json({ error: result.error }, 404);
    }
    return c.json({ repos: result.repos });
  });
}
