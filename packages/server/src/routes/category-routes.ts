import type { CategoriesProposalError, CategoryResult } from "@maestro/core";
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
  DELETE_CATEGORY_BODY,
  deleteCategoryBodySchema,
  parseBody,
  RENAME_CATEGORY_BODY,
  renameCategoryBodySchema,
} from "../request-bodies";

type Deps = Pick<AppDeps, "categories" | "categoriesProposal">;

const refuse = (c: Context, error: CategoriesProposalError) =>
  c.json({ error }, categoriesProposalErrorResponses[error].status);

// Every route answers the whole list, so the cockpit replaces its cache from it.
const respond = (c: Context, result: CategoryResult) => {
  if (result.ok) {
    const { list, added } = result;
    return c.json({ ...list, ...(added === undefined ? {} : { added }) });
  }
  const { ok: _ok, ...refusal } = result;
  return c.json(refusal, categoryErrorResponses[result.error].status);
};

export function registerCategoryRoutes(app: Hono, deps: Deps) {
  app.get("/api/categories", async (c) =>
    respond(c, await deps.categories.read()),
  );

  app.get("/api/categories/harness", async (c) => {
    const result = await deps.categories.readHarness();
    return result.ok
      ? c.json(result.harness)
      : c.json(
          { error: result.error },
          categoryErrorResponses[result.error].status,
        );
  });

  app.get("/api/categories/proposal", async (c) => {
    const result = await deps.categoriesProposal.read();
    return result.ok ? c.json(result.row) : refuse(c, result.error);
  });

  app.get("/api/categories/proposal/preview", async (c) => {
    const result = await deps.categoriesProposal.preview();
    return result.ok ? c.json(result.preview) : refuse(c, result.error);
  });

  // Takes nothing from the browser: the server reads the list and rechecks
  // every refusal itself.
  app.post("/api/categories/proposal", async (c) => {
    const result = await deps.categoriesProposal.submit();
    return result.ok
      ? c.json({ pullRequest: result.pullRequest })
      : refuse(c, result.error);
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
