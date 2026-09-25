// Fills the smoke sandbox with an inventory clone and a few candidate repos,
// all under the sandbox HOME.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PROJECTS_DIR = "Projects";
const INVENTORY_DIR = "agent-harness";

// Git repos, a plain directory, and a name with a space: the cases a picked
// path has to survive.
const CANDIDATES = [
  { name: "checkout-service", git: true },
  { name: "design-system", git: true },
  { name: "billing api", git: true },
  { name: "scratch-notes", git: false },
];

// The markers Maestro probes to decide a tool is installed (#131). Config-file
// stand-ins, never the skills dirs a deploy creates, so a deploy leaves them.
function seedToolPresence(home) {
  writeFileSync(join(home, ".claude.json"), "{}\n");
  mkdirSync(join(home, ".codex"), { recursive: true });
  writeFileSync(join(home, ".codex", "config.toml"), "");
}

// Redirecting HOME hides the real ~/.gitconfig and its credential helper.
// Dev tooling only: the product never bridges credentials.
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

export const MARKER_FILE = "smoke.json";

/** Records which launcher owns this sandbox, so a later step can verify it. */
export function writeSmokeMarker(sandboxDir, { launcherPid }) {
  writeFileSync(
    join(sandboxDir, MARKER_FILE),
    `${JSON.stringify({ launcherPid })}\n`,
  );
}

/** Where seeding puts what the readiness step needs; `smoke-ready.mjs` reads it here. */
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
  // parse. An unusable source warns and continues.
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
