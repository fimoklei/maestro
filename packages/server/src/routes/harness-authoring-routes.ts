import type {
  PromoteDeletionResult,
  PromoteSkillResult,
  ProposalActionResult,
} from "@maestro/core";
import type { Context, Hono } from "hono";
import type { AppDeps } from "../app-deps";
import { countPrimitives } from "../count-primitives";
import {
  deletionErrorResponses,
  importErrorResponses,
  promoteErrorResponses,
  proposalErrorResponses,
  scaffoldErrorResponses,
} from "../error-responses";
import {
  connectBodySchema,
  DELETION_BODY,
  deletionBodySchema,
  IMPORT_BODY,
  importBodySchema,
  PATH_BODY,
  PROMOTE_BODY,
  PROPOSAL_BODY,
  PROPOSAL_CREATE_BODY,
  parseBody,
  promoteBodySchema,
  proposalBodySchema,
} from "../request-bodies";

type Deps = Pick<
  AppDeps,
  | "inventory"
  | "promote"
  | "promoteDeletion"
  | "proposals"
  | "importSkill"
  | "scaffold"
>;

// Everything that changes what the connected Harness holds: a promotion, its
// pull request, an import, and the scaffold that creates a harness.
export function registerHarnessAuthoringRoutes(app: Hono, deps: Deps) {
  // Promoting one skill: a POST behind the Origin/Host guard, since it fetches
  // and pushes. Takes the skill's name and nothing else — the harness is
  // resolved server-side, and the reply carries the branch and the link that
  // opens GitHub's own pull-request flow (#577).
  app.post("/api/harness/promote", async (c) => {
    const body = await parseBody(c, promoteBodySchema, PROMOTE_BODY);
    if (!body.ok) {
      return body.response;
    }
    const result: PromoteSkillResult = await deps.promote.execute(
      body.data.name,
      new Date(),
    );
    if (!result.ok) {
      const { status } = promoteErrorResponses[result.error];
      return c.json({ error: result.error }, status);
    }
    return c.json({
      branch: result.branch,
      pullRequestUrl: result.pullRequestUrl,
    });
  });

  // Publishing a skill's removal: the same POST one step stricter. The body
  // carries the origin/HEAD tree the author confirmed against, so a remote
  // that moved under it is refused rather than removed (#580).
  app.post("/api/harness/promote/deletion", async (c) => {
    const body = await parseBody(c, deletionBodySchema, DELETION_BODY);
    if (!body.ok) {
      return body.response;
    }
    const result: PromoteDeletionResult = await deps.promoteDeletion.execute(
      body.data.name,
      body.data.seenRemoteTree,
      new Date(),
    );
    if (!result.ok) {
      const { status } = deletionErrorResponses[result.error];
      return c.json({ error: result.error }, status);
    }
    return c.json({
      branch: result.branch,
      pullRequestUrl: result.pullRequestUrl,
    });
  });

  // The three mutations that touch only GitHub. Each rechecks identity and the
  // request against a fresh read, so the browser's picture authorizes nothing.
  const proposalResponse = (c: Context, result: ProposalActionResult) => {
    if (!result.ok) {
      const { status } = proposalErrorResponses[result.error];
      return c.json({ error: result.error }, status);
    }
    return c.json({ ok: true });
  };

  app.post("/api/harness/proposal/create", async (c) => {
    const body = await parseBody(c, promoteBodySchema, PROPOSAL_CREATE_BODY);
    if (!body.ok) {
      return body.response;
    }
    return proposalResponse(c, await deps.proposals.create(body.data.name));
  });

  app.post("/api/harness/proposal/reopen", async (c) => {
    const body = await parseBody(c, proposalBodySchema, PROPOSAL_BODY);
    if (!body.ok) {
      return body.response;
    }
    return proposalResponse(
      c,
      await deps.proposals.reopen(body.data.name, body.data.number),
    );
  });

  app.post("/api/harness/proposal/withdraw", async (c) => {
    const body = await parseBody(c, proposalBodySchema, PROPOSAL_BODY);
    if (!body.ok) {
      return body.response;
    }
    return proposalResponse(
      c,
      await deps.proposals.withdraw(body.data.name, body.data.number),
    );
  });

  // What Import would do, before it does it: the proposed name, the refusals,
  // and the advisory findings. A POST like every other path-taking read, so the
  // Origin/Host guard covers it. A refusal is data here, not a failure — only
  // an unconnected harness is a status.
  app.post("/api/harness/import/check", async (c) => {
    const body = await parseBody(c, importBodySchema, IMPORT_BODY);
    if (!body.ok) {
      return body.response;
    }

    const result = await deps.importSkill.check(body.data);
    if (!result.ok) {
      const { status } = importErrorResponses[result.error];
      return c.json({ error: result.error }, status);
    }
    return c.json(result.check);
  });

  // Importing itself. Re-judges everything the check judged, so a source or a
  // harness that moved since is refused rather than copied (security.md).
  app.post("/api/harness/import", async (c) => {
    const body = await parseBody(c, importBodySchema, IMPORT_BODY);
    if (!body.ok) {
      return body.response;
    }

    const result = await deps.importSkill.execute(body.data);
    if (!result.ok) {
      const { status } = importErrorResponses[result.error];
      return c.json({ error: result.error }, status);
    }
    return c.json({
      mode: result.mode,
      name: result.name,
      skipped: result.skipped,
    });
  });

  // Accepting the scaffold offer connect handed out. The path is re-checked
  // from scratch in core — this endpoint takes one from the client, and the
  // offer that carried it is not evidence (security.md, #556).
  app.post("/api/harness/scaffold", async (c) => {
    const body = await parseBody(c, connectBodySchema, PATH_BODY);
    if (!body.ok) {
      return body.response;
    }

    const result = await deps.scaffold.scaffold(body.data.path);
    if (!result.ok) {
      const { status } = scaffoldErrorResponses[result.error];
      if (result.error === "path-occupied") {
        // Repository-relative, and nothing else about the repository.
        return c.json({ error: result.error, path: result.path }, status);
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
