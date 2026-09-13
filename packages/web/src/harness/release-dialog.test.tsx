import type { ReleasePlan } from "@maestro/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { NoticeContent } from "../ui/notice";
import { ReleaseDialog } from "./release-dialog";

const PLAN: ReleasePlan = {
  delta: [
    { kind: "added", name: "research", author: "Grace" },
    { kind: "changed", name: "tdd", author: "Ada" },
  ],
  previousTag: "v1.2.3",
  previousTagCommit: "fedcba9876543210fedcba9876543210fedcba98",
  proposedStep: "minor",
  reason: "A skill was added.",
  versions: { major: "v2.0.0", minor: "v1.3.0", patch: "v1.2.4" },
  revision: "0123456789abcdef0123456789abcdef01234567",
  defaultBranch: "main",
  findings: [],
};

const renderReady = (
  plan: Partial<ReleasePlan> = {},
  overrides: {
    onClose?: () => void;
    onPublish?: (step: ReleasePlan["proposedStep"]) => void;
    publishing?: boolean;
    publishError?: NoticeContent | null;
  } = {},
) =>
  render(
    <ReleaseDialog
      origin="github.com/fimoklei/agent-harness"
      load={{ kind: "ready", plan: { ...PLAN, ...plan } }}
      onClose={overrides.onClose ?? vi.fn()}
      onPublish={overrides.onPublish ?? vi.fn()}
      publishing={overrides.publishing ?? false}
      publishError={overrides.publishError ?? null}
    />,
  );

describe("ReleaseDialog", () => {
  it("titles the panel with the confirm button's verb and the origin", () => {
    renderReady();

    const title = "Publish release for github.com/fimoklei/agent-harness";
    expect(
      screen.getByRole("heading", { name: title, level: 2 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: title })).toBeInTheDocument();
  });

  it("names the version it would release and why Maestro suggested it", () => {
    renderReady();

    expect(screen.getByText("v1.3.0")).toBeInTheDocument();
    expect(
      screen.getByText(/Suggested: v1\.3\.0\. A skill was added\./),
    ).toBeInTheDocument();
  });

  it("names the previous tag, default branch, and exact revision", () => {
    renderReady();

    expect(screen.getByText("v1.2.3")).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();
    // The whole commit, not an abbreviation: a short hash is not the exact
    // revision the tag would point at, and need not be unique (#519).
    expect(
      screen.getByText("0123456789abcdef0123456789abcdef01234567"),
    ).toBeInTheDocument();
  });

  it("puts what ships before the step, so the choice follows its consequences", () => {
    renderReady({
      findings: [{ skill: "broken", problem: "missing-manifest" }],
    });

    // The last table, so the step follows the whole delta and not just its
    // first section.
    const delta = screen.getAllByRole("table").at(-1) as HTMLElement;
    const advisory = screen.getByRole("status", { name: /structural/i });
    const step = screen.getByRole("button", { name: "Major" });

    expect(
      delta.compareDocumentPosition(step) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      advisory.compareDocumentPosition(step) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps Maestro's proposal readable after the author overrides it", async () => {
    renderReady();

    await userEvent.click(screen.getByRole("button", { name: "Major" }));

    expect(screen.getByText("v2.0.0")).toBeInTheDocument();
    // The proposal is a fact about the delta, not about the author's pick.
    expect(
      screen.getByText(/Suggested: v1\.3\.0\. A skill was added\./),
    ).toBeInTheDocument();
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

    await userEvent.click(screen.getByRole("button", { name: "Major" }));

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

  // The one publishing action in the Harness keeps the amber fill (#876).
  it("fills the publish confirmation with amber", () => {
    renderReady();

    expect(
      screen.getByRole("button", { name: /^publish release$/i }),
    ).toHaveClass("bg-amber");
  });

  it("publishes the proposed step when the author does not override it", async () => {
    const onPublish = vi.fn();
    renderReady({}, { onPublish });

    await userEvent.click(
      screen.getByRole("button", { name: /^publish release$/i }),
    );

    expect(onPublish).toHaveBeenCalledWith("minor", PLAN);
  });

  it("publishes the step the author chose, not the proposal", async () => {
    const onPublish = vi.fn();
    renderReady({}, { onPublish });

    await userEvent.click(screen.getByRole("button", { name: "Major" }));
    await userEvent.click(
      screen.getByRole("button", { name: /^publish release$/i }),
    );

    expect(onPublish).toHaveBeenCalledWith("major", PLAN);
  });

  it("drops the author's step choice when the plan underneath it is replaced", async () => {
    // A step picked against one previous tag names a different release under
    // the next. The recomputed plan's own proposal takes over (#521).
    const onPublish = vi.fn();
    const { rerender } = renderReady({}, { onPublish });
    await userEvent.click(screen.getByRole("button", { name: "Major" }));
    expect(screen.getByText("v2.0.0")).toBeInTheDocument();

    const recomputed: ReleasePlan = {
      ...PLAN,
      previousTag: "v1.3.0",
      previousTagCommit: "1111111111111111111111111111111111111111",
      proposedStep: "patch",
      versions: { major: "v2.0.0", minor: "v1.4.0", patch: "v1.3.1" },
      revision: "89abcdef0123456789abcdef0123456789abcdef",
    };
    rerender(
      <ReleaseDialog
        origin="github.com/fimoklei/agent-harness"
        load={{ kind: "ready", plan: recomputed }}
        onClose={vi.fn()}
        onPublish={onPublish}
        publishing={false}
        publishError={null}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /^publish release$/i }),
    );
    expect(onPublish).toHaveBeenCalledWith("patch", recomputed);
  });

  it("disables publish and says so while a release is in flight", () => {
    renderReady({}, { publishing: true });

    expect(screen.getByRole("button", { name: /publishing/i })).toBeDisabled();
  });

  it("states a failed publish as a readable error", () => {
    renderReady(
      {},
      {
        publishError: {
          level: "error",
          label: "the tag was not pushed",
          message: "The Harness is as it was.",
        },
      },
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      /the tag was not pushed/i,
    );
  });

  it("says it is working while the plan is still loading", () => {
    render(
      <ReleaseDialog
        origin="github.com/fimoklei/agent-harness"
        load={{ kind: "loading" }}
        onClose={vi.fn()}
        onPublish={vi.fn()}
        publishing={false}
        publishError={null}
      />,
    );

    expect(screen.getByText(/loading the release plan/i)).toBeInTheDocument();
  });

  it("states a plan that could not be computed as a readable error", () => {
    render(
      <ReleaseDialog
        origin="github.com/fimoklei/agent-harness"
        load={{
          kind: "error",
          notice: {
            level: "error",
            label: "no answer from GitHub",
            message: "Select Retry check, then open the release again.",
          },
        }}
        onClose={vi.fn()}
        onPublish={vi.fn()}
        publishing={false}
        publishError={null}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(/select retry check/i);
  });
});
