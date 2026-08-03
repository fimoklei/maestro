// Which ports are this worktree's cockpit. Derived from the worktree's own
// path, so two checkouts can each serve without taking the other's ports; the
// launcher, vite, the readiness probe and the ownership guard all read here.
import { realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { listWorktrees } from "./port-holders.mjs";

// Private range, clear of the ephemeral ports macOS hands out from 49152.
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

/**
 * Which slot each worktree ends up in. Two paths can hash to the same one, so
 * the loser steps to the next free slot — walked in sorted order, and over the
 * whole list, so every worktree computes the same map without being told what
 * the others took.
 */
function assignSlots(worktrees) {
  const taken = new Set();
  const slots = new Map();

  for (const path of [...worktrees].sort()) {
    let slot = hash(path) % PAIRS;
    while (taken.has(slot)) slot = (slot + 1) % PAIRS;
    taken.add(slot);
    slots.set(path, slot);
  }

  return slots;
}

/**
 * The server and web ports belonging to the worktree at `worktreePath`. Pass
 * the repo's worktrees to keep two of them off one pair; without that list
 * (git could not be asked) the path's own slot is the best answer available.
 */
export function cockpitPortsFor(
  worktreePath,
  env = process.env,
  worktrees = null,
) {
  const slot =
    worktrees?.includes(worktreePath) === true
      ? assignSlots(worktrees).get(worktreePath)
      : hash(worktreePath) % PAIRS;
  const server = FIRST_PAIR + slot * 2;

  return {
    server: pinned(env.PORT) ?? server,
    web: pinned(env.WEB_PORT) ?? server + 1,
  };
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** This checkout's own pair. Resolved, so a symlinked path reads as one worktree. */
export function cockpitPorts(env = process.env) {
  return cockpitPortsFor(realpathSync(repoRoot), env, listWorktrees(repoRoot));
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
