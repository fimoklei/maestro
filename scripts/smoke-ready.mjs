// Brings a running `pnpm smoke` cockpit to the state a UI check needs: waits
// until server and web answer, then connects the inventory and registers one
// consuming repo through the API. `pnpm smoke` itself stays bare — connect and
// registration remain the UI use-cases the rehearsal exercises (ADR-0010).
// This step is dev tooling for verifying a change, not the rehearsal.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findPortOwners } from "./guard-port-owner.mjs";
import { MARKER_FILE, seededPaths } from "./seed-sandbox.mjs";

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

/**
 * Whether the server answering on port 3000 is this sandbox's own smoke run.
 * Answering is not identity: a sandbox left behind by a killed run, plus a
 * plain `pnpm dev` on the same ports, would otherwise take the rehearsal's
 * paths into the real ~/.maestro. `dev.mjs --smoke` spawns its children as one
 * detached group led by the launcher, so the holder's process group is the
 * proof. Every unknown refuses, as the port guard does.
 */
export function identifySmokeInstance({ marker, serverPid, processGroupOf }) {
  if (marker === null)
    return {
      ok: false,
      reason:
        "the sandbox holds no smoke marker — this cockpit was not started by `pnpm smoke`",
    };
  if (serverPid === null)
    return { ok: false, reason: "nothing identifiable holds port 3000" };

  const group = processGroupOf(serverPid);
  if (group === null)
    return {
      ok: false,
      reason: `the process holding port 3000 (pid ${serverPid}) could not be placed`,
    };
  if (group !== marker.launcherPid)
    return {
      ok: false,
      reason: `port 3000 is held by pid ${serverPid}, which is not this smoke run (launcher ${marker.launcherPid})`,
    };

  return { ok: true };
}

/** The launcher's own record of this run, or null when there is none to trust. */
export function readSmokeMarker(sandboxDir) {
  try {
    const marker = JSON.parse(
      readFileSync(join(sandboxDir, MARKER_FILE), "utf8"),
    );
    return typeof marker?.launcherPid === "number" ? marker : null;
  } catch {
    return null;
  }
}

function serverPortHolder() {
  const [owner] = findPortOwners([3000]);
  return owner?.pid ?? null;
}

function processGroupOf(pid) {
  try {
    const group = Number(
      execFileSync("ps", ["-o", "pgid=", "-p", String(pid)], {
        encoding: "utf8",
      }).trim(),
    );
    return Number.isInteger(group) ? group : null;
  } catch {
    return null;
  }
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

  const identity = identifySmokeInstance({
    marker: readSmokeMarker(join(repoRoot, ".maestro-sandbox")),
    serverPid: serverPortHolder(),
    processGroupOf,
  });
  if (!identity.ok) {
    // Refusing here is the whole point: seeding the wrong instance writes the
    // rehearsal's temporary paths into the real ~/.maestro.
    console.error(
      `[smoke:ready] refusing to seed — ${identity.reason}.\n` +
        "Only a cockpit started by `pnpm smoke` from this checkout is seeded.",
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
