// `pnpm cockpit:hover <selector>` — hovers one element of this worktree's
// cockpit in its own agent-browser session and prints each open hover card's
// text, so a card needs no pixel position read from a screenshot.
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cockpitUrls } from "./cockpit-ports.mjs";

// The hover card and tooltip open after 400 ms.
const OPEN_WAIT_MS = 900;
const CARDS = `[...document.querySelectorAll("[data-radix-popper-content-wrapper]")].map((card) => card.innerText.replace(/\\n+/g, " | "))`;

/**
 * Page script that scrolls the first match of `selector` into view and gives
 * its centre as `[x, y]`, or null when nothing matches.
 */
export function centreScript(selector) {
  return `(() => {
  const element = document.querySelector(${JSON.stringify(selector)});
  if (element === null) return null;
  element.scrollIntoView({ block: "center" });
  const box = element.getBoundingClientRect();
  return [Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2)];
})()`;
}

function fail(message) {
  console.error(`[cockpit:hover] ${message}`);
  process.exit(1);
}

async function main([selector]) {
  if (!selector)
    fail(
      "give a CSS selector: pnpm cockpit:hover 'aside [role=img][aria-label=\"Behind\"]'",
    );

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
    const point = JSON.parse(browse("eval", centreScript(selector)));
    if (point === null)
      fail(`nothing matches ${selector} on ${browse("get", "url")}`);
    // From outside first, so the pointer enters the element.
    browse("mouse", "move", "0", "0");
    browse("mouse", "move", String(point[0]), String(point[1]));
    browse("wait", String(OPEN_WAIT_MS));
    const cards = JSON.parse(browse("eval", CARDS));
    console.error(`[cockpit:hover] session ${session} · ${point.join(",")}`);
    console.log(cards.length === 0 ? "(no card open)" : cards.join("\n"));
  } catch (failure) {
    const reason = String(failure.stderr ?? failure.message).trim();
    fail(
      `agent-browser failed in session ${session}: ${reason.split("\n")[0]}`,
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  await main(process.argv.slice(2));
