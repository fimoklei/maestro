// `pnpm cockpit:snapshot <selector> [path]` — one region of this worktree's
// cockpit as a trimmed accessibility tree, read from the worktree's own
// agent-browser session so an open pane or dialog shows up.
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cockpitUrls } from "./cockpit-ports.mjs";

const NAME_LIMIT = 80;

// Drops a node the snapshot already printed, with its children.
function dropRepeats(snapshot) {
  const seen = new Set();
  let skipDeeperThan = null;
  return snapshot
    .split("\n")
    .filter((line) => {
      const depth = line.search(/\S/);
      if (skipDeeperThan !== null && depth > skipDeeperThan) return false;
      skipDeeperThan = null;
      const ref = line.match(/\bref=(e\d+)/)?.[1];
      if (ref === undefined) return true;
      if (!seen.has(ref)) {
        seen.add(ref);
        return true;
      }
      skipDeeperThan = depth;
      return false;
    })
    .join("\n");
}

/**
 * The snapshot with each node once — `agent-browser snapshot -s` (0.37.1)
 * repeats a grid's rows — and every quoted string cut to NAME_LIMIT.
 */
export function trimSnapshot(snapshot) {
  return dropRepeats(snapshot).replace(/"((?:[^"\\]|\\.)*)"/g, (whole, text) =>
    text.length <= NAME_LIMIT
      ? whole
      : // An odd run of trailing backslashes is half an escape.
        `"${text.slice(0, NAME_LIMIT).replace(/(?<!\\)(\\\\)*\\$/, "$1")}…"`,
  );
}

function fail(message) {
  console.error(`[cockpit:snapshot] ${message}`);
  process.exit(1);
}

async function main([selector, path]) {
  if (!selector)
    fail(
      'give a CSS selector: pnpm cockpit:snapshot "main table" [/inventory]',
    );
  if (path !== undefined && !path.startsWith("/"))
    fail(`give the path from its leading slash: /${path}`);

  const { web } = cockpitUrls();
  try {
    await fetch(web, { signal: AbortSignal.timeout(5_000) });
  } catch {
    fail(`no cockpit answers at ${web} — start \`pnpm smoke\` first`);
  }

  const repoRoot = realpathSync(
    join(dirname(fileURLToPath(import.meta.url)), ".."),
  );
  const session = `maestro-${basename(repoRoot)}`;
  const browse = (...args) =>
    execFileSync("agent-browser", ["--session", session, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();

  try {
    const current = browse("get", "url");
    if (path !== undefined || !current.startsWith(`${web}/`)) {
      browse("open", `${web}${path ?? "/"}`);
      try {
        browse("wait", selector);
      } catch {
        // The snapshot below names the miss.
      }
    }
    const url = browse("get", "url");
    let snapshot;
    try {
      snapshot = browse("snapshot", "-s", selector);
    } catch (failure) {
      if (!String(failure.stderr).includes("did not match")) throw failure;
      fail(`nothing matches ${selector} on ${url}`);
    }
    console.error(`[cockpit:snapshot] session ${session} · ${url}`);
    console.log(trimSnapshot(snapshot));
  } catch (failure) {
    const reason = String(failure.stderr ?? failure.message).trim();
    fail(
      `agent-browser failed in session ${session}: ${reason.split("\n")[0]}`,
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  await main(process.argv.slice(2));
