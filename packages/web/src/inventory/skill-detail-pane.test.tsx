import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DriftStatus } from "../drift/drift-view-model";
import type { FootItem } from "../ui/foot-actions";
import type { SkillDeployment } from "./skill-deployments";
import { SkillDetailPane } from "./skill-detail-pane";
import type { Primitive } from "./use-inventory";

const tdd: Primitive = {
  type: "skill",
  name: "tdd",
  description: "Test-driven development.",
};

const dep = (
  label: string,
  release: string,
  status: DriftStatus,
): SkillDeployment => ({
  label,
  release,
  status,
  version: release,
  target: { kind: "repo", repoPath: `/dev/${label}` },
  removeTarget: { kind: "repo", repoPath: `/dev/${label}` },
  updateName: label,
  rowId: `repo:/dev/${label}`,
  updatable: false,
});

const DEPLOY: FootItem = { label: "Deploy skill", onSelect: () => {} };

function renderPane(overrides: {
  deployments?: SkillDeployment[];
  targetCount?: number | null;
  unconfirmed?: boolean;
  footItems?: FootItem[];
  targetItems?: ComponentProps["targetItems"];
  onClose?: () => void;
  getTriggerElement?: (name: string) => HTMLElement | null;
}) {
  return render(
    <SkillDetailPane
      primitive={tdd}
      targetCount={
        overrides.targetCount === undefined
          ? (overrides.deployments?.length ?? 0)
          : overrides.targetCount
      }
      deployments={overrides.deployments ?? []}
      unconfirmed={overrides.unconfirmed ?? false}
      targetItems={overrides.targetItems ?? (() => [])}
      footItems={overrides.footItems ?? [DEPLOY]}
      onClose={overrides.onClose ?? (() => {})}
      getTriggerElement={overrides.getTriggerElement ?? (() => null)}
    />,
  );
}

type ComponentProps = React.ComponentProps<typeof SkillDetailPane>;

// One row per target: its mark, its name, the release it follows, its ⋮.
const targetRow = (label: string) =>
  screen
    .getAllByRole("listitem")
    .find((item) => within(item).queryByText(label) !== null) as HTMLElement;

// A fact row: its label beside its value (#1065).
const fact = (label: string) =>
  screen.queryAllByText(label).find((element) => element.tagName === "DT")
    ?.nextElementSibling?.textContent ?? null;

const pane = () => screen.getByRole("complementary", { name: "tdd detail" });

