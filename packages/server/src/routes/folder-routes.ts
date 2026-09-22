import type { BrowseSuccess } from "@maestro/core";
import type { Hono } from "hono";
import type { AppDeps } from "../app-deps";
import {
  browseErrorResponses,
  chooseFolderErrorResponses,
} from "../error-responses";
import {
  browseBodySchema,
  chooseFolderBodySchema,
  PATH_BODY,
  parseBody,
  registerBodySchema,
} from "../request-bodies";

type Deps = Pick<AppDeps, "registry" | "browse" | "folderChooser">;

// Naming a folder on disk: the read-only browser that finds one, and the
// registry of consuming repos that records it.
export function registerFolderRoutes(app: Hono, deps: Deps) {
  // Read-only directory browser (ADR-0009). POST deliberately, so the
  // Origin/Host guard covers this widest read surface — a GET would bypass it.
  app.post("/api/filesystem/children", async (c) => {
    const body = await parseBody(c, browseBodySchema, PATH_BODY);
    if (!body.ok) {
      return body.response;
    }

    const result = await deps.browse.browse(body.data.path);
    if (!result.ok) {
      const { status } = browseErrorResponses[result.error];
      return c.json({ error: result.error }, status);
    }

    // `parent` undefined at the home ceiling → JSON.stringify drops the key,
    // which is the "up is disabled" contract. `satisfies` binds this to core's
    // shape so a field added there fails to compile here, not arrives undefined (#156).
    return c.json({
      path: result.path,
      parent: result.parent,
      breadcrumbs: result.breadcrumbs,
      entries: result.entries,
    } satisfies BrowseSuccess);
  });

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
    c.json({ repos: await deps.registry.list() }),
  );

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
}
