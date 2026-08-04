import type { ReleasePlan } from "@maestro/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReleaseDialog } from "./release-dialog";

const PLAN: ReleasePlan = {
  delta: [
    { kind: "added", name: "research", author: "Grace" },
    { kind: "changed", name: "tdd", author: "Ada" },
  ],
  previousTag: "v1.2.3",
  proposedStep: "minor",
  reason: "A skill was added.",
  versions: { major: "v2.0.0", minor: "v1.3.0", patch: "v1.2.4" },
  revision: "0123456789abcdef0123456789abcdef01234567",
  defaultBranch: "main",
  findings: [],
};

const renderReady = (plan: Partial<ReleasePlan> = {}, onClose = vi.fn()) =>
  render(
    <ReleaseDialog
      origin="github.com/fimoklei/agent-harness"
      load={{ kind: "ready", plan: { ...PLAN, ...plan } }}
      onClose={onClose}
    />,
  );

describe("ReleaseDialog", () => {
  it("leads with the proposed version and its reason", () => {
    renderReady();

    expect(screen.getByText("v1.3.0")).toBeInTheDocument();
    expect(screen.getByText("A skill was added.")).toBeInTheDocument();
  });

  it("names the previous tag, default branch, and exact revision", () => {
    renderReady();

    expect(screen.getByText("v1.2.3")).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();
    // The exact commit the tag would point at, so the author knows what ships.
    expect(screen.getByText(/0123456/)).toBeInTheDocument();
  });

  it("shows the whole merged delta with its authors", () => {
    renderReady();

    expect(screen.getByRole("row", { name: /research/ })).toHaveTextContent(
      "Grace",
    );
    expect(screen.getByRole("row", { name: /tdd/ })).toHaveTextContent("Ada");
  });

  it("lets the author pick a different step, and shows that version", async () => {
    renderReady();

    await userEvent.click(screen.getByRole("button", { name: "major" }));

    expect(screen.getByText("v2.0.0")).toBeInTheDocument();
  });

  it("shows one advisory line per structurally broken skill", () => {
    renderReady({
      findings: [
        { skill: "broken", problem: "missing-manifest" },
        { skill: "blank", problem: "empty-description" },
      ],
    });

    const advisory = screen.getByRole("status", { name: /structural/i });
    expect(within(advisory).getByText(/broken/)).toBeInTheDocument();
    expect(within(advisory).getByText(/blank/)).toBeInTheDocument();
  });

  it("shows no advisory section when every skill is sound", () => {
    renderReady();

    expect(
      screen.queryByRole("status", { name: /structural/i }),
    ).not.toBeInTheDocument();
  });

  it("does not offer a publish action — planning stops before the tag", () => {
    renderReady();

    expect(
      screen.queryByRole("button", { name: /release →|publish|tag/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
  });

  it("says it is working while the plan is still loading", () => {
    render(
      <ReleaseDialog
        origin="github.com/fimoklei/agent-harness"
        load={{ kind: "loading" }}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(/planning/i)).toBeInTheDocument();
  });

  it("states a plan that could not be computed as a readable error", () => {
    render(
      <ReleaseDialog
        origin="github.com/fimoklei/agent-harness"
        load={{ kind: "error", message: "Refresh the harness and try again." }}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(/refresh the harness/i);
  });
});
