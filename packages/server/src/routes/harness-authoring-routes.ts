import type {
  ImportPromptsAnswer,
  PrimitiveRef,
  ProposalSubject,
} from "@maestro/core";
import type { PromptFile } from "@maestro/core/prompt-file";
import type { Context, Hono } from "hono";
import type { AppDeps } from "../app-deps";
import { countPrimitives } from "../count-primitives";
import {
  deletionErrorResponses,
  discardErrorResponses,
  type ErrorTable,
  editPromptErrorResponses,
  importPromptsErrorResponses,
  importSkillsErrorResponses,
  isEditPromptRefusal,
  localDeletionErrorResponses,
  promoteErrorResponses,
  promptWriteErrorResponses,
  proposalErrorResponses,
  readPromptErrorResponses,
  releaseWithdrawalErrorResponses,
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
  IMPORT_PROMPTS_BODY,
  IMPORT_SKILLS_BODY,
  IMPORT_SKILLS_CHECK_BODY,
  importPromptsBodySchema,
  importSkillsBodySchema,
  importSkillsCheckBodySchema,
  LOCAL_DELETION_BODY,
  localDeletionBodySchema,
  PATH_BODY,
  PROMOTE_BODY,
  PROMPT_CHECK_BODY,
  PROMPT_EDIT_BODY,
  PROMPT_READ_BODY,
  PROPOSAL_BODY,
  PROPOSAL_CREATE_BODY,
  parseBody,
  primitiveRefBodySchema,
  promptCheckBodySchema,
  promptEditBodySchema,
  promptReadBodySchema,
  proposalBodySchema,
  RELEASE_WITHDRAWAL_BODY,
  RELEASE_WITHDRAWAL_CHECK_BODY,
  RESTORE_BODY,
  releaseWithdrawalBodySchema,
  releaseWithdrawalCheckBodySchema,
  restoreBodySchema,
  WITHDRAW_BODY,
  WITHDRAW_CHECK_BODY,
  withdrawBodySchema,
} from "../request-bodies";

type Deps = Pick<
  AppDeps,
  | "inventory"
  | "promote"
  | "promoteDeletion"
  | "deleteLocal"
  | "restore"
  | "discard"
  | "withdrawFromRelease"
  | "proposals"
  | "importSkills"
  | "importPrompt"
  | "scaffold"
>;

const refOf = ({ type, name }: PrimitiveRef): PrimitiveRef => ({ type, name });

const subjectOf = (body: ProposalSubject): ProposalSubject =>
  body.type === "categories" ? { type: body.type } : refOf(body);

