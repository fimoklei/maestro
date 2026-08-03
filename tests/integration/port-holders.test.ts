import { describe, expect, it } from "vitest";
import {
  describeForeignHolders,
  describeHeldPorts,
  findPortHolders,
  listWorktrees,
  partitionHolders,
  pidsOnPort,
  processWorktree,
} from "../../scripts/port-holders.mjs";

interface FakeProcess {
  pid: number;
  command: string;
  cwd: string;
  /** Ports it serves. */
  listening?: number[];
  /** Ports it merely holds a socket on, as a browser tab does. */
  connected?: number[];
  /** Owned by another user: lsof answers nothing about it. */
  opaque?: boolean;
}

/**
 * A fake `lsof` over a set of processes, answering by what the query asks for
 * rather than by its exact wording. It exits 1 with no output when nothing
 * matches, which is how the real one says "none" (lsof 4.91).
 */
function stubLsof(processes: FakeProcess[]) {
  const noMatch = () => {
    const failure = new Error("no match") as Error & { status: number };
    failure.status = 1;
    return failure;
  };

  return (args: string[]) => {
    const portQuery = args.find((arg) => /tcp:\d+$/i.test(arg));
    if (portQuery !== undefined) {
      const port = Number(portQuery.match(/(\d+)$/)?.[1]);
      const listenersOnly = args.includes("-sTCP:LISTEN");
      const matched = processes.filter(
        (process) =>
          process.listening?.includes(port) ||
          (!listenersOnly && process.connected?.includes(port)),
      );
      if (matched.length === 0) throw noMatch();
      return `${matched.map((process) => process.pid).join("\n")}\n`;
    }

    const pid = Number(args[args.indexOf("-p") + 1]);
    const process = processes.find((entry) => entry.pid === pid);
    if (process === undefined || process.opaque) throw noMatch();
    return `p${process.pid}\nc${process.command}\nfcwd\nn${process.cwd}\n`;
  };
}

/** An `lsof` that cannot answer at all — not installed, or refused. */
function brokenLsof(code: string) {
  return () => {
    throw Object.assign(new Error(code), { code });
  };
}

const viteServer: FakeProcess = {
  pid: 4821,
  command: "node",
  cwd: "/Users/m/worktrees/issue417",
  listening: [5173],
};
const browserTab: FakeProcess = {
  pid: 9999,
  command: "Google Chrome Helper",
  cwd: "/",
  connected: [5173],
};

describe("pidsOnPort", () => {
  it("reads the listening pids", () => {
    const second = { ...viteServer, pid: 4822 };
    expect(pidsOnPort(5173, stubLsof([viteServer, second]))).toEqual([
      4821, 4822,
    ]);
  });

  it("ignores processes merely connected to the port", () => {
    // A browser tab open on the cockpit does not serve it; counting it would
    // block the launcher and get the tab killed.
    expect(pidsOnPort(5173, stubLsof([viteServer, browserTab]))).toEqual([
      4821,
    ]);
  });

  it("reports a free port as unheld rather than failing", () => {
    expect(pidsOnPort(5173, stubLsof([]))).toEqual([]);
  });

  it("answers null when the lookup itself failed", () => {
    // Only lsof's exit 1 means "nothing matched". A missing binary or a refused
    // query must never read as a free port.
    expect(pidsOnPort(5173, brokenLsof("ENOENT"))).toBeNull();
    expect(pidsOnPort(5173, brokenLsof("EACCES"))).toBeNull();
  });
});

describe("findPortHolders", () => {
  it("names the command and working directory of each holder", () => {
    expect(findPortHolders([5173], stubLsof([viteServer]))).toEqual([
      {
        port: 5173,
        pid: 4821,
        command: "node",
        cwd: "/Users/m/worktrees/issue417",
      },
    ]);
  });

  it("keeps a holder whose details cannot be read", () => {
    const lsof = stubLsof([{ ...viteServer, opaque: true }]);

    expect(findPortHolders([5173], lsof)).toEqual([
      { port: 5173, pid: 4821, command: null, cwd: null },
    ]);
  });

  it("returns nothing when every port is free", () => {
    expect(findPortHolders([3000, 5173], stubLsof([]))).toEqual([]);
  });

  it("reports a port it could not inspect as held by an unknown", () => {
    expect(findPortHolders([3000], brokenLsof("ENOENT"))).toEqual([
      { port: 3000, pid: null, command: null, cwd: null },
    ]);
  });
});

describe("describeHeldPorts", () => {
  it("says nothing when no port is held", () => {
    expect(describeHeldPorts([])).toBeNull();
  });

  it("names the port, the command, the pid and the directory", () => {
    const message = describeHeldPorts(
      findPortHolders([5173], stubLsof([viteServer])),
    );

    expect(message).toContain("5173");
    expect(message).toContain("node");
    expect(message).toContain("4821");
    expect(message).toContain("/Users/m/worktrees/issue417");
  });

  it("still reports a holder it could not identify", () => {
    const message = describeHeldPorts([
      { port: 3000, pid: 4821, command: null, cwd: null },
    ]);

    expect(message).toContain("3000");
    expect(message).toContain("4821");
    expect(message).not.toContain("null");
  });

  it("refuses over a port whose lookup failed", () => {
    const message = describeHeldPorts(
      findPortHolders([3000], brokenLsof("ENOENT")),
    );

    expect(message).toContain("3000");
    expect(message).not.toContain("null");
  });
});

const mainWorktree = "/Users/m/maestro";
const nestedWorktree = "/Users/m/maestro/.claude/worktrees/issue396";
const siblingWorktree = "/Users/m/maestro/.claude/worktrees/issue417";
const worktrees = [mainWorktree, nestedWorktree, siblingWorktree];

