import type { ImportPromptSuccess, PrimitiveRef } from "@maestro/core";
import type { Context, Hono } from "hono";
import type { AppDeps } from "../app-deps";
import { countPrimitives } from "../count-primitives";
import {
  deletionErrorResponses,
  discardErrorResponses,
  type ErrorTable,
  importErrorResponses,
  importPromptErrorResponses,
  isImportPromptRefusal,
  localDeletionErrorResponses,
  promoteErrorResponses,
  proposalErrorResponses,
  restoreErrorResponses,
  scaffoldErrorResponses,
  withdrawErrorResponses,
} from "../error-responses";
import {
  connectBodySchema,
  DELETION_BODY,
  DISCARD_BODY,
  deletionBodySchema,
  discardBodySchema,
  IMPORT_BODY,
  IMPORT_PROMPT_BODY,
  importBodySchema,
  importPromptBodySchema,
  LOCAL_DELETION_BODY,
  localDeletionBodySchema,
  PATH_BODY,
  PROMOTE_BODY,
  PROMPT_CHECK_BODY,
  PROPOSAL_BODY,
  PROPOSAL_CREATE_BODY,
  parseBody,
  promoteBodySchema,
  promptCheckBodySchema,
  proposalBodySchema,
  RESTORE_BODY,
  restoreBodySchema,
  WITHDRAW_CHECK_BODY,
} from "../request-bodies";

type Deps = Pick<
  AppDeps,
  | "inventory"
  | "promote"
  | "promoteDeletion"
  | "deleteLocal"
  | "restore"
  | "discard"
  | "proposals"
  | "importSkill"
  | "importPrompt"
  | "scaffold"
>;

// A body carries more than the item; the use cases take the item alone.
const refOf = ({ type, name }: PrimitiveRef): PrimitiveRef => ({ type, name });

export function registerHarnessAuthoringRoutes(app: Hono, deps: Deps) {
  // Takes the primitive's type and name only; the harness is resolved server-side (#577).
  app.post("/api/harness/promote", async (c) => {
    const body = await parseBody(c, promoteBodySchema, PROMOTE_BODY);
    if (!body.ok) {
      return body.response;
    }
    const result = await deps.promote.execute(refOf(body.data));
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
    const result = await deps.promoteDeletion.execute(
      refOf(body.data),
      body.data.seenRemoteTree,
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

  app.get("/api/harness/primitive/delete/check", async (c) => {
    const result = await deps.deleteLocal.inspect();
    if (!result.ok) {
      const { status } = localDeletionErrorResponses[result.error];
      return c.json({ error: result.error }, status);
    }
    return c.json(result.checks);
  });

  // The name is a claim: core re-reads the local refs and folder before deleting (#798).
  app.post("/api/harness/primitive/delete", async (c) => {
    const body = await parseBody(
      c,
      localDeletionBodySchema,
      LOCAL_DELETION_BODY,
    );
    if (!body.ok) {
      return body.response;
    }
    const result = await deps.deleteLocal.execute(
      refOf(body.data),
      body.data.seenWorkingTree,
    );
    if (!result.ok) {
      const { status } = localDeletionErrorResponses[result.error];
      return c.json({ error: result.error }, status);
    }
    return c.json({ name: result.name });
  });

  // The commit is compared with a freshly read HEAD, so the browser names no source.
  app.post("/api/harness/primitive/restore", async (c) => {
    const body = await parseBody(c, restoreBodySchema, RESTORE_BODY);
    if (!body.ok) {
      return body.response;
    }
    const result = await deps.restore.execute(
      refOf(body.data),
      body.data.seenHeadCommit,
    );
    if (!result.ok) {
      const { status } = restoreErrorResponses[result.error];
      return c.json({ error: result.error }, status);
    }
    return c.json({ name: result.name, commit: result.commit });
  });

  // The tree is the default-branch copy the author confirmed; core refuses one
  // that moved since (#1375).
  app.post("/api/harness/primitive/discard", async (c) => {
    const body = await parseBody(c, discardBodySchema, DISCARD_BODY);
    if (!body.ok) {
      return body.response;
    }
    const result = await deps.discard.execute(
      refOf(body.data),
      body.data.seenRemoteTree,
    );
    if (!result.ok) {
      const { status } = discardErrorResponses[result.error];
      return c.json({ error: result.error }, status);
    }
    return c.json({ name: result.name });
  });

  // Each rechecks identity and the request against a fresh read.
  const proposalResponse = <E extends string>(
    c: Context,
    result: { ok: true } | { ok: false; error: E },
    table: ErrorTable<E>,
  ) => {
    if (!result.ok) {
      const { status } = table[result.error];
      return c.json({ error: result.error }, status);
    }
    return c.json({ ok: true });
  };

  app.post("/api/harness/proposal/create", async (c) => {
    const body = await parseBody(c, promoteBodySchema, PROPOSAL_CREATE_BODY);
    if (!body.ok) {
      return body.response;
    }
    return proposalResponse(
      c,
      await deps.proposals.create(refOf(body.data)),
      proposalErrorResponses,
    );
  });

  app.post("/api/harness/proposal/reopen", async (c) => {
    const body = await parseBody(c, proposalBodySchema, PROPOSAL_BODY);
    if (!body.ok) {
      return body.response;
    }
    return proposalResponse(
      c,
      await deps.proposals.reopen(refOf(body.data), body.data.number),
      proposalErrorResponses,
    );
  });

  app.post("/api/harness/proposal/withdraw", async (c) => {
    const body = await parseBody(c, proposalBodySchema, PROPOSAL_BODY);
    if (!body.ok) {
      return body.response;
    }
    return proposalResponse(
      c,
      await deps.proposals.withdraw(refOf(body.data), body.data.number),
      withdrawErrorResponses,
    );
  });

  // Read for the withdrawal's confirmation; it writes nothing.
  app.post("/api/harness/proposal/withdraw/check", async (c) => {
    const body = await parseBody(c, promoteBodySchema, WITHDRAW_CHECK_BODY);
    if (!body.ok) {
      return body.response;
    }
    const result = await deps.proposals.unproposedFiles(refOf(body.data));
    if (!result.ok) {
      const { status } = proposalErrorResponses[result.error];
      return c.json({ error: result.error }, status);
    }
    return c.json({ files: result.files });
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

  // Free or taken in the Working Harness; an invalid name is data, not a status.
  app.post("/api/harness/prompt/check", async (c) => {
    const body = await parseBody(c, promptCheckBodySchema, PROMPT_CHECK_BODY);
    if (!body.ok) {
      return body.response;
    }
    const result = await deps.importPrompt.check(body.data.name);
    if (!result.ok) {
      const { status } = importPromptErrorResponses[result.error];
      return c.json({ error: result.error }, status);
    }
    return c.json(result.check);
  });

  // Writes into the Working Harness the server resolves; the browser names no path.
  app.post("/api/harness/prompt/import", async (c) => {
    const body = await parseBody(c, importPromptBodySchema, IMPORT_PROMPT_BODY);
    if (!body.ok) {
      return body.response;
    }
    const result = await deps.importPrompt.execute(body.data);
    if (!result.ok) {
      // Core judges the fields again; the schema owns their HTTP refusal.
      if (!isImportPromptRefusal(result.error)) {
        return c.json({ error: "invalid-body", ...IMPORT_PROMPT_BODY }, 400);
      }
      const { status } = importPromptErrorResponses[result.error];
      return c.json({ error: result.error }, status);
    }
    return c.json({
      mode: result.mode,
      name: result.name,
    } satisfies ImportPromptSuccess);
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
