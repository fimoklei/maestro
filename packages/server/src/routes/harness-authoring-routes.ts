import type {
  DeleteLocalSkillResult,
  PromoteDeletionResult,
  PromoteSkillResult,
  ProposalActionResult,
  RestoreSkillResult,
} from "@maestro/core";
import type { Context, Hono } from "hono";
import type { AppDeps } from "../app-deps";
import { countPrimitives } from "../count-primitives";
import {
  deletionErrorResponses,
  importErrorResponses,
  localDeletionErrorResponses,
  promoteErrorResponses,
  proposalErrorResponses,
  restoreErrorResponses,
  scaffoldErrorResponses,
} from "../error-responses";
import {
  connectBodySchema,
  DELETION_BODY,
  deletionBodySchema,
  IMPORT_BODY,
  importBodySchema,
  LOCAL_DELETION_BODY,
  PATH_BODY,
  PROMOTE_BODY,
  PROPOSAL_BODY,
  PROPOSAL_CREATE_BODY,
  parseBody,
  promoteBodySchema,
  proposalBodySchema,
  RESTORE_BODY,
  restoreBodySchema,
} from "../request-bodies";

type Deps = Pick<
  AppDeps,
  | "inventory"
  | "promote"
  | "promoteDeletion"
  | "deleteLocalSkill"
  | "restoreSkill"
  | "proposals"
  | "importSkill"
  | "scaffold"
>;

export function registerHarnessAuthoringRoutes(app: Hono, deps: Deps) {
  // Takes the skill's name only; the harness is resolved server-side (#577).
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

  // The origin/HEAD tree the author confirmed against, so a remote that moved is refused (#580).
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

  // The name is a claim: core re-reads the local refs and folder before deleting (#798).
  app.post("/api/harness/skill/delete", async (c) => {
    const body = await parseBody(c, promoteBodySchema, LOCAL_DELETION_BODY);
    if (!body.ok) {
      return body.response;
    }
    const result: DeleteLocalSkillResult = await deps.deleteLocalSkill.execute(
      body.data.name,
    );
    if (!result.ok) {
      const { status } = localDeletionErrorResponses[result.error];
      return c.json({ error: result.error }, status);
    }
    return c.json({ name: result.name });
  });

  // The commit is compared with a freshly read HEAD, so the browser names no source.
  app.post("/api/harness/skill/restore", async (c) => {
    const body = await parseBody(c, restoreBodySchema, RESTORE_BODY);
    if (!body.ok) {
      return body.response;
    }
    const result: RestoreSkillResult = await deps.restoreSkill.execute(
      body.data.name,
      body.data.seenHeadCommit,
    );
    if (!result.ok) {
      const { status } = restoreErrorResponses[result.error];
      return c.json({ error: result.error }, status);
    }
    return c.json({ name: result.name, commit: result.commit });
  });

  // Each rechecks identity and the request against a fresh read.
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

  // A refusal is data here, not a failure; only an unconnected harness is a status.
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

  // Re-judges everything the check judged, so a source or harness that moved is refused.
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

  // The path is re-checked from scratch: the offer that carried it is not evidence (#556).
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
