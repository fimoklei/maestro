// Brings a running `pnpm smoke` cockpit to the state a UI check needs: waits
// for it, connects the inventory, fetches its releases and registers one
// consuming repo.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cockpitPorts, cockpitUrls } from "./cockpit-ports.mjs";
import { pidsOnPort } from "./port-holders.mjs";
import { MARKER_FILE, processStartOf, seededPaths } from "./seed-sandbox.mjs";
import { parseScenarioArg, seedScenarios } from "./smoke-scenarios.mjs";

const PORTS = cockpitPorts();
const { web: WEB_ORIGIN, api: SERVER_ORIGIN } = cockpitUrls(PORTS);
// The server refuses a state-changing request without an allowlisted Origin.
const BROWSER_ORIGIN = WEB_ORIGIN;
// Both ports, so ownership covers what the browser renders, not only the API.
const COCKPIT_PORTS = [PORTS.server, PORTS.web];

const wallClock = () => Date.now();
const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls until the cockpit answers; a probe that throws counts as not up yet. */
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

async function call(request, path, body, what) {
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
 * Connects the inventory, fetches the harness, then registers the repo. Any
 * refusal stops the sequence, an unreadable count or a failed fetch included
 * (#544): a half-seeded cockpit would look ready and lie.
 */
export async function seedCockpit({ request, inventoryPath, repoPath }) {
  const connected = await call(
    request,
    "/api/inventory/connect",
    { path: inventoryPath },
    "Connecting the inventory",
  );
  if ((connected?.primitiveCount ?? null) === null)
    throw new Error(
      `connected ${inventoryPath}, but its released skills could not be read. ` +
        "Maestro reads Inventory from the latest release under " +
        "`refs/maestro/tags`; check that the sandbox's clone is a readable " +
        "git repository.",
    );

  // The copied clone holds no release refs until a fetch writes them.
  const refreshed = await call(
    request,
    "/api/harness/refresh",
    {},
    "Fetching the harness",
  );
  const outcome = refreshed?.freshness?.outcome ?? null;
  if (outcome !== "fetched")
    throw new Error(
      `connected ${inventoryPath}, but the harness could not be fetched ` +
        `(${outcome ?? "no outcome"}), so the Inventory would show no released skills. ` +
        "Check the network and `gh auth status`, then re-run.",
    );

  const released = await call(
    request,
    "/api/inventory/primitives",
    undefined,
    "Reading the released skills",
  );
  const primitiveCount = released?.primitives?.length ?? 0;

  const registered = await call(
    request,
    "/api/registry/repos",
    { path: repoPath },
    "Registering the consuming repo",
  );

  return { primitiveCount, repoCount: registered?.repos?.length ?? 0 };
}

// Deeper than any launcher-to-listener chain; a lookup that loops runs out.
const MAX_ANCESTRY = 32;

/** True, false, or null when the chain could not be read to its end. */
function descendsFrom(pid, ancestor, parentOf) {
  let current = pid;
  for (let depth = 0; depth < MAX_ANCESTRY; depth++) {
    if (current === ancestor) return true;
    if (current <= 1) return false;
    const parent = parentOf(current);
    if (parent === null) return null;
    current = parent;
  }
  return null;
}

/**
 * Whether every cockpit listener is this sandbox's own smoke run: a descendant
 * of the launcher, whatever process group pnpm gave it (#1295). Answering is
 * not identity: a stale sandbox plus a plain `pnpm dev` would seed the real
 * ~/.maestro. Every unknown refuses (#453).
 */
export function identifySmokeInstance({ marker, holders, parentOf, startOf }) {
  if (marker === null) {
    const occupied = holders.find(({ pids }) => pids.length > 0);
    return {
      ok: false,
      reason: occupied
        ? `pid ${occupied.pids[0]} holds port ${occupied.port} and this checkout has no smoke marker — either no \`pnpm smoke\` ran here, or another worktree took the port`
        : "the sandbox holds no smoke marker — this cockpit was not started by `pnpm smoke`",
    };
  }

  // A crashed launcher leaves its marker; the pid may since belong to anyone (#1298).
  if (startOf(marker.launcherPid) !== marker.startedAt)
    return {
      ok: false,
      reason: `the smoke marker is stale: launcher pid ${marker.launcherPid} is gone or now belongs to another process — run \`pnpm smoke\` again`,
    };

  for (const { port, pids } of holders) {
    if (pids.length === 0)
      return { ok: false, reason: `nothing identifiable holds port ${port}` };

    for (const pid of pids) {
      const ours = descendsFrom(pid, marker.launcherPid, parentOf);
      if (ours === null)
        return {
          ok: false,
          reason: `the process holding port ${port} (pid ${pid}) could not be placed`,
        };
      if (!ours)
        return {
          ok: false,
          reason: `port ${port} is held by pid ${pid}, which is not this smoke run (launcher ${marker.launcherPid})`,
        };
    }
  }

  return { ok: true };
}

export function readSmokeMarker(sandboxDir) {
  try {
    const marker = JSON.parse(
      readFileSync(join(sandboxDir, MARKER_FILE), "utf8"),
    );
    return Number.isInteger(marker?.launcherPid) &&
      marker.launcherPid > 1 &&
      typeof marker.startedAt === "string" &&
      marker.startedAt !== ""
      ? marker
      : null;
  } catch {
    return null;
  }
}

// A lookup that could not answer yields no holders, so the check fails closed.
function cockpitHolders() {
  return COCKPIT_PORTS.map((port) => ({ port, pids: pidsOnPort(port) ?? [] }));
}

function parentOf(pid) {
  try {
    const parent = Number(
      execFileSync("ps", ["-o", "ppid=", "-p", String(pid)], {
        encoding: "utf8",
      }).trim(),
    );
    return Number.isInteger(parent) ? parent : null;
  } catch {
    return null;
  }
}

async function answers(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
  return response.ok;
}

// No body means a read: a GET.
async function requestJson(path, body, method = "POST") {
  const response = await fetch(
    `${SERVER_ORIGIN}${path}`,
    body === undefined
      ? {}
      : {
          method,
          headers: {
            "content-type": "application/json",
            origin: BROWSER_ORIGIN,
          },
          body: JSON.stringify(body),
        },
  );
  return {
    status: response.status,
    body: await response.json().catch(() => null),
  };
}

function requireOwnership(repoRoot, label, refusal) {
  const identity = identifySmokeInstance({
    marker: readSmokeMarker(join(repoRoot, ".maestro-sandbox")),
    holders: cockpitHolders(),
    parentOf,
    startOf: processStartOf,
  });
  if (identity.ok) return;

  console.error(
    `[${label}] ${refusal}: ${identity.reason}.\n` +
      "Only a cockpit started by `pnpm smoke` from this checkout counts.",
  );
  process.exit(1);
}

/** Asks ownership alone, so it can be re-asked; it seeds nothing. */
function check(repoRoot) {
  requireOwnership(repoRoot, "smoke:check", "the cockpit is not yours");
  console.log(
    `[smoke:check] ${WEB_ORIGIN} (ports ${COCKPIT_PORTS.join(" and ")}) still belongs to this checkout's \`pnpm smoke\` run.`,
  );
}

// Throws on any refusal, unless the caller expects one and reads the status.
const scenarioApi = {
  get: async (path, { allowRefusal = false } = {}) =>
    allowRefusal
      ? await requestJson(path)
      : await call(requestJson, path, undefined, `GET ${path}`),
  post: async (path, body, { allowRefusal = false } = {}) =>
    allowRefusal
      ? await requestJson(path, body)
      : await call(requestJson, path, body, `POST ${path}`),
  del: (path, body) =>
    call((p, b) => requestJson(p, b, "DELETE"), path, body, `DELETE ${path}`),
};

async function main() {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  if (process.argv.includes("--check")) return check(repoRoot);

  let scenarios;
  try {
    scenarios = parseScenarioArg(process.argv.slice(2));
  } catch (refusal) {
    console.error(`[smoke:ready] ${refusal.message}`);
    process.exit(1);
  }

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
    // Fail closed: an unanswered cockpit is not a slow one.
    console.error(
      `[smoke:ready] nothing answered on ${SERVER_ORIGIN} and ${WEB_ORIGIN} within 60s.\n` +
        "Start the cockpit first: `pnpm smoke` (in the background), then re-run this.",
    );
    process.exit(1);
  }

  // Refusing here is the whole point: seeding the wrong instance writes the
  // rehearsal's temporary paths into the real ~/.maestro.
  requireOwnership(repoRoot, "smoke:ready", "refusing to seed");

  if (scenarios !== null) return await seedNamedScenarios(repoRoot, scenarios);

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

async function seedNamedScenarios(repoRoot, names) {
  const startedAt = Date.now();
  let seeded;
  try {
    seeded = await seedScenarios({
      api: scenarioApi,
      sandboxDir: join(repoRoot, ".maestro-sandbox"),
      fixtureDir: join(repoRoot, "tests", "fixtures", "fixture-harness"),
      names,
    });
  } catch (failure) {
    console.error(`[smoke:ready] seeding stopped: ${failure.message}`);
    process.exit(1);
  }
  for (const problem of seeded.problems)
    console.error(`[smoke:ready] ${problem}`);
  if (seeded.problems.length > 0) process.exit(1);
  console.log(
    `[smoke:ready] ${names.join(", ")} seeded and checked in ${Math.round((Date.now() - startedAt) / 100) / 10}s:\n` +
      seeded.repos.map((repo) => `  ${repo}`).join("\n"),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
