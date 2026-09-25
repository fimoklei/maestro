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

// The Harness home base's operations. None takes a path: all resolve and
// canonicalize the single connected harness server-side, so no request can
// point git at a directory of its choosing (security.md).
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

  // A POST: fetching reaches the network and writes refs, so it belongs behind
  // the Origin/Host guard, never on a GET.
  app.post("/api/harness/refresh", async (c) =>
    harnessResponse(c, await deps.harness.refresh(new Date())),
  );

  // The release plan for the consequences-first dialog. A GET: it reads the
  // already-fetched refs and writes nothing — the network re-check at
  // confirmation belongs to a later job (#520). Resolves the harness
  // server-side like the reads above, so no path crosses from the browser.
  app.get("/api/harness/release-plan", async (c) => {
    const result: ReleasePlanResult = await deps.harness.planRelease();
    if (!result.ok) {
      const { status } = releasePlanErrorResponses[result.error];
      return c.json({ error: result.error }, status);
    }
    return c.json(result.plan);
  });

  // Confirming a release: a POST behind the Origin/Host guard, since it
  // reaches the network and pushes a tag. Takes only the chosen step and the
  // plan's previous tag — never a path or a revision — so the server
  // re-reads the remote and computes the exact commit to tag itself, rather
  // than trusting what the browser saw at plan time (#520).
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
      // The refusal carries the plan that replaces it, so the dialog can take
      // a new confirmation without the author leaving it (#521).
      return c.json({ error: result.error, plan: result.recomputed }, status);
    }
    return c.json({ tag: result.tag, revision: result.revision });
  });
}
