import type {
  BatchItemOutcome,
  BatchReport,
  PrimitiveRef,
} from "@maestro/core";
import type { Hono } from "hono";
import type { AppDeps } from "../app-deps";
import { proposeBatchErrorResponses } from "../error-responses";
import {
  PROPOSE_BATCH_BODY,
  parseBody,
  proposeBatchBodySchema,
} from "../request-bodies";

/** One line of the stream: an item as it finishes, then the report last. */
type BatchLine = { item: BatchItemOutcome } | { report: BatchReport };

export function registerProposeBatchRoute(
  app: Hono,
  deps: Pick<AppDeps, "proposeBatch">,
) {
  // One POST, so the origin guard applies; the answer streams one JSON line
  // per item, then the report. A refusal before any item is a status.
  app.post("/api/harness/promote/batch", async (c) => {
    const body = await parseBody(c, proposeBatchBodySchema, PROPOSE_BATCH_BODY);
    if (!body.ok) {
      return body.response;
    }
    const items = body.data.items.map(
      ({ type, name }): PrimitiveRef => ({ type, name }),
    );

    const { readable, writable } = new TransformStream<Uint8Array>();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    // Not awaited: a write waits for the reader, who is not attached yet.
    const send = (line: BatchLine) => {
      writer.write(encoder.encode(`${JSON.stringify(line)}\n`)).catch(() => {});
    };

    let started: () => void = () => {};
    const firstItem = new Promise<"started">((resolve) => {
      started = () => resolve("started");
    });
    const run = deps.proposeBatch.execute(items, (outcome) => {
      send({ item: outcome });
      started();
    });
    const first = await Promise.race([firstItem, run]);
    if (first !== "started" && !first.ok) {
      writer.abort().catch(() => {});
      const { status } = proposeBatchErrorResponses[first.error];
      return c.json({ error: first.error }, status);
    }
    run
      .then((result) => {
        if (result.ok) send({ report: result.report });
        return writer.close();
      })
      .catch(() => writer.abort().catch(() => {}));

    return new Response(readable, {
      headers: {
        "content-type": "application/x-ndjson",
        "cache-control": "no-store",
      },
    });
  });
}