describe("SkillDetailPane", () => {
  it("names the skill and shows its description", () => {
    renderPane({});

    expect(screen.getByRole("heading", { name: /tdd/i })).toBeInTheDocument();
    expect(screen.getByText("Test-driven development.")).toBeInTheDocument();
  });

  // #1065: facts first, label beside value, then the description.
  it("states Type and Targets as label/value rows, the description after them", () => {
    renderPane({
      deployments: [
        dep("Claude Code", "v1.0.0", "up-to-date"),
        dep("Codex", "v1.0.0", "up-to-date"),
        dep("acme-web", "v1.0.0", "up-to-date"),
      ],
    });

    expect(fact("Type")).toBe("Skill");
    expect(fact("Targets")).toBe("3");
    const list = screen.getByText("Type").closest("dl") as HTMLElement;
    expect(list).toHaveClass("grid-cols-[auto_1fr]");
    expect(
      list.compareDocumentPosition(
        screen.getByText("Test-driven development."),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("claims no Targets count before every read has answered", () => {
    renderPane({ targetCount: null, unconfirmed: true });

    expect(fact("Targets")).toBeNull();
  });

  it("names the release each target follows beside its label, in mono", () => {
    renderPane({
      deployments: [
        dep("Claude Code", "v1.0.0", "up-to-date"),
        dep("acme-web", "v1.1.0", "up-to-date"),
      ],
    });

    expect(targetRow("Claude Code")).toHaveTextContent("v1.0.0");
    expect(within(targetRow("acme-web")).getByText("v1.1.0")).toHaveClass(
      "font-mono",
    );
  });

  it("marks an in-sync target with a status word, not colour alone", () => {
    // The mark carries its word as its name: colour is never the only carrier of
    // meaning.
    renderPane({ deployments: [dep("Claude Code", "v1.0.0", "up-to-date")] });

    expect(
      within(targetRow("Claude Code")).getByRole("img", { name: "Up to date" }),
    ).toHaveTextContent("✓");
  });

  // One release is stated once: the Behind mark marks only a skill this release
  // changed (#956).
  it("marks a target Behind where this skill changed, naming only its release", () => {
    renderPane({ deployments: [dep("Claude Code", "v1.0.0", "behind")] });

    expect(targetRow("Claude Code")).toHaveTextContent("v1.0.0");
    expect(
      within(targetRow("Claude Code")).getByRole("img", { name: "Behind" }),
    ).toBeInTheDocument();
  });

  it("leaves a skill the release did not change without a Behind mark", () => {
    renderPane({ deployments: [dep("Claude Code", "v1.0.0", "up-to-date")] });

    expect(screen.queryByRole("img", { name: "Behind" })).toBeNull();
  });

  it("carries each target's own actions behind its ⋮", async () => {
    const onSelect = vi.fn();
    renderPane({
      deployments: [dep("acme-web", "v1.0.0", "behind")],
      targetItems: (deployment) => [
        { label: "Update target", onSelect: () => onSelect(deployment.label) },
      ],
    });

    await userEvent.click(
      within(targetRow("acme-web")).getByRole("button", {
        name: "Actions for acme-web",
      }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Update target" }),
    );
    expect(onSelect).toHaveBeenCalledWith("acme-web");
  });

  it("states the skill is deployed nowhere when it has no targets", () => {
    renderPane({ deployments: [] });

    expect(
      screen.getByText(
        "Not deployed to any target. Select Deploy skill to choose a target.",
      ),
    ).toBeInTheDocument();
  });

  it("holds off on 'Not deployed' while the reach is still unconfirmed", () => {
    // Every read is pending or unreadable, so an empty list is "not known yet",
    // never "deployed nowhere".
    renderPane({ deployments: [], unconfirmed: true });

    expect(
      screen.queryByText(/Not deployed to any target\./i),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Loading the deploy-state…/i)).toBeInTheDocument();
  });

  it("warns the reach is incomplete when a target is still unconfirmed alongside known deployments", () => {
    // One read succeeded while another is pending: the known target shows, but the
    // pane still warns more targets may exist.
    renderPane({
      deployments: [dep("Claude Code", "v1.0.0", "up-to-date")],
      unconfirmed: true,
    });

    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText(/Loading more targets…/i)).toBeInTheDocument();
  });

  it("closes when the close control is activated", async () => {
    const onClose = vi.fn();
    renderPane({ onClose });

    await userEvent.click(screen.getByRole("button", { name: /close/i }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes when Escape is pressed", async () => {
    // The pane is not a modal, but a keyboard user still needs an escape route.
    const onClose = vi.fn();
    renderPane({ onClose });

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("moves focus to its heading when it opens", () => {
    // Focus lands somewhere predictable and a screen reader announces the skill.
    renderPane({});

    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: /tdd/i }),
    );
  });

  it("gives the heading a visible focus ring, so a keyboard user can see where focus landed", () => {
    // Focus must be visible: the standard focus-visible ring.
    renderPane({});

    expect(screen.getByRole("heading", { name: /tdd/i })).toHaveClass(
      "focus-visible:outline-2",
      "focus-visible:outline-offset-2",
      "focus-visible:outline-blue-9",
    );
  });

  it("returns focus to the element that opened it once it closes", () => {
    // Return target is the caller-supplied lookup, not `document.activeElement`
    // (corrupted by the pane's own mount effect) — resolved fresh at close
    // time since the row can remount behind a narrowing search.
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = renderPane({ getTriggerElement: () => trigger });
    unmount();

    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("puts the deploy and remove actions at the foot, after the reach they change", () => {
    // The foot of the pane (#992), so a long Deployed-to list never hides them.
    renderPane({
      deployments: [dep("Claude Code", "v1.0.0", "up-to-date")],
      footItems: [
        DEPLOY,
        {
          label: "Remove from all 2 targets",
          danger: true,
          onSelect: () => {},
        },
      ],
    });

    const reach = screen.getByText("Claude Code");
    const deploy = screen.getByRole("button", { name: "Deploy skill" });
    const remove = screen.getByRole("button", {
      name: "Remove from all 2 targets",
    });
    const follows = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(reach, deploy)).toBe(true);
    expect(follows(deploy, remove)).toBe(true);
    // #1065: one primary, danger stays danger, 32px controls.
    expect(deploy).toHaveClass("bg-gray-12", "h-control");
    expect(remove).toHaveClass("text-red-11", "h-control");
  });

  // #1066: the foot reads no coloured or mono status line, and no picker.
  it("holds only its controls at the foot", () => {
    renderPane({ deployments: [dep("Claude Code", "v1.0.0", "up-to-date")] });

    const foot = screen.getByRole("button", { name: "Deploy skill" })
      .parentElement as HTMLElement;
    expect(foot.textContent).toBe("Deploy skill");
    expect(within(pane()).queryByRole("combobox")).toBeNull();
    expect(within(pane()).queryByText(/In sync/)).toBeNull();
  });

  it("names the skill's type in its plain word", () => {
    renderPane({});

    expect(screen.getByText("Type").nextElementSibling).toHaveTextContent(
      "Skill",
    );
    expect(screen.getByText("Type").nextElementSibling).not.toHaveClass(
      "font-mono",
    );
  });
});
