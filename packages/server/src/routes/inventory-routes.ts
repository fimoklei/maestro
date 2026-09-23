import type { Hono } from "hono";
import type { AppDeps } from "../app-deps";
import { countPrimitives } from "../count-primitives";
import { connectErrorResponses } from "../error-responses";
import { connectBodySchema, PATH_BODY, parseBody } from "../request-bodies";

type Deps = Pick<AppDeps, "inventory" | "connect">;

export function registerInventoryRoutes(app: Hono, deps: Deps) {
  app.get("/api/inventory/primitives", async (c) => {
    const result = await deps.inventory.read();
    if (!result.ok) {
      // 409: unset/missing/not-a-directory. 503: connected, but its release
      // could not be read — never the same answer, or the cockpit would send
      // the author to re-connect a live harness (#841). Never echoes the path;
      // the cockpit writes its own words (`inventory-panel.tsx`).
      return c.json(
        { error: result.error },
        result.error === "unreadable" ? 503 : 409,
      );
    }
    return c.json({ primitives: result.primitives });
  });

  // A GET, so it bypasses the Origin/Host guard — returning the user's own
  // configured path is intentional, not an attacker probe.
  app.get("/api/inventory/config", async (c) => {
    return c.json(await deps.inventory.configuredLocation());
  });

  // Connect: a pasted path is persisted offline; a GitHub URL is cloned to a
  // new folder under the home ceiling first and then connected (#554).
  app.post("/api/inventory/connect", async (c) => {
    const body = await parseBody(c, connectBodySchema, PATH_BODY);
    if (!body.ok) {
      return body.response;
    }

    const result = await deps.connect.connect(body.data.path, {
      parent: body.data.parent,
      localOnly: body.data.localOnly,
    });
    if (!result.ok) {
      const { status } = connectErrorResponses[result.error];
      if (result.error === "scaffoldable") {
        return c.json(
          { error: result.error, path: result.scaffoldPath },
          status,
        );
      }
      return c.json({ error: result.error }, status);
    }

    return c.json({
      outcome: result.outcome,
      inventoryPath: result.inventoryPath,
      primitiveCount: await countPrimitives(deps.inventory),
    });
  });
}
