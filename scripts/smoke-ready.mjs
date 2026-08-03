// Brings a running `pnpm smoke` cockpit to the state a UI check needs: waits
// until server and web answer, then connects the inventory and registers one
// consuming repo through the API. `pnpm smoke` itself stays bare — connect and
// registration remain the UI use-cases the rehearsal exercises (ADR-0010).
// This step is dev tooling for verifying a change, not the rehearsal.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cockpitPorts, cockpitUrls } from "./cockpit-ports.mjs";
import { pidsOnPort } from "./port-holders.mjs";
import { MARKER_FILE, seededPaths } from "./seed-sandbox.mjs";

const PORTS = cockpitPorts();
const { web: WEB_ORIGIN, api: SERVER_ORIGIN } = cockpitUrls(PORTS);
// The cockpit's own origin: the server refuses a state-changing request without
// an allowlisted Origin header (packages/server/src/origin-host-guard.ts).
const BROWSER_ORIGIN = WEB_ORIGIN;
// Both ports `dev.mjs` binds as one group, so ownership covers what the browser
// renders and not only what the API answers.
const COCKPIT_PORTS = [PORTS.server, PORTS.web];

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
 * Whether every cockpit listener is this sandbox's own smoke run. Answering is
 * not identity: a sandbox left behind by a killed run, plus a plain `pnpm dev`
 * on the same ports, would otherwise take the rehearsal's paths into the real
 * ~/.maestro. `dev.mjs --smoke` spawns its children as one detached group led
 * by the launcher, so each holder's process group is the proof. Both ports are
 * weighed because the screenshot comes from the web app, not the API (#453).
 * Every unknown refuses.
 */
export function identifySmokeInstance({ marker, holders, processGroupOf }) {
  if (marker === null) {
    const occupied = holders.find(({ pids }) => pids.length > 0);
    return {
      ok: false,
      reason: occupied
        ? `pid ${occupied.pids[0]} holds port ${occupied.port} and this checkout has no smoke marker — either no \`pnpm smoke\` ran here, or another worktree took the port`
        : "the sandbox holds no smoke marker — this cockpit was not started by `pnpm smoke`",
    };
  }

  for (const { port, pids } of holders) {
    if (pids.length === 0)
      return { ok: false, reason: `nothing identifiable holds port ${port}` };

    for (const pid of pids) {
      const group = processGroupOf(pid);
      if (group === null)
        return {
          ok: false,
          reason: `the process holding port ${port} (pid ${pid}) could not be placed`,
        };
      if (group !== marker.launcherPid)
        return {
          ok: false,
          reason: `port ${port} is held by pid ${pid}, which is not this smoke run (launcher ${marker.launcherPid})`,
        };
    }
  }

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

// A lookup that could not answer yields no holders, so the check fails closed.
function cockpitHolders() {
  return COCKPIT_PORTS.map((port) => ({ port, pids: pidsOnPort(port) ?? [] }));
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

/** Exits the process unless the cockpit belongs to this checkout's smoke run. */
function requireOwnership(repoRoot, label, refusal) {
  const identity = identifySmokeInstance({
    marker: readSmokeMarker(join(repoRoot, ".maestro-sandbox")),
    holders: cockpitHolders(),
    processGroupOf,
  });
  if (identity.ok) return;

  console.error(
    `[${label}] ${refusal}: ${identity.reason}.\n` +
      "Only a cockpit started by `pnpm smoke` from this checkout counts.",
  );
  process.exit(1);
}

/**
 * Asks the ownership question alone, so it can be re-asked before every
 * screenshot. Seeds nothing, so repeating it cannot register the repo twice.
 */
function check(repoRoot) {
  requireOwnership(repoRoot, "smoke:check", "the cockpit is not yours");
  console.log(
    `[smoke:check] ${WEB_ORIGIN} (ports ${COCKPIT_PORTS.join(" and ")}) still belongs to this checkout's \`pnpm smoke\` run.`,
  );
}

async function main() {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  if (process.argv.includes("--check")) return check(repoRoot);

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
    // existence.
    console.error(
      `[smoke:ready] nothing answered on ${SERVER_ORIGIN} and ${WEB_ORIGIN} within 60s.\n` +
        "Start the cockpit first: `pnpm smoke` (in the background), then re-run this.",
    );
    process.exit(1);
  }

  // Refusing here is the whole point: seeding the wrong instance writes the
  // rehearsal's temporary paths into the real ~/.maestro.
  requireOwnership(repoRoot, "smoke:ready", "refusing to seed");

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
