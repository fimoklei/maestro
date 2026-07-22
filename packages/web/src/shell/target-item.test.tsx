import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TargetItem } from "./target-item";

// A target row is a list item, so wrap it in a <ul> for valid markup.
function renderRow(props: Parameters<typeof TargetItem>[0]) {
  return render(
    <ul>
      <TargetItem {...props} />
    </ul>,
  );
}

describe("TargetItem", () => {
  it("shows the drift count as a ▲N badge when a target is behind", () => {
    renderRow({
      label: "Claude Code",
      kind: "global",
      indicator: "drift",
      driftCount: 2,
    });
    expect(screen.getByText("▲2")).toBeInTheDocument();
  });

  it("carries the drift count as readable text for screen readers, not just the glyph", () => {
    renderRow({
      label: "Claude Code",
      kind: "global",
      indicator: "drift",
      driftCount: 2,
    });
    // The ▲N glyph alone is not announced meaningfully; a text reading must be
    // present so a screen-reader user hears the state, not just sees colour/shape.
    expect(screen.getByText(/2 behind/i)).toBeInTheDocument();
  });

  it("renders an unknown target as the ? marker with a readable 'unknown' reading", () => {
    renderRow({
      label: "Claude Code",
      kind: "global",
      indicator: "unknown",
      driftCount: 0,
    });
    expect(screen.getByText("?")).toBeInTheDocument();
    expect(screen.getByText(/unknown/i)).toBeInTheDocument();
    expect(screen.queryByText(/in sync/i)).not.toBeInTheDocument();
  });

  it("reads a target with nothing behind as in sync, with no arrow", () => {
    renderRow({
      label: "Claude Code",
      kind: "global",
      indicator: "ok",
      driftCount: 0,
    });
    expect(screen.getByText(/in sync/i)).toBeInTheDocument();
    expect(screen.queryByText(/▲/)).not.toBeInTheDocument();
  });

  it.each([
    ["empty", /empty/i],
    ["unknown", /unknown/i],
    ["unverified", /unverified/i],
    ["pending", /checking/i],
  ] as const)(
    "renders the %s state as its own reading, never as in sync",
    (indicator, pattern) => {
      renderRow({
        label: "Claude Code",
        kind: "global",
        indicator,
        driftCount: 0,
      });
      expect(screen.getByText(pattern)).toBeInTheDocument();
      expect(screen.queryByText(/in sync/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/▲/)).not.toBeInTheDocument();
    },
  );
});
