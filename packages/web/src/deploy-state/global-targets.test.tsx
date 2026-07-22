import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { driftViewModel } from "../drift/drift-view-model";
import type { VersionDrift } from "../drift/use-drift";
import { GlobalTargets } from "./global-targets";

// Presentational: fed entirely through props (no fetch), so these exercise the
// per-tool rendering directly — the same states the container wires from
// TanStack Query. A behind row renders the Update mutation button, whose hook
// needs a QueryClient in scope; the provider here only satisfies that (no
// network is stubbed and nothing is clicked). Stories stay provider-free by not
// rendering the behind state.

// The container feeds GlobalTargets a drift view-model built from the global
// drift query; these helpers build the same model from raw behind pairs.
const ranDrift = (behind: VersionDrift[]) =>
  driftViewModel({ data: { behind }, isError: false });

const READY_NO_DRIFT = ranDrift([]);

function renderTargets(props: Partial<Parameters<typeof GlobalTargets>[0]>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <GlobalTargets
        isLoading={false}
        isError={false}
        tools={[]}
        skipped={[]}
        drift={READY_NO_DRIFT}
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe("GlobalTargets", () => {
  it("always labels the Global targets section, even while loading", () => {
    renderTargets({ isLoading: true });
    expect(screen.getByText(/global targets/i)).toBeInTheDocument();
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
    expect(screen.getByText("● empty")).toBeInTheDocument();
    expect(
      screen.queryByText(/nothing deployed here/i),
    ).not.toBeInTheDocument();
    // An empty card is not an error.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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
        { virtualPath: "hooks/pre-commit", packageType: "claude_hook" },
      ],
    });

    expect(
      screen.getByText(/install claude code or codex/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/skipped hooks\/pre-commit/i)).toBeInTheDocument();
  });

  it("surfaces a visible error, never an empty list, when the read failed", () => {
    renderTargets({ isError: true });

    expect(screen.getByRole("alert")).toHaveTextContent(/could not read/i);
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
      drift: ranDrift([{ name: "tdd", current: "v0.5.0", latest: "v0.5.1" }]),
    });

    expect(screen.getByText(/behind/i)).toBeInTheDocument();
    expect(screen.getByText(/v0\.5\.0\s*→\s*v0\.5\.1/)).toBeInTheDocument();
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
      drift: ranDrift([{ name: "tdd", current: "v0.5.0", latest: "v0.5.1" }]),
    });

    // The codex card reads as a clean empty card, not a drift warning.
    expect(screen.getByText("● empty")).toBeInTheDocument();
    expect(screen.queryByText(/not deployed here/i)).not.toBeInTheDocument();
  });
});
