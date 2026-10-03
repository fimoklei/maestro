// Measures, in a real browser, whether each table screen's table fits its
// panel at a few widths, with and without a detail pane open. happy-dom
// measures nothing, so only a browser can prove a table fits.
import { execFileSync } from "node:child_process";

const TABLE_SCREENS = [
  { screen: "Deploy-state", path: "/" },
  { screen: "Inventory", path: "/inventory" },
  { screen: "Harness", path: "/harness" },
  { screen: "Repositories", path: "/repositories" },
];

// 1440 is roomy; 1104 is the narrowest panel a pane sits beside; 1024 folds
// the sidebar; 440 leaves a panel under 28rem.
const VIEWPORTS = [1440, 1104, 1024, 768, 440];
const VIEWPORT_HEIGHT = 900;

// Sub-pixel layout can leave a fitting table a fraction wider than its room.
const TOLERANCE_PX = 1;

/**
 * One sentence per table wider than the room it scrolls in, and the screens
 * that showed no rows: an empty screen has no table to measure.
 */
export function tableFitReport(measurements) {
  const measured = measurements.filter((m) => m.rows !== false);
  const skipped = [
    ...new Set(
      measurements.filter((m) => m.rows === false).map((m) => m.screen),
    ),
  ];
  if (measured.length === 0)
    return {
      failures: [
        "no table showed rows to measure — run `pnpm smoke:ready` first",
      ],
      skipped,
    };

  const failures = measured.flatMap((m) => {
    if (m.paneOpened === false)
      return [
        `${m.screen}, viewport ${m.viewport}px: a row did not open its detail pane, so the table beside it was not measured`,
      ];
    if (m.tableWidth - m.roomWidth <= TOLERANCE_PX) return [];
    const pane = m.detailOpen ? ", detail pane open" : "";
    const overflow = Math.round(m.tableWidth - m.roomWidth);
    return [
      `${m.screen}${pane}, viewport ${m.viewport}px: the table is ${overflow}px wider than its ${m.roomWidth}px scroll container`,
    ];
  });
  return { failures, skipped };
}

// Runs inside the page, so it may use nothing from this module's scope.
async function measureScreens(screens, viewport) {
  const until = async (find, ms) => {
    const end = Date.now() + ms;
    for (;;) {
      const found = find();
      if (found) return found;
      if (Date.now() > end) return null;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  };
  const settle = () =>
    new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  // The screen's own table: the previous screen's stays mounted a while.
  const gridOf = (screen) => () => {
    if (document.querySelector("main h1")?.textContent !== screen) return null;
    const table = document.querySelector("main table[role=grid]");
    return table?.querySelector("tbody tr[id]") ? table : null;
  };
  const widths = (table, detailOpen) => {
    let room = table.parentElement;
    while (room && getComputedStyle(room).overflowX === "visible")
      room = room.parentElement;
    return {
      detailOpen,
      tableWidth: table.getBoundingClientRect().width,
      roomWidth: room.clientWidth,
    };
  };
  // A narrowed panel hides columns a render after it resizes, so read the
  // widths only once two readings agree.
  const steadyWidths = async (findTable, detailOpen) => {
    let last = null;
    for (let tries = 0; tries < 15; tries++) {
      await settle();
      await new Promise((resolve) => setTimeout(resolve, 200));
      const now = widths(findTable(), detailOpen);
      if (
        last?.tableWidth === now.tableWidth &&
        last.roomWidth === now.roomWidth
      )
        return now;
      last = now;
    }
    return last;
  };

  const results = [];
  for (const { screen, path } of screens) {
    history.pushState(null, "", path);
    dispatchEvent(new PopStateEvent("popstate"));
    const grid = gridOf(screen);
    const table = await until(grid, 15_000);
    if (table === null) {
      results.push({ screen, viewport, rows: false });
      continue;
    }
    results.push({
      screen,
      viewport,
      ...(await steadyWidths(() => grid() ?? table, false)),
    });

    const opens = (grid() ?? table).querySelector(
      "tbody tr[id].cursor-pointer",
    );
    if (opens === null) continue;
    opens.click();
    const pane = await until(
      () => document.querySelector("main aside[aria-label$=' detail']"),
      5_000,
    );
    if (pane === null) {
      results.push({ screen, viewport, paneOpened: false });
      continue;
    }
    results.push({
      screen,
      viewport,
      ...(await steadyWidths(() => grid() ?? table, true)),
    });
    pane.querySelector("button[aria-label^='Close']")?.click();
  }
  return results;
}

/** Drives agent-browser in its own session, so no other worktree's tab moves. */
export function checkTableFit({ webOrigin, session }) {
  const run = (args, input) =>
    execFileSync("agent-browser", ["--session", session, ...args], {
      encoding: "utf8",
      input,
      stdio: ["pipe", "pipe", "pipe"],
    });
  const measurements = [];
  let screens = TABLE_SCREENS;
  try {
    run(["open", webOrigin]);
    for (const viewport of VIEWPORTS) {
      run(["set", "viewport", String(viewport), String(VIEWPORT_HEIGHT)]);
      const answer = JSON.parse(
        run(
          ["eval", "--stdin", "--json"],
          `(${measureScreens})(${JSON.stringify(screens)}, ${viewport})`,
        ),
      );
      if (!answer.success)
        throw new Error(`measuring at ${viewport}px failed: ${answer.error}`);
      measurements.push(...answer.data.result);
      // A screen without rows stays without them; waiting again only costs time.
      const empty = new Set(
        answer.data.result.filter((m) => m.rows === false).map((m) => m.screen),
      );
      screens = screens.filter(({ screen }) => !empty.has(screen));
    }
  } finally {
    try {
      run(["close"]);
    } catch {
      // already closed
    }
  }
  return {
    measured: measurements.filter((m) => m.rows !== false).length,
    ...tableFitReport(measurements),
  };
}
