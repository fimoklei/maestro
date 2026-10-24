import type { ReleasePlan } from "@maestro/core";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { sentence } from "../test-utils";
import type { NoticeContent } from "../ui/notice";
import { ReleaseDialog } from "./release-dialog";

// The version under the Releasing as label.
const releasingAs = () => {
  const value = screen.getByText("Releasing as").nextElementSibling;
  if (value === null) throw new Error("Releasing as has no value");
  return value;
};

// A change's row in the Pending release list.
const row = (name: string) => {
  const item = screen.getByText(name).closest("li");
  if (item === null) throw new Error(`${name} has no row`);
  return item;
};

const PLAN: ReleasePlan = {
  delta: [
    {
      type: "skill",
      kind: "added",
      change: "addition",
      name: "research",
      author: "Grace",
    },
    {
      type: "skill",
      kind: "changed",
      change: "edit",
      name: "tdd",
      author: "Ada",
    },
  ],
  previousTag: "v1.2.3",
  previousTagCommit: "fedcba9876543210fedcba9876543210fedcba98",
  proposedStep: "minor",
  reason: "A skill was added.",
  versions: { major: "v2.0.0", minor: "v1.3.0", patch: "v1.2.4" },
  revision: "0123456789abcdef0123456789abcdef01234567",
  defaultBranch: "main",
  findings: [],
  blocked: null,
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
  it("titles the panel with the confirm button's verb and the repo name", () => {
    renderReady();

    const title = "Publish release for agent-harness";
    expect(
      screen.getByRole("heading", { name: title, level: 2 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: title })).toBeInTheDocument();
  });

  it("names the version it would release and why Maestro suggested it", () => {
    renderReady();

    expect(releasingAs()).toHaveTextContent(/^v1\.3\.0$/);
    expect(
      screen.getByText(sentence(/Suggested: v1\.3\.0\. A skill was added\./)),
    ).toBeInTheDocument();
  });

  it("sets the suggested version apart", () => {
    renderReady();

    const line = screen.getByText(sentence(/^Suggested: v1\.3\.0\./));
    expect(
      within(line).getByText("v1.3.0", { selector: ".font-mono" }),
    ).toBeInTheDocument();
  });

  it("sets the Releasing as label in the sans face and its version in mono", () => {
    renderReady();

    const label = screen.getByText("Releasing as");
    expect(label).toHaveClass("font-ui");
    expect(label).not.toHaveClass("font-mono");
    expect(label).not.toHaveClass("uppercase");
    expect(releasingAs()).toHaveClass("font-mono");
  });

  it("names the full origin as the card's first fact", () => {
    renderReady();

    const facts = screen.getAllByRole("term").map((term) => term.textContent);
    expect(facts.slice(0, 4)).toEqual([
      "Origin",
      "Previous tag",
      "Default branch",
      "Revision",
    ]);
    expect(screen.getByText("Origin").nextElementSibling).toHaveTextContent(
      "github.com/fimoklei/agent-harness",
    );
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

  it("states a first release in the release words of every screen", () => {
    renderReady({ previousTag: null, previousTagCommit: null });

    expect(
      screen.getByText("Previous tag").nextElementSibling,
    ).toHaveTextContent("Not released yet");
  });

  it("starts with the version card, so the step stays in view above the list", () => {
    renderReady({
      findings: [{ skill: "broken", problem: "missing-manifest" }],
    });

    const step = screen.getByRole("button", { name: "Major" });
    const delta = screen.getByRole("heading", {
      level: 3,
      name: /pending release/i,
    });
    const advisory = screen.getByText("Skill checks found issues");

    expect(
      step.compareDocumentPosition(delta) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // A notice in a dialog sits above the footer.
    expect(
      row("tdd").compareDocumentPosition(advisory) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps Maestro's proposal readable after the author overrides it", async () => {
    renderReady();

    await userEvent.click(screen.getByRole("button", { name: "Major" }));

    expect(screen.getByText("v2.0.0")).toBeInTheDocument();
    // The proposal is a fact about the delta, not about the author's pick.
    expect(
      screen.getByText(sentence(/Suggested: v1\.3\.0\. A skill was added\./)),
    ).toBeInTheDocument();
  });

  it("shows the whole merged delta with each change's type and author", () => {
    renderReady({
      delta: [
        {
          type: "skill",
          kind: "added",
          change: "addition",
          name: "research",
          author: "Grace",
        },
        {
          type: "prompt",
          kind: "changed",
          change: "edit",
          name: "review",
          author: "Ada",
        },
      ],
    });

    expect(row("research")).toHaveTextContent(/^researchSkillGrace$/);
    expect(row("review")).toHaveTextContent(/^reviewPromptAda$/);
    expect(
      screen.getByRole("heading", { level: 3, name: /pending release/i }),
    ).toBeInTheDocument();
  });

  // Moved from the retired PendingRelease (#1045).
  it("shows a rename as one movement, naming the name it had", () => {
    renderReady({
      delta: [
        {
          type: "skill",
          kind: "renamed",
          change: "rename",
          name: "test-first",
          previousName: "tdd",
          author: "Ada",
        },
      ],
    });

    expect(row("tdd → test-first")).toBeInTheDocument();
  });

  it("groups the delta by its change words, in order, each with its count", () => {
    renderReady({
      delta: [
        {
          type: "skill",
          kind: "removed",
          change: "deletion",
          name: "grilling",
          author: "Linus",
        },
        {
          type: "skill",
          kind: "changed",
          change: "edit",
          name: "tdd",
          author: "Ada",
        },
        {
          type: "prompt",
          kind: "renamed",
          change: "rename",
          name: "triage",
          previousName: "sort",
          author: "Ada",
        },
        {
          type: "skill",
          kind: "added",
          change: "addition",
          name: "research",
          author: "Grace",
        },
        {
          type: "prompt",
          kind: "added",
          change: "addition",
          name: "review",
          author: "Ada",
        },
      ],
    });

    expect(
      screen
        .getAllByRole("group", { name: / · / })
        .map((group) => within(group).getByRole("button").textContent),
    ).toEqual(["Added · 2", "Changed · 1", "Renamed · 1", "Deleted · 1"]);
    expect(
      within(screen.getByRole("group", { name: "Deleted · 1" })).getByText(
        "grilling",
      ),
    ).toBeInTheDocument();
  });

  it("draws no group nothing moved into", () => {
    renderReady({
      delta: [
        {
          type: "skill",
          kind: "removed",
          change: "deletion",
          name: "grilling",
          author: "Linus",
        },
      ],
    });

    expect(screen.getAllByRole("group", { name: / · / })).toHaveLength(1);
    expect(screen.queryByText(/Removed/)).not.toBeInTheDocument();
  });

  it("folds a group and opens it again", async () => {
    renderReady();
    const fold = screen.getByRole("button", { name: "Added · 1" });

    expect(fold).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(fold);
    expect(screen.getByText("research")).not.toBeVisible();
    expect(screen.getByText("tdd")).toBeVisible();
    await userEvent.click(fold);
    expect(screen.getByText("research")).toBeVisible();
  });

  it("says plainly that an author is unknown rather than leaving a gap", () => {
    renderReady({
      delta: [
        {
          type: "skill",
          kind: "added",
          change: "addition",
          name: "research",
          author: null,
        },
      ],
    });

    expect(row("research")).toHaveTextContent("Unknown");
  });

  it("states an empty plan, and offers no version to release", () => {
    renderReady({ delta: [], blocked: "empty-delta" });

    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "No changes yet. Changes merged after the last release appear here.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Releasing as")).not.toBeInTheDocument();
    expect(screen.queryByText(sentence(/^Suggested:/))).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Major" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Origin")).toBeInTheDocument();
    expect(screen.getByText("Previous tag")).toBeInTheDocument();
  });

  it("lets the author pick a different step, and shows that version", async () => {
    renderReady();

    await userEvent.click(screen.getByRole("button", { name: "Major" }));

    expect(screen.getByText("v2.0.0")).toBeInTheDocument();
  });

  it("states the structural checks as a warning, one line per broken skill", () => {
    renderReady({
      findings: [
        { skill: "broken", problem: "missing-manifest" },
        { skill: "blank", problem: "empty-description" },
      ],
    });

    const advisory = screen.getByRole("status");
    expect(advisory).toHaveTextContent("⚠");
    expect(advisory).toHaveTextContent("Skill checks found issues");
    expect(advisory).toHaveTextContent("You can still publish the release.");
    expect(
      within(advisory)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["broken has no SKILL.md.", "blank has an empty description."]);
  });

  it("shows no structural checks when every skill is sound", () => {
    renderReady();

    expect(
      screen.queryByText("Skill checks found issues"),
    ).not.toBeInTheDocument();
  });

  it("opens with focus on Cancel", async () => {
    renderReady();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus(),
    );
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

  it("holds publish back when nothing has changed since the last release", async () => {
    const onPublish = vi.fn();
    renderReady({ delta: [], blocked: "empty-delta" }, { onPublish });

    const publish = screen.getByRole("button", { name: "Publish release" });
    expect(publish).toHaveAccessibleDescription(
      "No changes yet. Changes merged after the last release appear here.",
    );
    expect(publish).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(publish);
    expect(onPublish).not.toHaveBeenCalled();
  });

  it("holds publish back while the default branch holds a SKILL.md at its root", async () => {
    const onPublish = vi.fn();
    renderReady(
      { blocked: "root-skill-file", defaultBranch: "trunk" },
      { onPublish },
    );

    const notice = screen.getByText("SKILL.md at the Harness root");
    expect(notice).toBeInTheDocument();
    expect(
      screen.getByText(
        sentence(/^Remove SKILL\.md from the root of trunk on GitHub\. /),
      ),
    ).toBeInTheDocument();
    const publish = screen.getByRole("button", { name: "Publish release" });
    expect(publish).toHaveAttribute("aria-disabled", "true");
    expect(publish).toHaveAccessibleDescription(
      expect.stringContaining("SKILL.md at the Harness root"),
    );
    await userEvent.click(publish);
    expect(onPublish).not.toHaveBeenCalled();
  });

  it("decides whether it can publish from the plan's block alone, never the delta", async () => {
    const onPublish = vi.fn();
    renderReady({ delta: [], blocked: null }, { onPublish });

    await userEvent.click(
      screen.getByRole("button", { name: "Publish release" }),
    );

    expect(onPublish).toHaveBeenCalled();
  });

  it("says Publishing… and cannot be closed while a release is in flight", async () => {
    const onClose = vi.fn();
    renderReady({}, { publishing: true, onClose });

    expect(screen.getByRole("button", { name: "Publishing…" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("states a failed publish above the footer, and the leave control becomes Close", () => {
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

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/the tag was not pushed/i);
    const step = screen.getByRole("button", { name: "Major" });
    const leave = screen.getAllByRole("button", { name: "Close" }).at(-1);
    expect(
      step.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      alert.compareDocumentPosition(leave as HTMLElement) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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

    const publish = screen.getByRole("button", { name: "Publish release" });
    expect(publish).toHaveAccessibleDescription("Loading the release plan…");
    expect(publish).toHaveAttribute("aria-disabled", "true");
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
            message: "Select Re-read Harness, then open the release again.",
          },
        }}
        onClose={vi.fn()}
        onPublish={vi.fn()}
        publishing={false}
        publishError={null}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      /select re-read harness/i,
    );
    const publish = screen.getByRole("button", { name: "Publish release" });
    expect(publish).toHaveAccessibleDescription(
      expect.stringMatching(
        /no answer from GitHub.*Select Re-read Harness, then open the release again\./,
      ),
    );
    expect(publish).toHaveAttribute("aria-disabled", "true");
  });
});
