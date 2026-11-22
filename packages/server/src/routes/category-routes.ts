import type {
  CategoriesProposalError,
  CategoryResult,
  HarnessCategoriesResult,
} from "@maestro/core";
import type { Context, Hono } from "hono";
import type { AppDeps } from "../app-deps";
import {
  categoriesProposalErrorResponses,
  categoryErrorResponses,
} from "../error-responses";
import {
  ADD_CATEGORY_BODY,
  ASSIGN_CATEGORY_BODY,
  addCategoryBodySchema,
  assignCategoryBodySchema,
  CATEGORIES_PROPOSAL_BODY,
  COPY_CATEGORIES_BODY,
  categoriesProposalBodySchema,
  copyCategoriesBodySchema,
  DELETE_CATEGORY_BODY,
  deleteCategoryBodySchema,
  parseBody,
  RENAME_CATEGORY_BODY,
  renameCategoryBodySchema,
} from "../request-bodies";

type Deps = Pick<AppDeps, "categories" | "categoriesProposal">;

const refuse = (c: Context, error: CategoriesProposalError) =>
  c.json({ error }, categoriesProposalErrorResponses[error].status);

const respond = (c: Context, result: CategoryResult) => {
  if (result.ok) {
    const { list, added } = result;
    return c.json({ ...list, ...(added === undefined ? {} : { added }) });
  }
  const { ok: _ok, ...refusal } = result;
  return c.json(refusal, categoryErrorResponses[result.error].status);
};

const respondHarness = (c: Context, result: HarnessCategoriesResult) =>
  result.ok
    ? c.json(result.harness)
    : c.json(
        { error: result.error },
        categoryErrorResponses[result.error].status,
      );

export function registerCategoryRoutes(app: Hono, deps: Deps) {
  app.get("/api/categories", async (c) =>
    respond(c, await deps.categories.read()),
  );

  app.get("/api/categories/harness", async (c) =>
    respondHarness(c, await deps.categories.readHarness()),
  );

  app.post("/api/categories/harness/seen", async (c) =>
    respondHarness(c, await deps.categories.markHarnessSeen()),
  );

  app.get("/api/categories/proposal", async (c) => {
    const result = await deps.categoriesProposal.read();
    return result.ok ? c.json(result.row) : refuse(c, result.error);
  });

  app.get("/api/categories/proposal/preview", async (c) => {
    const result = await deps.categoriesProposal.preview();
    return result.ok ? c.json(result.preview) : refuse(c, result.error);
  });

  app.post("/api/categories/proposal", async (c) => {
    const body = await parseBody(
      c,
      categoriesProposalBodySchema,
      CATEGORIES_PROPOSAL_BODY,
    );
    if (!body.ok) return body.response;
    const result = await deps.categoriesProposal.submit(body.data.previewed);
    return result.ok
      ? c.json({ pullRequest: result.pullRequest })
      : refuse(c, result.error);
  });

  app.post("/api/categories/harness/preview", async (c) => {
    const result = await deps.categories.previewCopy();
    if (result.ok) return c.json(result.preview);
    const { ok: _ok, ...refusal } = result;
    return c.json(refusal, categoryErrorResponses[result.error].status);
  });

  app.post("/api/categories/harness/copy", async (c) => {
    const body = await parseBody(
      c,
      copyCategoriesBodySchema,
      COPY_CATEGORIES_BODY,
    );
    if (!body.ok) return body.response;
    return respond(c, await deps.categories.copyFromHarness(body.data.mode));
  });

  app.post("/api/categories", async (c) => {
    const body = await parseBody(c, addCategoryBodySchema, ADD_CATEGORY_BODY);
    if (!body.ok) return body.response;
    return respond(
      c,
      await deps.categories.change({ kind: "add", name: body.data.name }),
    );
  });

  app.post("/api/categories/rename", async (c) => {
    const body = await parseBody(
      c,
      renameCategoryBodySchema,
      RENAME_CATEGORY_BODY,
    );
    if (!body.ok) return body.response;
    return respond(
      c,
      await deps.categories.change({ kind: "rename", ...body.data }),
    );
  });

  app.post("/api/categories/delete", async (c) => {
    const body = await parseBody(
      c,
      deleteCategoryBodySchema,
      DELETE_CATEGORY_BODY,
    );
    if (!body.ok) return body.response;
    return respond(
      c,
      await deps.categories.change({ kind: "delete", ...body.data }),
    );
  });

  app.post("/api/categories/assign", async (c) => {
    const body = await parseBody(
      c,
      assignCategoryBodySchema,
      ASSIGN_CATEGORY_BODY,
    );
    if (!body.ok) return body.response;
    return respond(
      c,
      await deps.categories.change({ kind: "assign", ...body.data }),
    );
  });
}
