import type { HarnessStateResult } from "@maestro/core";
import type { Context, Hono } from "hono";
import type { AppDeps } from "../app-deps";
import {
  harnessErrorResponses,
  publishReleaseErrorResponses,
  releasePlanErrorResponses,
} from "../error-responses";
import { githubPageField } from "../github-page-response";
import {
  parseBody,
  publishReleaseBodySchema,
  RELEASE_BODY,
} from "../request-bodies";

type Deps = Pick<AppDeps, "harness" | "publish">;

export function registerHarnessRoutes(app: Hono, deps: Deps) {
  const harnessResponse = (c: Context, result: HarnessStateResult) => {
    if (!result.ok) {
      const { status } = harnessErrorResponses[result.error];
      return c.json({ error: result.error }, status);
    }
    const { github, ...state } = result.state;
    return c.json({ ...state, ...githubPageField("github", github) });
  };

  app.get("/api/harness", async (c) =>
    harnessResponse(c, await deps.harness.execute()),
  );

  app.post("/api/harness/refresh", async (c) =>
    harnessResponse(c, await deps.harness.refresh()),
  );

  app.get("/api/harness/release-plan", async (c) => {
    const result = await deps.harness.planRelease();
    if (!result.ok) {
      const { status } = releasePlanErrorResponses[result.error];
      return c.json({ error: result.error }, status);
    }
    return c.json(result.plan);
  });

  app.post("/api/harness/release", async (c) => {
    const body = await parseBody(c, publishReleaseBodySchema, RELEASE_BODY);
    if (!body.ok) {
      return body.response;
    }
    const result = await deps.publish.execute(body.data);
    if (!result.ok) {
      const { status } = publishReleaseErrorResponses[result.error];
      return c.json({ error: result.error, plan: result.recomputed }, status);
    }
    return c.json({ tag: result.tag, revision: result.revision });
  });
}
