import { BulkDeploySkills, BulkRemoveDeployedSkill } from "@maestro/core";
import type { Context, Hono } from "hono";
import type { AppDeps } from "../app-deps";
import {
  deployErrorResponses,
  removeErrorResponses,
  removePreflightErrorResponses,
  retryOperationErrorResponses,
  updatePreviewErrorResponses,
} from "../error-responses";
import { requireRegisteredRepo } from "../registered-repo-route";
import { cardReadingFields } from "../release-head-response";
import {
  BULK_DEPLOY_BODY,
  BULK_REMOVE_BODY,
  bulkDeployBodySchema,
  bulkRemoveBodySchema,
  deployBodySchema,
  parseBody,
  removeBodySchema,
  retryOperationBodySchema,
  TARGET_BODY,
  UPDATE_TARGET_BODY,
  updatePreflightBodySchema,
} from "../request-bodies";
import { updatePreviewBody } from "../update-preview-response";

type Deps = Pick<
  AppDeps,
  | "registry"
  | "deployState"
  | "deploy"
  | "remove"
  | "update"
  | "retryOperation"
  | "drift"
  | "resolveGlobalRoot"
>;

// A failed check is a 200 the web maps to a badge, never an HTTP error — a
// screen reading "up-to-date" when the check failed would falsely reassure.
const driftFailureBody = (result: { reason?: "unverified" }) =>
  result.reason
    ? { ok: false as const, reason: result.reason }
    : { ok: false as const };

export function registerDeployRoutes(app: Hono, deps: Deps) {
  const requireRegisteredRepoAccess = (c: Context) =>
    requireRegisteredRepo(c, {
      registry: deps.registry,
      deployState: deps.deployState,
      drift: deps.drift,
    });

  // Registry-gated: an unregistered repo is refused before any filesystem
  // access, so a request can never read an arbitrary <path>/apm.lock.yaml.
  app.get("/api/deploy-state", async (c) => {
    const gate = await requireRegisteredRepoAccess(c);
    if (!gate.ok) {
      return gate.response;
    }
    const result = await gate.repo.readDeployState();
    if (!result.ok) {
      // 422: lockfile exists but couldn't be read — never a silent empty list.
      return c.json({ error: result.error }, 422);
    }
    return c.json({
      primitives: result.primitives,
      skipped: result.skipped,
      // Maestro's own record, not an apm reading, so it crosses as it is.
      ...(result.pendingOperation
        ? { pendingOperation: result.pendingOperation }
        : {}),
      ...cardReadingFields(result),
    });
  });

  // Grouped per detected tool (ADR-0011). Server resolves the root itself —
  // any ?repo is ignored. Missing lockfile is an honest empty state; malformed is 422.
  app.get("/api/deploy-state/global", async (c) => {
    const result = await deps.deployState.readGlobal(deps.resolveGlobalRoot());
    if (!result.ok) {
      return c.json({ error: result.error }, 422);
    }
    return c.json({
      tools: result.tools.map(
        ({ releaseHead, pinnedPerSkill, extraFiles, ...group }) => ({
          ...group,
          ...cardReadingFields({ releaseHead, pinnedPerSkill, extraFiles }),
        }),
      ),
      skipped: result.skipped,
      otherOrigins: result.otherOrigins,
      ...(result.pendingOperation
        ? { pendingOperation: result.pendingOperation }
        : {}),
    });
  });

  // Business rules live in core; this route validates shape and maps errors.
  app.post("/api/deploy", async (c) => {
    const body = await parseBody(c, deployBodySchema, TARGET_BODY);
    if (!body.ok) {
      return body.response;
    }

    const result = await deps.deploy.execute(body.data);
    if (!result.ok) {
      const { status } = deployErrorResponses[result.error];
      // The recorded type is one of our own readings of apm's lockfile field,
      // and the linked path one core built from the deploy's own subtrees —
      // never a line of apm prose (ADR-0018, security.md).
      return c.json(
        {
          error: result.error,
          ...(result.packageType ? { packageType: result.packageType } : {}),
          ...(result.linkedPath ? { linkedPath: result.linkedPath } : {}),
          // The consent this refusal minted, so the reader's next attempt
          // licenses exactly the copies they were shown (#952).
          ...(result.copyReceipt ? { copyReceipt: result.copyReceipt } : {}),
        },
        status,
      );
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
      // Omitted, never null: a failure that never reached apm has no outcome,
      // and an absent key cannot be mistaken for one the server proved (#416).
      // The restated cost and its receipt travel the same way — together, or
      // the confirmation would name a cost it cannot act on (#364).
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

  // Read-only despite the POST: the target's path travels in the body, like the
  // removal's own preflight. This slice writes nothing — the confirm is #954.
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
      return c.json({ error: result.error }, status);
    }
    // A preview failing its own shape check does not cross: the reader sees a
    // refusal rather than a priced update the server cannot vouch for (#416).
    const preview = updatePreviewBody(result.preview);
    if (preview === null) {
      return c.json({ error: "preview-failed" }, 502);
    }
    return c.json({ preview });
  });

  // The one way out of a Deploy or Remove that never finished. It re-runs the
  // release and Selection the server itself recorded, so nothing the client
  // sends chooses what happens (#951).
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
          // The consent this refusal minted, so the reader's next attempt
          // licenses exactly the copies they were shown (#952).
          ...(result.copyReceipt ? { copyReceipt: result.copyReceipt } : {}),
        },
        status,
      );
    }
    return c.json({ completed: result.completed });
  });

  // Always 200 with a report — a per-skill refusal is data, not an HTTP error.
  // Shares the deploy use-case's per-target in-flight lock (#292).
  const bulkDeploy = new BulkDeploySkills({ deploy: deps.deploy });
  app.post("/api/deploy/bulk", async (c) => {
    const body = await parseBody(c, bulkDeployBodySchema, BULK_DEPLOY_BODY);
    if (!body.ok) {
      return body.response;
    }

    const report = await bulkDeploy.execute(body.data);
    return c.json(report);
  });

  // Always 200 with a report — one target's refusal is data, not an HTTP error.
  // The walk delegates to the same remove use-case the single route drives, so
  // every guard, the per-target lock and the reclaim contract stay there (#421).
  const bulkRemove = new BulkRemoveDeployedSkill({ remove: deps.remove });
  app.post("/api/deploy/remove/bulk", async (c) => {
    const body = await parseBody(c, bulkRemoveBodySchema, BULK_REMOVE_BODY);
    if (!body.ok) {
      return body.response;
    }

    const report = await bulkRemove.execute(body.data);
    return c.json(report);
  });

  // Registry-gated like deploy-state. Delegated to `apm outdated` (ADR-0001).
  app.get("/api/drift", async (c) => {
    const gate = await requireRegisteredRepoAccess(c);
    if (!gate.ok) {
      return gate.response;
    }
    const result = await gate.repo.readDrift();
    if (!result.ok) {
      return c.json(driftFailureBody(result));
    }
    return c.json({ behind: result.behind });
  });

  // No path sent to core — user-scope is apm's global target; any ?repo is ignored.
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
