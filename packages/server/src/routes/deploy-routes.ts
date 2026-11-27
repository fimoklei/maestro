import type { LinkedDestination } from "@maestro/core";
import type { Hono } from "hono";
import type { AppDeps } from "../app-deps";
import {
  deployErrorResponses,
  importLocalEditsErrorResponses,
  removeErrorResponses,
  removePreflightErrorResponses,
  retryOperationErrorResponses,
  updatePreviewErrorResponses,
  updateRunErrorResponses,
} from "../error-responses";
import { checkedPrimitives, githubPageField } from "../github-page-response";
import { requireRegisteredRepo } from "../registered-repo-route";
import { cardReadingFields } from "../release-head-response";
import {
  BULK_DEPLOY_BODY,
  BULK_REMOVE_BODY,
  bulkDeployBodySchema,
  bulkRemoveBodySchema,
  DEPLOY_AGAIN_BODY,
  deployAgainBodySchema,
  deployBodySchema,
  IMPORT_LOCAL_EDITS_BODY,
  IMPORT_LOCAL_EDITS_CHECK_BODY,
  importLocalEditsBodySchema,
  importLocalEditsCheckBodySchema,
  parseBody,
  removeBodySchema,
  retryOperationBodySchema,
  TARGET_BODY,
  UPDATE_BODY,
  UPDATE_TARGET_BODY,
  updateBodySchema,
  updatePreflightBodySchema,
} from "../request-bodies";
import { updatePreviewBody } from "../update-preview-response";
import { reportField, writeReportBody } from "../write-report-response";

const refusalBody = (result: {
  copyReceipt?: string;
  linked?: LinkedDestination;
}) => ({
  ...(result.linked ? { linked: result.linked } : {}),
  ...(result.copyReceipt ? { copyReceipt: result.copyReceipt } : {}),
});

const editedFoldersBody = (result: {
  folders?: string[];
  notWritten?: string[];
}) => ({
  ...(result.folders ? { folders: result.folders } : {}),
  ...(result.notWritten ? { notWritten: result.notWritten } : {}),
});

type Deps = Pick<
  AppDeps,
  | "registry"
  | "deployState"
  | "deploy"
  | "importLocalEdits"
  | "remove"
  | "update"
  | "retryOperation"
  | "drift"
  | "resolveGlobalRoot"
>;

const driftFailureBody = (result: { reason?: "unverified" | "timed-out" }) =>
  result.reason
    ? { ok: false as const, reason: result.reason }
    : { ok: false as const };

