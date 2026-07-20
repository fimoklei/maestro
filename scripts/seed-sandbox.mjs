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

export function seedSandbox({ home, inventorySource }) {
  const projects = join(home, PROJECTS_DIR);
  mkdirSync(projects, { recursive: true });

  seedToolPresence(home);

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
