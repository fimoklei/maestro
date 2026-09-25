// Derived from the worktree's own path, so two checkouts never share ports.
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

function pinned(value) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : null;
}

/**
 * Which slot each worktree ends up in. On a hash collision the loser steps to
 * the next free slot, in sorted order, so every worktree computes the same map.
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

/** The worktree's server and web ports; without the worktree list, the path's own slot. */
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

export function cockpitUrls(ports = cockpitPorts()) {
  return {
    // By name, not by address: vite binds localhost, which can resolve to ::1 only.
    web: `http://localhost:${ports.web}`,
    api: `http://127.0.0.1:${ports.server}`,
  };
}

// `pnpm cockpit:url` — the address without reading source or a running server.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { web, api } = cockpitUrls();
  console.log(`cockpit ${web}\napi     ${api}`);
}
