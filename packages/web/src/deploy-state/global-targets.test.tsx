import { QueryClientProvider } from "@tanstack/react-query";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { driftViewModel } from "../drift/drift-view-model";
import type { ReadDriftEntry } from "../drift/use-drift";
import { renderWithQuery } from "../test-utils";
import { GlobalTargets } from "./global-targets";

// Presentational, fed via props. QueryClientProvider only satisfies the
// Update mutation hook a behind row renders — nothing is stubbed or clicked.

// The container feeds GlobalTargets a drift view-model built from the global
// drift query; these helpers build the same model from raw behind pairs.
const ranDrift = (behind: ReadDriftEntry[]) =>
  driftViewModel({ data: { behind }, isError: false });

const READY_NO_DRIFT = ranDrift([]);

function renderTargets(props: Partial<Parameters<typeof GlobalTargets>[0]>) {
  return renderWithQuery(
    <GlobalTargets
      isLoading={false}
      isError={false}
      tools={[]}
      skipped={[]}
      drift={READY_NO_DRIFT}
      onStartDeploy={() => {}}
      {...props}
    />,
  );
}

describe("GlobalTargets", () => {
  it("never reads a tool card as empty while a global record needs attention", () => {
    renderTargets({
      tools: [{ tool: "claude", primitives: [] }],
      skipped: [
        {
          reason: "invalid-package",
          virtualPath: "skills/tdd",
          packageType: "invalid",
        },
      ],
    });

    expect(screen.getByText("▲ Attention")).toBeInTheDocument();
    expect(screen.queryByText("● Empty")).not.toBeInTheDocument();
  });

  it("names the recorded type of an unsupported deployment and how to recover", () => {
    renderTargets({
      tools: [{ tool: "claude", primitives: [] }],
      skipped: [
        {
          reason: "unmanageable-skill",
          virtualPath: "skills/tdd",
          packageType: "hybrid",
        },
      ],
    });

    expect(
      screen.getByText(/skills\/tdd is deployed as hybrid/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/publish a release/i)).toBeInTheDocument();
  });

  it("always labels the Global targets section, even while loading", () => {
    renderTargets({ isLoading: true });
    expect(
      screen.getByRole("heading", { name: /global targets/i }),
    ).toBeInTheDocument();
  });

  it("counts the detected tools beside the section title", () => {
    renderTargets({
      tools: [
        { tool: "claude", primitives: [] },
        { tool: "codex", primitives: [] },
      ],
    });

    expect(screen.getByText("2 detected")).toBeInTheDocument();
  });

  it("states no count before the read has landed", () => {
    // An unread section is not a zero-tool one — the same J03 split the body
    // already makes between loading, failed, and honestly empty.
    renderTargets({ isLoading: true });

    expect(screen.queryByText(/detected/i)).not.toBeInTheDocument();
  });

  it("renders one card per detected tool, headlined by the tool name", () => {
    renderTargets({
      tools: [
        {
          tool: "claude",
          primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
        },
        {
          tool: "codex",
          primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
        },
      ],
    });

    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText("Codex")).toBeInTheDocument();
    // Each card shows the tool's own destination as a secondary detail.
    expect(screen.getByText("~/.claude/skills")).toBeInTheDocument();
    expect(screen.getByText("~/.agents/skills")).toBeInTheDocument();
    // Both cards list the deployed skill with its version.
    expect(screen.getAllByText("tdd")).toHaveLength(2);
  });

  it("renders a detected-but-empty tool as a header-only card, not a missing one", () => {
    renderTargets({ tools: [{ tool: "codex", primitives: [] }] });

    expect(screen.getByText("Codex")).toBeInTheDocument();
    // Emptiness is a header status, not a body sentence, and it uses the same
    // word the sidebar uses for the same target.
    expect(screen.getByText("● Empty")).toBeInTheDocument();
    expect(
      screen.queryByText(/nothing deployed here/i),
    ).not.toBeInTheDocument();
    // An empty card is not an error.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("names the origin instead of calling a target empty when it holds foreign primitives (#655)", () => {
    renderTargets({
      tools: [{ tool: "claude", primitives: [] }],
      otherOrigins: ["fimoklei/agent-harness"],
    });

    expect(screen.getByText("● Other origin")).toBeInTheDocument();
    expect(screen.queryByText("● Empty")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /holds primitives deployed from fimoklei\/agent-harness/i,
      ),
    ).toBeInTheDocument();
  });

  it("still reads as empty when nothing on the lockfile names another origin", () => {
    renderTargets({ tools: [{ tool: "claude", primitives: [] }] });

    expect(screen.getByText("● Empty")).toBeInTheDocument();
    expect(screen.queryByText("● Other origin")).not.toBeInTheDocument();
  });

  it("shows an install hint and no cards when no supported tool is detected", () => {
    renderTargets({ tools: [] });

    expect(
      screen.getByText(/install claude code or codex/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("Claude Code")).not.toBeInTheDocument();
    expect(screen.queryByText("Codex")).not.toBeInTheDocument();
  });

  it("still surfaces a skipped entry when no tool is detected, never dropping it", () => {
    // Skipped entries are section-wide; the zero-tools install hint must not
    // swallow them (J03: never silently dropped).
    renderTargets({
      tools: [],
      skipped: [
        {
          reason: "unsupported-type",
          virtualPath: "hooks/pre-commit",
          packageType: "claude_hook",
        },
      ],
    });

    expect(
      screen.getByText(/install claude code or codex/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/hooks\/pre-commit is deployed as/i),
    ).toBeInTheDocument();
  });

  it("surfaces a visible error, never an empty list, when the read failed", () => {
    renderTargets({ isError: true });

    // A read that failed on load states itself without interrupting a reader
    // mid-sentence, so it is a status, never an alert (#612).
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent(/Global targets not read/i);
    // A read failure names a way out; a dead end leaves the user guessing.
    expect(notice).toHaveTextContent(/reload the page/i);
    // The error must not be mistaken for "no tools detected".
    expect(
      screen.queryByText(/install claude code or codex/i),
    ).not.toBeInTheDocument();
  });

  it("maps the global drift onto the tool card where the skill is deployed", () => {
    renderTargets({
      tools: [
        {
          tool: "claude",
          primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
        },
      ],
      drift: ranDrift([
        { name: "tdd", current: "v0.5.0", latest: "v0.5.1", reading: "behind" },
      ]),
    });

    expect(screen.getByText("Behind")).toBeInTheDocument();
    expect(screen.getByText(/v0\.5\.0\s*→\s*v0\.5\.1/)).toBeInTheDocument();
  });

  it("reads a global target with a no-longer-released skill as attention", () => {
    renderTargets({
      tools: [
        {
          tool: "claude",
          primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
        },
      ],
      drift: ranDrift([
        {
          name: "tdd",
          current: "v0.5.0",
          latest: "v0.5.1",
          reading: "no-longer-released",
        },
      ]),
    });

    expect(screen.getByText("▲ Attention")).toBeInTheDocument();
    expect(screen.getByText("No longer released")).toBeInTheDocument();
    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /update skill/i })).toBeNull();
  });

  it("does not spill one tool's drift onto another tool's empty card", () => {
    // A skill behind on claude must not surface as an orphan "also behind" on a
    // detected-but-empty codex card — that card just doesn't have the skill.
    renderTargets({
      tools: [
        {
          tool: "claude",
          primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
        },
        { tool: "codex", primitives: [] },
      ],
      drift: ranDrift([
        { name: "tdd", current: "v0.5.0", latest: "v0.5.1", reading: "behind" },
      ]),
    });

    // The codex card reads as a clean empty card, not a drift warning.
    expect(screen.getByText("● Empty")).toBeInTheDocument();
    expect(screen.queryByText(/not deployed here/i)).not.toBeInTheDocument();
  });
});
