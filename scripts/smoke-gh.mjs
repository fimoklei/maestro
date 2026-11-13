// The `gh` a smoke cockpit runs: reads reach GitHub, pull-request writes stop
// here. Smoke pushes land in a local copy, so a write would only act on the
// real fixture repository with the operator's login.
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const WRITES = new Set(["create", "edit", "close", "reopen", "merge"]);

/** The line to print when `args` would write to GitHub, else null. */
export function ghWriteRefusal(args) {
  const [command, subcommand] = args;
  if (command === "pr" && WRITES.has(subcommand))
    return `[smoke] gh ${command} ${subcommand} stops in the sandbox, so GitHub sees no write.`;
  return null;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const refusal = ghWriteRefusal(args);
  if (refusal !== null) {
    console.error(refusal);
    process.exit(1);
  }
  const realGh = process.env.MAESTRO_SMOKE_REAL_GH;
  if (!realGh) {
    console.error("[smoke] MAESTRO_SMOKE_REAL_GH is not set.");
    process.exit(1);
  }
  const result = spawnSync(realGh, args, { stdio: "inherit" });
  process.exit(result.status ?? 1);
}