export function registerHarnessAuthoringRoutes(app: Hono, deps: Deps) {
  app.post("/api/harness/promote", async (c) => {
    const body = await parseBody(c, primitiveRefBodySchema, PROMOTE_BODY);
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

  app.post("/api/harness/release/withdraw/check", async (c) => {
    const body = await parseBody(
      c,
      releaseWithdrawalCheckBodySchema,
      RELEASE_WITHDRAWAL_CHECK_BODY,
    );
    if (!body.ok) {
      return body.response;
    }
    const result = await deps.withdrawFromRelease.inspect(subjectOf(body.data));
    if (!result.ok) {
      const { status } = releaseWithdrawalErrorResponses[result.error];
      return c.json({ error: result.error }, status);
    }
    return c.json({ confirmation: result.confirmation });
  });

  app.post("/api/harness/release/withdraw", async (c) => {
    const body = await parseBody(
      c,
      releaseWithdrawalBodySchema,
      RELEASE_WITHDRAWAL_BODY,
    );
    if (!body.ok) {
      return body.response;
    }
    const result = await deps.withdrawFromRelease.execute(
      subjectOf(body.data),
      body.data.confirmation,
    );
    if (!result.ok) {
      const { status } = releaseWithdrawalErrorResponses[result.error];
      return c.json({ error: result.error }, status);
    }
    return c.json({ name: result.name });
  });

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
    const body = await parseBody(
      c,
      primitiveRefBodySchema,
      PROPOSAL_CREATE_BODY,
    );
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
    const body = await parseBody(c, withdrawBodySchema, WITHDRAW_BODY);
    if (!body.ok) {
      return body.response;
    }
    return proposalResponse(
      c,
      await deps.proposals.withdraw(subjectOf(body.data), body.data.number),
      withdrawErrorResponses,
    );
  });

  app.post("/api/harness/proposal/withdraw/check", async (c) => {
    const body = await parseBody(
      c,
      primitiveRefBodySchema,
      WITHDRAW_CHECK_BODY,
    );
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

  app.post("/api/harness/import/skills/check", async (c) => {
    const body = await parseBody(
      c,
      importSkillsCheckBodySchema,
      IMPORT_SKILLS_CHECK_BODY,
    );
    if (!body.ok) {
      return body.response;
    }
    const result = await deps.importSkills.scan(body.data.source);
    if (!result.ok) {
      const { status } = importSkillsErrorResponses[result.error];
      return c.json({ error: result.error }, status);
    }
    return c.json(result.scan);
  });

  app.post("/api/harness/import/skills", async (c) => {
    const body = await parseBody(c, importSkillsBodySchema, IMPORT_SKILLS_BODY);
    if (!body.ok) {
      return body.response;
    }
    const result = await deps.importSkills.execute(body.data);
    if (!result.ok) {
      const { status } = importSkillsErrorResponses[result.error];
      return c.json({ error: result.error }, status);
    }
    return c.json({ outcomes: result.outcomes });
  });

  app.post("/api/harness/prompt/check", async (c) => {
    const body = await parseBody(c, promptCheckBodySchema, PROMPT_CHECK_BODY);
    if (!body.ok) {
      return body.response;
    }
    const result = await deps.importPrompt.check(body.data.name);
    if (!result.ok) {
      const { status } = promptWriteErrorResponses[result.error];
      return c.json({ error: result.error }, status);
    }
    return c.json(result.check);
  });

  app.post("/api/harness/prompts/import", async (c) => {
    const body = await parseBody(
      c,
      importPromptsBodySchema,
      IMPORT_PROMPTS_BODY,
    );
    if (!body.ok) {
      return body.response;
    }
    const result = await deps.importPrompt.importMany(body.data.prompts);
    if (!result.ok) {
      const { status } = importPromptsErrorResponses[result.error];
      return c.json({ error: result.error }, status);
    }
    return c.json({
      outcomes: result.outcomes,
    } satisfies ImportPromptsAnswer);
  });

  app.post("/api/harness/prompt/read", async (c) => {
    const body = await parseBody(c, promptReadBodySchema, PROMPT_READ_BODY);
    if (!body.ok) {
      return body.response;
    }
    const result = await deps.importPrompt.read(body.data.name);
    if (!result.ok) {
      const { status } = readPromptErrorResponses[result.error];
      return c.json({ error: result.error }, status);
    }
    return c.json(result.prompt satisfies PromptFile);
  });

  app.post("/api/harness/prompt/edit", async (c) => {
    const body = await parseBody(c, promptEditBodySchema, PROMPT_EDIT_BODY);
    if (!body.ok) {
      return body.response;
    }
    const result = await deps.importPrompt.edit(body.data);
    if (!result.ok) {
      if (!isEditPromptRefusal(result.error)) {
        return c.json({ error: "invalid-body", ...PROMPT_EDIT_BODY }, 400);
      }
      const { status } = editPromptErrorResponses[result.error];
      return c.json({ error: result.error }, status);
    }
    return c.json({ name: result.name });
  });

  app.post("/api/harness/scaffold", async (c) => {
    const body = await parseBody(c, connectBodySchema, PATH_BODY);
    if (!body.ok) {
      return body.response;
    }

    const result = await deps.scaffold.scaffold(body.data.path);
    if (!result.ok) {
      const { status } = scaffoldErrorResponses[result.error];
      if (result.error === "path-occupied") {
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
