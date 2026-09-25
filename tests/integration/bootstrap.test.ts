import { describe, expect, it } from "vitest";
import { checkPrerequisites, formatGaps } from "../../scripts/bootstrap.mjs";

interface FakeTool {
  name: string;
  /** Version banner `--version` prints; absent means the command is not found. */
  banner?: string;
}

/** A fake command runner answering only `<tool> --version`. */
function stubRun(tools: FakeTool[]) {
  return (cmd: string, args: string[]) => {
    if (args[0] !== "--version") throw new Error(`unexpected args for ${cmd}`);
    const tool = tools.find((entry) => entry.name === cmd);
    if (tool === undefined || tool.banner === undefined) {
      throw Object.assign(new Error(`${cmd}: command not found`), {
        code: "ENOENT",
      });
    }
    return `${tool.banner}\n`;
  };
}

describe("checkPrerequisites", () => {
  it("reports no gaps and no warning when everything matches", () => {
    const result = checkPrerequisites({
      nodeVersion: "v24.1.0",
      requiredMajor: 24,
      platform: "darwin",
      run: stubRun([
        { name: "pnpm", banner: "11.24.0" },
        {
          name: "apm",
          banner: "Agent Package Manager (APM) CLI version 0.26.0",
        },
      ]),
    });

    expect(result.gaps).toEqual([]);
    expect(result.apmWarning).toBeNull();
  });

  it("collects every gap in one pass, with the exact remedy for each", () => {
    const result = checkPrerequisites({
      nodeVersion: "v22.1.0",
      requiredMajor: 24,
      platform: "darwin",
      run: stubRun([]),
    });

    expect(result.gaps).toHaveLength(3);
    expect(result.gaps.map((gap) => gap.tool)).toEqual(["Node", "pnpm", "apm"]);
    const [nodeGap, pnpmGap, apmGap] = result.gaps;
    expect(nodeGap?.fix).toContain("https://nodejs.org/");
    expect(nodeGap?.fix).toContain("v22.1.0");
    expect(pnpmGap?.fix).toBe("Run `corepack enable`");
    expect(apmGap?.fix).toBe("Run `curl -sSL https://aka.ms/apm-unix | sh`");
  });

  it("warns instead of failing when apm is present but not 0.26.0", () => {
    const result = checkPrerequisites({
      nodeVersion: "v24.1.0",
      requiredMajor: 24,
      platform: "darwin",
      run: stubRun([
        { name: "pnpm", banner: "11.24.0" },
        {
          name: "apm",
          banner: "Agent Package Manager (APM) CLI version 0.25.0",
        },
      ]),
    });

    expect(result.gaps).toEqual([]);
    expect(result.apmWarning).toBe(
      "apm 0.25.0 found; Maestro is measured against 0.26.0 — continuing anyway",
    );
  });

  it("prints the Windows apm install line when the gap is on win32", () => {
    const result = checkPrerequisites({
      nodeVersion: "v24.1.0",
      requiredMajor: 24,
      platform: "win32",
      run: stubRun([{ name: "pnpm", banner: "11.24.0" }]),
    });

    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]?.fix).toBe(
      "Run `irm https://aka.ms/apm-windows | iex`",
    );
  });
});

describe("formatGaps", () => {
  it("lists one line per gap under a single refusal heading", () => {
    const text = formatGaps([
      {
        tool: "Node",
        fix: "Install Node 24 or newer from https://nodejs.org/ (found v22.1.0)",
      },
      { tool: "pnpm", fix: "Run `corepack enable`" },
    ]);

    expect(text).toBe(
      [
        "[bootstrap] cannot start — fix these first:",
        "  - Node: Install Node 24 or newer from https://nodejs.org/ (found v22.1.0)",
        "  - pnpm: Run `corepack enable`",
      ].join("\n"),
    );
  });
});
