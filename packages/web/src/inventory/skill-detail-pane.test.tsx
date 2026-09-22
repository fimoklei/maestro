import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SkillDeployment } from "./skill-deployments";
import { SkillDetailPane } from "./skill-detail-pane";
import type { Primitive } from "./use-inventory";

const tdd: Primitive = {
  type: "skill",
  name: "tdd",
  description: "Test-driven development.",
};

function renderPane(overrides: {
  deployments?: SkillDeployment[];
  unconfirmed?: boolean;
  deployAction?: React.ReactNode;
  removeAction?: React.ReactNode;
  onClose?: () => void;
  getTriggerElement?: (name: string) => HTMLElement | null;
}) {
  return render(
    <SkillDetailPane
      primitive={tdd}
      deployments={overrides.deployments ?? []}
      unconfirmed={overrides.unconfirmed ?? false}
      deployAction={
        overrides.deployAction ?? <button type="button">Deploy</button>
      }
      removeAction={overrides.removeAction ?? null}
      onClose={overrides.onClose ?? (() => {})}
      getTriggerElement={overrides.getTriggerElement ?? (() => null)}
    />,
  );
}

// One row per target: its name, the release it follows, its own reading.
const targetRow = (label: string) =>
  screen
    .getAllByRole("listitem")
    .find((item) => within(item).queryByText(label) !== null);

describe("SkillDetailPane", () => {
  it("names the skill and shows its description", () => {
    renderPane({});

    expect(screen.getByRole("heading", { name: /tdd/i })).toBeInTheDocument();
    expect(screen.getByText("Test-driven development.")).toBeInTheDocument();
  });

  it("names the release each target follows beside its label", () => {
    renderPane({
      deployments: [
        { label: "Claude Code", release: "v1.0.0", status: "up-to-date" },
        { label: "/dev/acme-web", release: "v1.1.0", status: "up-to-date" },
      ],
    });

    expect(targetRow("Claude Code")).toHaveTextContent("v1.0.0");
    expect(targetRow("/dev/acme-web")).toHaveTextContent("v1.1.0");
  });

  it("marks an in-sync target with a status word, not colour alone", () => {
    // An up-to-date copy signalled only by green version text fails users who
    // can't perceive colour (PRODUCT.md: colour is never the only carrier of
    // meaning). The in-sync state must carry a readable word too.
    renderPane({
      deployments: [
        { label: "Claude Code", release: "v1.0.0", status: "up-to-date" },
      ],
    });

    expect(targetRow("Claude Code")).toHaveTextContent("Up to date");
  });

  // One release is stated once (ADR-0031): the row names the release the
  // target follows, and the Behind chip marks only a skill this release
  // actually changed — no per-skill version pair any more (#956).
  it("marks a target Behind where this skill changed, naming only its release", () => {
    renderPane({
      deployments: [
        { label: "Claude Code", release: "v1.0.0", status: "behind" },
      ],
    });

    expect(targetRow("Claude Code")).toHaveTextContent("v1.0.0");
    expect(targetRow("Claude Code")).toHaveTextContent("Behind");
  });

  it("leaves a skill the release did not change without a Behind chip", () => {
    renderPane({
      deployments: [
        { label: "Claude Code", release: "v1.0.0", status: "up-to-date" },
      ],
    });

    expect(screen.queryByText("Behind")).not.toBeInTheDocument();
  });

  it("states the skill is deployed nowhere when it has no targets", () => {
    renderPane({ deployments: [] });

    expect(
      screen.getByText(/Not deployed to any target\./i),
    ).toBeInTheDocument();
  });

  it("holds off on 'Not deployed' while the reach is still unconfirmed (J04)", () => {
    // Every target's deploy-state read is still pending or unreadable, so an empty
    // list is "not known yet", never a confirmed "deployed nowhere" — the same
    // honesty the row's deployed cell keeps.
    renderPane({ deployments: [], unconfirmed: true });

    expect(
      screen.queryByText(/Not deployed to any target\./i),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Loading the deploy-state…/i)).toBeInTheDocument();
  });

  it("warns the reach is incomplete when a target is still unconfirmed alongside known deployments", () => {
    // One target read succeeded while another is still pending or unreadable. The
    // known target must show, but the pane must not pass a partial list off as
    // the whole reach (J04) — so it still warns more targets may exist.
    renderPane({
      deployments: [
        { label: "Claude Code", release: "v1.0.0", status: "up-to-date" },
      ],
      unconfirmed: true,
    });

    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText(/Loading more targets…/i)).toBeInTheDocument();
  });

  it("hosts the deploy action passed to it", () => {
    renderPane({
      deployAction: <button type="button">Deploy →</button>,
    });

    expect(
      screen.getByRole("button", { name: "Deploy →" }),
    ).toBeInTheDocument();
  });

  it("closes when the close control is activated", async () => {
    const onClose = vi.fn();
    renderPane({ onClose });

    await userEvent.click(screen.getByRole("button", { name: /close/i }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes when Escape is pressed", async () => {
    // The pane is not a modal (ADR-0016), but it still needs an escape route:
    // without one a keyboard user who opens it has no way back except tabbing
    // through the whole thing.
    const onClose = vi.fn();
    renderPane({ onClose });

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("moves focus to its heading when it opens", () => {
    // A keyboard user who opens the pane lands somewhere predictable and a
    // screen reader announces the skill's name, instead of focus staying on
    // the row button behind whatever now covers it.
    renderPane({});

    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: /tdd/i }),
    );
  });

  it("gives the heading a visible focus ring, so a keyboard user can see where focus landed", () => {
    // Focus must be visible: the standard focus-visible ring, same as
    // every other focusable control here (Codex review finding).
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
      deployments: [
        { label: "Claude Code", release: "v1.0.0", status: "up-to-date" },
      ],
      deployAction: <button type="button">Deploy</button>,
      removeAction: <button type="button">remove all →</button>,
    });

    const reach = screen.getByText("Claude Code");
    const deploy = screen.getByRole("button", { name: "Deploy" });
    const remove = screen.getByRole("button", { name: "remove all →" });
    const follows = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(reach, deploy)).toBe(true);
    expect(follows(deploy, remove)).toBe(true);
  });

  it("shows no remove action when the caller offers none", () => {
    // The bulk affordance is absent below two targets — the single remove
    // already covers one, and nothing covers zero (#422).
    renderPane({ removeAction: null });

    expect(screen.queryByRole("button", { name: /remove/i })).toBeNull();
  });

  it("names the skill's type in its plain word", () => {
    renderPane({});

    expect(screen.getByText("Type").nextElementSibling).toHaveTextContent(
      "Skill",
    );
  });
});
