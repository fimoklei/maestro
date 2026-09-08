// Fills the smoke sandbox with what the rehearsal needs to browse: an inventory
// clone and a handful of candidate consuming repos, all under the sandbox HOME
// (ADR-0010, amendment "what the sandbox seeds").
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Mirrors a real machine's layout, so browsing the rehearsal feels like browsing
// your own disk rather than a fixture tree.
const PROJECTS_DIR = "Projects";
const INVENTORY_DIR = "agent-harness";

// A mix the picker can visibly tell apart: git repos, a plain directory, and a
// name with a space (ADR-0009's per-entry facts have something to report).
const CANDIDATES = [
  { name: "checkout-service", git: true },
  { name: "design-system", git: true },
  { name: "billing api", git: true },
  { name: "scratch-notes", git: false },
];

// The markers Maestro probes to decide a tool is installed (#131,
// .claude/rules/apm-driver.md). Without them the redirected HOME reads as "no
// tool installed" and every global deploy is refused. These are config-file
// stand-ins, never the skills dirs a deploy creates, so they stay deploy-immune.
function seedToolPresence(home) {
  writeFileSync(join(home, ".claude.json"), "{}\n");
  mkdirSync(join(home, ".codex"), { recursive: true });
  writeFileSync(join(home, ".codex", "config.toml"), "");
}

// Redirecting HOME hides the real ~/.gitconfig, so git loses its credential
// helper and every fetch of the seeded clone fails auth — which the harness
// strip reports as "Read failed", never as a setup problem. Only this
// dev-tooling harness bridges credentials; the product never does
// (.claude/rules/security.md). The token lands in a sandbox wiped on teardown.
function seedGitCredentials(home, githubToken) {
  writeFileSync(
    join(home, ".git-credentials"),
    `https://x-access-token:${githubToken}@github.com\n`,
  );
  // The empty entry resets the helper list: helpers accumulate, and a
  // system-configured one (macOS ships osxkeychain) would also be asked to
  // store the credential, prompting for a keychain this HOME does not have.
  writeFileSync(
    join(home, ".gitconfig"),
    "[credential]\n\thelper =\n\thelper = store\n",
  );
}

// The launcher's record of the run that owns this sandbox. Named here because
// the sandbox layout is this file's job; `smoke-ready.mjs` reads it back.
export const MARKER_FILE = "smoke.json";

/** Records which launcher owns this sandbox, so a later step can verify it. */
export function writeSmokeMarker(sandboxDir, { launcherPid }) {
  writeFileSync(
    join(sandboxDir, MARKER_FILE),
    `${JSON.stringify({ launcherPid })}\n`,
  );
}

/**
 * Where seeding puts the two things the readiness step needs. Exported so
 * `smoke-ready.mjs` asks instead of restating the directory names — a rename
 * here then cannot leave the two halves pointing at different places.
 */
export function seededPaths(home) {
  const projects = join(home, PROJECTS_DIR);
  return {
    inventory: join(projects, INVENTORY_DIR),
    firstRepo: join(projects, CANDIDATES[0].name),
  };
}

export function seedSandbox({ home, inventorySource, githubToken }) {
  const projects = join(home, PROJECTS_DIR);
  mkdirSync(projects, { recursive: true });

  seedToolPresence(home);
  if (githubToken) {
    seedGitCredentials(home, githubToken);
  }

  // Copied whole, .git included: connect refuses a clone whose origin it cannot
  // parse (ADR-0014), and a fabricated tree would need a fabricated origin. So
  // the source must be a clone, not merely a directory. An unusable source warns
  // and continues, the posture the harness already takes for an unauthenticated
  // gh — browsing and registering need no inventory.
  const warnings = [];
  let inventory = null;
  if (existsSync(join(inventorySource, ".git"))) {
    inventory = join(projects, INVENTORY_DIR);
    cpSync(inventorySource, inventory, { recursive: true });
  } else {
    warnings.push(
      `no inventory clone at ${inventorySource} — browse and register work, but there is nothing to connect`,
    );
  }

  const candidates = CANDIDATES.map(({ name, git }) => {
    const path = join(projects, name);
    mkdirSync(path, { recursive: true });
    if (git) {
      execFileSync("git", ["init"], { cwd: path, stdio: "ignore" });
    }
    return path;
  });

  return { inventory, candidates, warnings };
}
