// Brings a running `pnpm smoke` cockpit to the state a UI check needs: waits
// until server and web answer, then connects the inventory and registers one
// consuming repo through the API. `pnpm smoke` itself stays bare — connect and
// registration remain the UI use-cases the rehearsal exercises (ADR-0010).
// This step is dev tooling for verifying a change, not the rehearsal.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { seededPaths } from "./seed-sandbox.mjs";

const SERVER_ORIGIN = "http://127.0.0.1:3000";
// By name, not by address: Vite binds localhost, which on this machine resolves
// to ::1 only — probing 127.0.0.1 reports a running cockpit as absent
// (measured 2026-07-26, vite 8.1.5).
const WEB_ORIGIN = "http://localhost:5173";
// The cockpit's own origin: the server refuses a state-changing request without
// an allowlisted Origin header (packages/server/src/origin-host-guard.ts).
const BROWSER_ORIGIN = "http://localhost:5173";

const wallClock = () => Date.now();
const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Polls until the cockpit answers, or the deadline passes. A probe that throws
 * counts as "not up yet" — a refused connection is the normal state while the
 * dev server boots, not a fault worth reporting.
 */
export async function waitForCockpit({
  probe,
  timeoutMs = 60_000,
  intervalMs = 250,
  now = wallClock,
  sleep = realSleep,
}) {
  const startedAt = now();
  const deadline = startedAt + timeoutMs;

  for (;;) {
    let up = false;
    try {
      up = await probe();
    } catch {
      up = false;
    }
    if (up) return { ready: true, waitedMs: now() - startedAt };
    if (now() + intervalMs > deadline)
      return { ready: false, waitedMs: now() - startedAt };
    await sleep(intervalMs);
  }
}

async function post(request, path, body, what) {
  const { status, body: response } = await request(path, body);
  if (status < 200 || status >= 300) {
    const detail =
      typeof response === "object" && response !== null && "message" in response
        ? String(response.message)
        : `HTTP ${status}`;
    throw new Error(`${what} was refused: ${detail}`);
  }
  return response;
}

/**
 * Connects the inventory and registers the consuming repo, in that order — a
 * repo registered against no inventory shows deploy-state for nothing. Any
 * refusal stops the sequence: a half-seeded cockpit would look ready and lie.
 */
export async function seedCockpit({ request, inventoryPath, repoPath }) {
  const connected = await post(
    request,
    "/api/inventory/connect",
    { path: inventoryPath },
    "Connecting the inventory",
  );
  const registered = await post(
    request,
    "/api/registry/repos",
    { path: repoPath },
    "Registering the consuming repo",
  );

  return {
    primitiveCount: connected?.primitiveCount ?? 0,
    repoCount: registered?.repos?.length ?? 0,
  };
}

async function answers(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
  return response.ok;
}

async function requestJson(path, body) {
  const response = await fetch(`${SERVER_ORIGIN}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: BROWSER_ORIGIN,
    },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: await response.json().catch(() => null),
  };
}

async function main() {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const sandboxHome = join(repoRoot, ".maestro-sandbox", "home");
  const { inventory: inventoryPath, firstRepo: repoPath } =
    seededPaths(sandboxHome);

  const startedAt = Date.now();
  const { ready, waitedMs } = await waitForCockpit({
    probe: async () =>
      (await answers(`${SERVER_ORIGIN}/api/health`)) &&
      (await answers(`${WEB_ORIGIN}/`)),
  });

  if (!ready) {
    // Fail closed: an unanswered cockpit is not a slow one we may assume into
    // existence (same posture as scripts/guard-port-owner.mjs).
    console.error(
      "[smoke:ready] nothing answered on 127.0.0.1:3000 and :5173 within 60s.\n" +
        "Start the cockpit first: `pnpm smoke` (in the background), then re-run this.",
    );
    process.exit(1);
  }

  if (!existsSync(inventoryPath)) {
    console.error(
      `[smoke:ready] no seeded inventory at ${inventoryPath}.\n` +
        "That directory is created by `pnpm smoke`; a plain `pnpm dev` does not seed it.",
    );
    process.exit(1);
  }

  try {
    const { primitiveCount, repoCount } = await seedCockpit({
      request: requestJson,
      inventoryPath,
      repoPath,
    });
    console.log(
      `[smoke:ready] cockpit ready in ${Math.round((Date.now() - startedAt) / 100) / 10}s ` +
        `(waited ${Math.round(waitedMs / 100) / 10}s) — ` +
        `${primitiveCount} primitives, ${repoCount} repo registered.`,
    );
  } catch (failure) {
    console.error(`[smoke:ready] ${failure.message}`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
