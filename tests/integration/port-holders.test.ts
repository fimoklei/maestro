import { describe, expect, it } from "vitest";
import {
  describeHeldPorts,
  findPortHolders,
  pidsOnPort,
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
});
