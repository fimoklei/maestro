import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DeployedCell } from "./deployed-cell";

// The rendered deployed column: it reads a DeployedRollup (the pivot is tested in
// deployed-rollup.test.ts) and shows one number plus the honest chips — never the
// pivot logic itself.

describe("DeployedCell", () => {
  it("reads → N targets for a skill deployed to several targets", () => {
    render(
      <DeployedCell
        rollup={{ targetCount: 3, behindCount: 0, unknownCount: 0 }}
      />,
    );
    expect(screen.getByText("→ 3 targets")).toBeInTheDocument();
  });

  it("reads → 1 target (singular) for a skill on a single target", () => {
    render(
      <DeployedCell
        rollup={{ targetCount: 1, behindCount: 0, unknownCount: 0 }}
      />,
    );
    expect(screen.getByText("→ 1 target")).toBeInTheDocument();
  });

  it("reads not deployed, not a blank, when the skill reaches no target", () => {
    render(
      <DeployedCell
        rollup={{ targetCount: 0, behindCount: 0, unknownCount: 0 }}
      />,
    );
    expect(screen.getByText("Not deployed")).toBeInTheDocument();
    expect(screen.queryByText(/targets?/)).not.toBeInTheDocument();
  });

  it("shows a ▲N chip counting the targets confirmed behind latest", () => {
    render(
      <DeployedCell
        rollup={{ targetCount: 4, behindCount: 2, unknownCount: 0 }}
      />,
    );
    expect(screen.getByText("▲2")).toBeInTheDocument();
  });

  it("omits the drift chip when no target is behind", () => {
    render(
      <DeployedCell
        rollup={{ targetCount: 4, behindCount: 0, unknownCount: 0 }}
      />,
    );
    expect(screen.queryByText(/▲/)).not.toBeInTheDocument();
  });

  it("shows a loading marker, not 'not deployed', while targets are still resolving", () => {
    // A zero reach must not read as a definite "deployed nowhere" before the
    // local deploy-state reads resolve (J04: unknown never reads as a fact).
    render(
      <DeployedCell
        rollup={{
          targetCount: 0,
          behindCount: 0,
          unknownCount: 0,
          pending: true,
        }}
      />,
    );
    expect(screen.queryByText("Not deployed")).not.toBeInTheDocument();
    expect(screen.getByText("Loading deploy-state…")).toBeInTheDocument();
  });

  it("does not claim 'not deployed' when a deploy-state read failed", () => {
    render(
      <DeployedCell
        rollup={{
          targetCount: 0,
          behindCount: 0,
          unknownCount: 0,
          unreadable: true,
        }}
      />,
    );
    expect(screen.queryByText("Not deployed")).not.toBeInTheDocument();
    expect(screen.getByText("Loading deploy-state…")).toBeInTheDocument();
  });

  it("marks the count as incomplete when some reads are unresolved", () => {
    // The count is a confirmed lower bound; a trailing … says more may be
    // unread, so the number never reads as a final, complete reach.
    render(
      <DeployedCell
        rollup={{
          targetCount: 2,
          behindCount: 0,
          unknownCount: 0,
          unreadable: true,
        }}
      />,
    );
    expect(screen.getByText("→ 2 targets …")).toBeInTheDocument();
  });

  it("shows a checking marker so a still-running version check never reads as up-to-date", () => {
    render(
      <DeployedCell
        rollup={{
          targetCount: 2,
          behindCount: 0,
          unknownCount: 0,
          checking: true,
        }}
      />,
    );
    // A deployed row with no chips reads as "up-to-date everywhere"; while a
    // check is still running it must say so instead (J04).
    expect(screen.getByText("Loading updates…")).toBeInTheDocument();
  });

  it("keeps the known count in the readable label when the reach is incomplete", () => {
    // A screen reader must hear the confirmed count, not only the caveat — a
    // sighted user sees "→ 2 targets …", so an assistive-tech user must too.
    render(
      <DeployedCell
        rollup={{
          targetCount: 2,
          behindCount: 0,
          unknownCount: 0,
          unreadable: true,
        }}
      />,
    );
    expect(
      screen.getByText(/2 targets.*could not be read/i),
    ).toBeInTheDocument();
  });

  it("shows a separate ? marker for targets whose check could not run", () => {
    render(
      <DeployedCell
        rollup={{ targetCount: 3, behindCount: 0, unknownCount: 1 }}
      />,
    );
    // A ? that never merges into "up to date": it stands on its own, apart from
    // any ▲N (J04).
    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("explains the ▲N chip in text, not a hover-only title", () => {
    // A glyph plus a hover title is invisible to keyboard/touch/screen-reader
    // users; the meaning must be in readable text (frontend.md a11y baseline).
    render(
      <DeployedCell
        rollup={{ targetCount: 4, behindCount: 2, unknownCount: 0 }}
      />,
    );
    expect(
      screen.getByText(/2 targets are behind the latest version/i),
    ).toBeInTheDocument();
  });

  it("explains the ? marker in text, not a hover-only title", () => {
    render(
      <DeployedCell
        rollup={{ targetCount: 3, behindCount: 0, unknownCount: 1 }}
      />,
    );
    expect(
      screen.getByText(/drift check could not run on 1 target/i),
    ).toBeInTheDocument();
  });

  it("shows ▲N and ? side by side without merging them", () => {
    render(
      <DeployedCell
        rollup={{ targetCount: 5, behindCount: 2, unknownCount: 1 }}
      />,
    );
    expect(screen.getByText("▲2")).toBeInTheDocument();
    expect(screen.getByText("?")).toBeInTheDocument();
  });
});
