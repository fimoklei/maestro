import type {
  HarnessStateResult,
  PublishReleaseResult,
  ReleasePlanResult,
} from "@maestro/core";
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

// No operation takes a path: the one connected harness is resolved server-side.
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

  // A POST: fetching writes refs, so it belongs behind the Origin/Host guard.
  app.post("/api/harness/refresh", async (c) =>
    harnessResponse(c, await deps.harness.refresh(new Date())),
  );

  app.get("/api/harness/release-plan", async (c) => {
    const result: ReleasePlanResult = await deps.harness.planRelease();
    if (!result.ok) {
      const { status } = releasePlanErrorResponses[result.error];
      return c.json({ error: result.error }, status);
    }
    return c.json(result.plan);
  });

  // Takes only the step and previous tag: the server re-reads the remote and
  // computes the commit to tag itself (#520).
  app.post("/api/harness/release", async (c) => {
    const body = await parseBody(c, publishReleaseBodySchema, RELEASE_BODY);
    if (!body.ok) {
      return body.response;
    }
    const result: PublishReleaseResult = await deps.publish.execute(
      body.data,
      new Date(),
    );
    if (!result.ok) {
      const { status } = publishReleaseErrorResponses[result.error];
      // Carries the replacing plan, so the dialog can take a new confirmation (#521).
      return c.json({ error: result.error, plan: result.recomputed }, status);
    }
    return c.json({ tag: result.tag, revision: result.revision });
  });
}
