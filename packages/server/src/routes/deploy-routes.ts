import { BulkDeploySkills, BulkRemoveDeployedSkill } from "@maestro/core";
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
import {
  updateOutcomeBody,
  updatePreviewBody,
} from "../update-preview-response";

// Spread into every refusal body (deploy, update, retry), so the next attempt
// licenses exactly the copies the reader was shown (#952). `linkedPath` is
// built by core from the target's own subtrees, never from apm prose.
const refusalBody = (result: {
  copyReceipt?: string;
  linkedPath?: string;
}) => ({
  ...(result.linkedPath ? { linkedPath: result.linkedPath } : {}),
  ...(result.copyReceipt ? { copyReceipt: result.copyReceipt } : {}),
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

// A failed check is a 200 the web maps to a badge, never an HTTP error.
const driftFailureBody = (result: { reason?: "unverified" }) =>
  result.reason
    ? { ok: false as const, reason: result.reason }
    : { ok: false as const };

export function registerDeployRoutes(app: Hono, deps: Deps) {
  // Registry-gated before any filesystem access, so no request reads an arbitrary path.
  app.get("/api/deploy-state", async (c) => {
    const gate = await requireRegisteredRepo(c, deps.registry);
    if (!gate.ok) {
      return gate.response;
    }
    const result = await deps.deployState.read(gate.path);
    if (!result.ok) {
      // 422: lockfile exists but couldn't be read — never a silent empty list.
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
    });
  });

  // The server resolves the root itself; any ?repo is ignored.
  app.get("/api/deploy-state/global", async (c) => {
    const result = await deps.deployState.readGlobal(deps.resolveGlobalRoot());
    if (!result.ok) {
      return c.json({ error: result.error }, 422);
    }
    return c.json({
      tools: result.tools.map(
        ({
          releaseHead,
          pinnedPerSkill,
          extraFiles,
          releaseGitHub,
          primitives,
          ...group
        }) => ({
          ...group,
          primitives: checkedPrimitives(primitives),
          ...cardReadingFields({ releaseHead, pinnedPerSkill, extraFiles }),
          ...githubPageField("releaseGitHub", releaseGitHub),
        }),
      ),
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
    return c.json({ deployed: result.deployed });
  });

  app.post("/api/deploy/remove", async (c) => {
    const body = await parseBody(c, removeBodySchema, TARGET_BODY);
    if (!body.ok) {
      return body.response;
    }

    const result = await deps.remove.execute(body.data);
    if (!result.ok) {
      const { status } = removeErrorResponses[result.error];
      // Omitted, never null: an absent key cannot be mistaken for a proven outcome
      // (#416). The cost and its receipt travel together (#364).
      return c.json(
        {
          error: result.error,
          ...(result.outcome ? { outcome: result.outcome } : {}),
          ...(result.check && result.receipt
            ? {
                check: result.check,
                receipt: result.receipt,
                reclaim: result.reclaim ?? null,
              }
            : {}),
        },
        status,
      );
    }
    return c.json({ removed: result.removed });
  });

  // Never a silent "clean" on a failed check — it answers with its own error (#337).
  app.post("/api/deploy/remove/preflight", async (c) => {
    const body = await parseBody(c, removeBodySchema, TARGET_BODY);
    if (!body.ok) {
      return body.response;
    }

    const result = await deps.remove.preflight(body.data);
    if (!result.ok) {
      const { status } = removePreflightErrorResponses[result.error];
      return c.json({ error: result.error }, status);
    }
    return c.json({
      check: result.check,
      reclaim: result.reclaim,
      receipt: result.receipt,
    });
  });

  // Read-only despite the POST: the target's path travels in the body.
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
    // A preview failing its own shape check does not cross (#416).
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
    // Omitted, never null: a refusal that never reached apm has no outcome (#416).
    const outcome =
      result.ok || result.outcome
        ? updateOutcomeBody(result.ok ? result.outcome : (result.outcome ?? []))
        : null;
    if (!result.ok) {
      const { status } = updateRunErrorResponses[result.error];
      return c.json(
        {
          error: result.error,
          ...(outcome === null ? {} : { outcome }),
          ...refusalBody(result),
        },
        status,
      );
    }
    // An outcome failing its own shape check does not cross (#416).
    if (outcome === null) {
      return c.json({ error: "update-failed" }, 502);
    }
    return c.json({ release: result.release, outcome });
  });

  // Re-runs the release and Selection the server recorded; the client chooses nothing (#951).
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
    return c.json({ completed: result.completed });
  });

  // Read-only despite the POST. Core checks registry membership before any read.
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

  // A per-skill refusal is data in the 200, never an HTTP error.
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

  // Always 200 with a report: a per-skill refusal is data, not an HTTP error.
  const bulkDeploy = new BulkDeploySkills({ deploy: deps.deploy });
  app.post("/api/deploy/bulk", async (c) => {
    const body = await parseBody(c, bulkDeployBodySchema, BULK_DEPLOY_BODY);
    if (!body.ok) {
      return body.response;
    }

    const report = await bulkDeploy.execute(body.data);
    return c.json(report);
  });

  // Always 200 with a report: one target's refusal is data, not an HTTP error.
  const bulkRemove = new BulkRemoveDeployedSkill({ remove: deps.remove });
  app.post("/api/deploy/remove/bulk", async (c) => {
    const body = await parseBody(c, bulkRemoveBodySchema, BULK_REMOVE_BODY);
    if (!body.ok) {
      return body.response;
    }

    const report = await bulkRemove.execute(body.data);
    return c.json(report);
  });

  // Registry-gated like deploy-state.
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

  // No path sent to core; any ?repo is ignored.
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