export function registerDeployRoutes(app: Hono, deps: Deps) {
  app.get("/api/deploy-state", async (c) => {
    const gate = await requireRegisteredRepo(c, deps.registry);
    if (!gate.ok) {
      return gate.response;
    }
    const result = await deps.deployState.read(gate.path);
    if (!result.ok) {
      return c.json({ error: result.error }, 422);
    }
    return c.json({
      primitives: checkedPrimitives(result.primitives),
      skipped: result.skipped,
      ...(result.pendingOperation
        ? { pendingOperation: result.pendingOperation }
        : {}),
      ...cardReadingFields(result),
      ...githubPageField("github", result.github),
      ...githubPageField("releaseGitHub", result.releaseGitHub),
      ...githubPageField("latestReleaseGitHub", result.latestReleaseGitHub),
    });
  });

  app.get("/api/deploy-state/global", async (c) => {
    const result = await deps.deployState.readGlobal(deps.resolveGlobalRoot());
    if (!result.ok) {
      return c.json({ error: result.error }, 422);
    }
    return c.json({
      primitives: checkedPrimitives(result.primitives),
      folders: result.folders.map(({ primitives, ...folder }) => ({
        ...folder,
        primitives: checkedPrimitives(primitives),
      })),
      ...cardReadingFields(result),
      ...githubPageField("releaseGitHub", result.releaseGitHub),
      ...githubPageField("latestReleaseGitHub", result.latestReleaseGitHub),
      skipped: result.skipped,
      otherOrigins: result.otherOrigins,
      ...(result.pendingOperation
        ? { pendingOperation: result.pendingOperation }
        : {}),
    });
  });

  app.post("/api/deploy", async (c) => {
    const body = await parseBody(c, deployBodySchema, TARGET_BODY);
    if (!body.ok) {
      return body.response;
    }

    const result = await deps.deploy.execute(body.data);
    if (!result.ok) {
      const { status } = deployErrorResponses[result.error];
      return c.json({ error: result.error, ...refusalBody(result) }, status);
    }
    return c.json({
      deployed: result.deployed,
      ...reportField(result.report),
    });
  });

  app.post("/api/deploy/remove", async (c) => {
    const body = await parseBody(c, removeBodySchema, TARGET_BODY);
    if (!body.ok) {
      return body.response;
    }

    const result = await deps.remove.execute(body.data);
    if (!result.ok) {
      const { status } = removeErrorResponses[result.error];
      return c.json(
        {
          error: result.error,
          ...reportField(result.report),
          ...(result.check && result.receipt
            ? { check: result.check, receipt: result.receipt }
            : {}),
          ...editedFoldersBody(result),
          ...refusalBody(result),
        },
        status,
      );
    }
    return c.json({ removed: result.removed, ...reportField(result.report) });
  });

  app.post("/api/deploy/remove/preflight", async (c) => {
    const body = await parseBody(c, removeBodySchema, TARGET_BODY);
    if (!body.ok) {
      return body.response;
    }

    const result = await deps.remove.preflight(body.data);
    if (!result.ok) {
      const { status } = removePreflightErrorResponses[result.error];
      return c.json(
        {
          error: result.error,
          ...editedFoldersBody(result),
        },
        status,
      );
    }
    return c.json({ check: result.check, receipt: result.receipt });
  });

  app.post("/api/deploy/update/preflight", async (c) => {
    const body = await parseBody(
      c,
      updatePreflightBodySchema,
      UPDATE_TARGET_BODY,
    );
    if (!body.ok) {
      return body.response;
    }

    const result = await deps.update.preview(body.data);
    if (!result.ok) {
      const { status } = updatePreviewErrorResponses[result.error];
      return c.json({ error: result.error, ...refusalBody(result) }, status);
    }
    const preview = updatePreviewBody(result.preview);
    if (preview === null) {
      return c.json({ error: "preview-failed" }, 502);
    }
    return c.json({ preview });
  });

  app.post("/api/deploy/update", async (c) => {
    const body = await parseBody(c, updateBodySchema, UPDATE_BODY);
    if (!body.ok) {
      return body.response;
    }

    const result = await deps.update.run(body.data);
    if (!result.ok) {
      const { status } = updateRunErrorResponses[result.error];
      return c.json(
        {
          error: result.error,
          ...reportField(result.report),
          ...refusalBody(result),
        },
        status,
      );
    }
    const report = writeReportBody(result.report);
    if (report === null) {
      return c.json({ error: "update-failed" }, 502);
    }
    return c.json({ release: result.release, report });
  });

  app.post("/api/deploy/retry", async (c) => {
    const body = await parseBody(c, retryOperationBodySchema, TARGET_BODY);
    if (!body.ok) {
      return body.response;
    }

    const result = await deps.retryOperation.execute(body.data);
    if (!result.ok) {
      const { status } = retryOperationErrorResponses[result.error];
      return c.json(
        {
          error: result.error,
          ...refusalBody(result),
        },
        status,
      );
    }
    return c.json({
      completed: result.completed,
      ...reportField(result.report),
      landed: result.landed,
    });
  });

  app.post("/api/deploy/import-local-edits/check", async (c) => {
    const body = await parseBody(
      c,
      importLocalEditsCheckBodySchema,
      IMPORT_LOCAL_EDITS_CHECK_BODY,
    );
    if (!body.ok) {
      return body.response;
    }
    const result = await deps.importLocalEdits.check(body.data.target);
    if (!result.ok) {
      const { status } = importLocalEditsErrorResponses[result.error];
      return c.json({ error: result.error }, status);
    }
    return c.json({ skills: result.skills });
  });

  app.post("/api/deploy/import-local-edits", async (c) => {
    const body = await parseBody(
      c,
      importLocalEditsBodySchema,
      IMPORT_LOCAL_EDITS_BODY,
    );
    if (!body.ok) {
      return body.response;
    }
    const result = await deps.importLocalEdits.execute(body.data);
    if (!result.ok) {
      const { status } = importLocalEditsErrorResponses[result.error];
      return c.json({ error: result.error }, status);
    }
    return c.json({ outcomes: result.outcomes });
  });

  app.post("/api/deploy/bulk", async (c) => {
    const body = await parseBody(c, bulkDeployBodySchema, BULK_DEPLOY_BODY);
    if (!body.ok) {
      return body.response;
    }

    const { report, ...ran } = await deps.deploy.executeBatch(body.data);
    return c.json({ ...ran, ...reportField(report) });
  });

  app.post("/api/deploy/again", async (c) => {
    const body = await parseBody(c, deployAgainBodySchema, DEPLOY_AGAIN_BODY);
    if (!body.ok) {
      return body.response;
    }

    const { report, ...ran } = await deps.deploy.deployAgain(body.data);
    return c.json({ ...ran, ...reportField(report) });
  });

  app.post("/api/deploy/remove/bulk", async (c) => {
    const body = await parseBody(c, bulkRemoveBodySchema, BULK_REMOVE_BODY);
    if (!body.ok) {
      return body.response;
    }

    const report = await deps.remove.executeBatch(body.data);
    return c.json({
      ...report,
      failed: report.failed.map(({ report: probed, ...row }) => ({
        ...row,
        ...reportField(probed),
      })),
    });
  });

  app.get("/api/drift", async (c) => {
    const gate = await requireRegisteredRepo(c, deps.registry);
    if (!gate.ok) {
      return gate.response;
    }
    const result = await deps.drift.execute({
      target: { kind: "repo", repoPath: gate.path },
    });
    if (!result.ok) {
      return c.json(driftFailureBody(result));
    }
    return c.json({ behind: result.behind });
  });

  app.get("/api/drift/global", async (c) => {
    const result = await deps.drift.execute({
      target: { kind: "global" },
    });
    if (!result.ok) {
      return c.json(driftFailureBody(result));
    }
    return c.json({ behind: result.behind });
  });
}
