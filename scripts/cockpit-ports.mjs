// Which ports are this worktree's cockpit. Derived from the worktree's own
// path, so two checkouts can each serve without taking the other's ports; the
// launcher, vite, the readiness probe and the ownership guard all read here.
import { realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Private range, clear of the ephemeral ports macOS hands out from 49152, with
// room for 2000 worktrees before two pairs can collide.
const FIRST_PAIR = 20000;
const PAIRS = 2000;

/** Stable across runs and machines — djb2 over the path, not a random seed. */
function hash(text) {
  let value = 5381;
  for (let i = 0; i < text.length; i++) {
    value = ((value * 33) ^ text.charCodeAt(i)) >>> 0;
  }
  return value;
}

/** A port pinned in the environment, or null when it is absent or unusable. */
function pinned(value) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : null;
}

/** The server and web ports belonging to the worktree at `worktreePath`. */
export function cockpitPortsFor(worktreePath, env = process.env) {
  const server = FIRST_PAIR + (hash(worktreePath) % PAIRS) * 2;

  return {
    server: pinned(env.PORT) ?? server,
    web: pinned(env.WEB_PORT) ?? server + 1,
  };
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** This checkout's own pair. Resolved, so a symlinked path reads as one worktree. */
export function cockpitPorts(env = process.env) {
  return cockpitPortsFor(realpathSync(repoRoot), env);
}

/** Where to point a browser and an API call, in full. */
export function cockpitUrls(ports = cockpitPorts()) {
  return {
    // By name, not by address: vite binds localhost, which resolves to ::1 only
    // on this machine (LEARNINGS.md · tooling/smoke-binds-ipv6-only).
    web: `http://localhost:${ports.web}`,
    api: `http://127.0.0.1:${ports.server}`,
  };
}

// `pnpm cockpit:url` — the address without reading source or a running server.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { web, api } = cockpitUrls();
  console.log(`cockpit ${web}\napi     ${api}`);
}