/** A `git worktree list --porcelain` transcript over the paths given. */
function stubGit(paths: string[]) {
  return () =>
    `${paths
      .map(
        (path) =>
          `worktree ${path}\nHEAD 0123456789abcdef\nbranch refs/heads/x\n`,
      )
      .join("\n")}\n`;
}

describe("listWorktrees", () => {
  const keepPath = (path: string) => path;

  it("reads every worktree path git reports", () => {
    expect(
      listWorktrees("/Users/m/maestro", stubGit(worktrees), keepPath),
    ).toEqual(worktrees);
  });

  it("resolves each path, so a symlinked checkout still matches", () => {
    // Attribution compares strings; an unresolved path would make this
    // worktree's own run look like a sibling's, and the launcher never starts.
    const resolve = (path: string) => path.replace("/Users/m", "/real/m");

    expect(
      listWorktrees("/Users/m/maestro", stubGit([mainWorktree]), resolve),
    ).toEqual(["/real/m/maestro"]);
  });

  it("keeps a path it cannot resolve", () => {
    const missing = () => {
      throw new Error("ENOENT");
    };

    expect(
      listWorktrees("/Users/m/maestro", stubGit([mainWorktree]), missing),
    ).toEqual([mainWorktree]);
  });

  it("answers null when git cannot be asked", () => {
    // Never an empty list: that reads as "no worktrees own these ports" and
    // every holder would be killed — the eviction this whole seam prevents.
    expect(
      listWorktrees("/Users/m/maestro", brokenLsof("ENOENT") as () => string),
    ).toBeNull();
  });
});

describe("partitionHolders", () => {
  const holderIn = (cwd: string | null, port = 5173) => ({
    port,
    pid: 4821,
    command: "node",
    cwd,
  });

  it("refuses a holder that belongs to another worktree", () => {
    const { foreign, evictable } = partitionHolders(
      [holderIn(siblingWorktree)],
      {
        self: nestedWorktree,
        worktrees,
      },
    );

    expect(evictable).toEqual([]);
    expect(foreign).toEqual([
      { ...holderIn(siblingWorktree), worktree: siblingWorktree },
    ]);
  });

  it("evicts a previous run in this worktree", () => {
    // Deep inside it, as a dev server started from packages/web would be.
    const { foreign, evictable } = partitionHolders(
      [holderIn(`${nestedWorktree}/packages/web`)],
      { self: nestedWorktree, worktrees },
    );

    expect(foreign).toEqual([]);
    expect(evictable).toEqual([holderIn(`${nestedWorktree}/packages/web`)]);
  });

  it("refuses a holder no worktree owns", () => {
    // The pair is derived from the worktree's path, so an unrecognised holder
    // is somebody else's service — killing it costs their work, not ours.
    const { foreign, evictable } = partitionHolders(
      [holderIn("/Applications/SomeApp.app"), holderIn(null)],
      { self: nestedWorktree, worktrees },
    );

    expect(evictable).toEqual([]);
    expect(foreign.map((holder) => holder.worktree)).toEqual([null, null]);
  });

  it("attributes a nested worktree to itself, not to the repo containing it", () => {
    // This worktree lives inside the main one, so the longest match decides —
    // a prefix match would read every nested run as the main worktree's.
    const { foreign } = partitionHolders([holderIn(nestedWorktree)], {
      self: mainWorktree,
      worktrees,
    });

    expect(foreign.map((holder) => holder.worktree)).toEqual([nestedWorktree]);
  });

  it("refuses every holder when ownership could not be established", () => {
    // A failed worktree lookup must not read as "nobody owns these ports" —
    // that frees a sibling's cockpit on a passing git hiccup.
    const { foreign, evictable } = partitionHolders(
      [holderIn(siblingWorktree), holderIn("/Applications/SomeApp.app")],
      { self: nestedWorktree, worktrees: null },
    );

    expect(evictable).toEqual([]);
    expect(foreign.map((holder) => holder.worktree)).toEqual([null, null]);
  });
});

describe("processWorktree", () => {
  const launcher: FakeProcess = {
    pid: 771,
    command: "node",
    cwd: nestedWorktree,
  };

  it("names the worktree a running process sits in", () => {
    expect(processWorktree(771, { worktrees }, stubLsof([launcher]))).toEqual(
      nestedWorktree,
    );
  });

  it("answers null when the process cannot be read", () => {
    // A pid the pidfile names but the OS has reused reads as unowned, so the
    // launcher discards the note instead of killing a stranger's process group.
    expect(processWorktree(771, { worktrees }, stubLsof([]))).toBeNull();
  });

  it("answers null when the worktree list is unavailable", () => {
    expect(
      processWorktree(771, { worktrees: null }, stubLsof([launcher])),
    ).toBeNull();
  });
});

describe("describeForeignHolders", () => {
  it("says nothing when no foreign worktree holds a port", () => {
    expect(describeForeignHolders([])).toBeNull();
  });

  it("states that ownership is unknown rather than printing null", () => {
    const message = describeForeignHolders([
      {
        port: 3000,
        pid: 4821,
        command: "node",
        cwd: siblingWorktree,
        worktree: null,
      },
    ]);

    expect(message).toContain("3000");
    expect(message).toContain("4821");
    expect(message).not.toContain("null");
  });

  it("names the port, the process and the worktree holding it", () => {
    const message = describeForeignHolders([
      {
        port: 3000,
        pid: 4821,
        command: "node",
        cwd: `${siblingWorktree}/packages/server`,
        worktree: siblingWorktree,
      },
    ]);

    expect(message).toContain("3000");
    expect(message).toContain("node");
    expect(message).toContain("4821");
    expect(message).toContain(siblingWorktree);
  });
});
