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

export function registerFolderRoutes(app: Hono, deps: Deps) {
  app.get("/api/folder-chooser", async (c) =>
    c.json({ available: await deps.folderChooser.available() }),
  );

  // A write: it opens a window on the reader's machine, so the guard covers it.
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

  // POST, so the origin-host guard covers this path probe (#1009).
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
