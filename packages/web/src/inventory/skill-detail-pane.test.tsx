import { render, screen } from "@testing-library/react";
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

describe("SkillDetailPane", () => {
  it("names the skill and shows its description", () => {
    renderPane({});

    expect(screen.getByRole("heading", { name: /tdd/i })).toBeInTheDocument();
    expect(screen.getByText("Test-driven development.")).toBeInTheDocument();
  });

  it("lists each target the skill is deployed to with its version", () => {
    renderPane({
      deployments: [
        { label: "Claude Code", version: "v1.0.0", status: "up-to-date" },
        { label: "/dev/acme-web", version: "v1.1.0", status: "up-to-date" },
      ],
    });

    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText("v1.0.0")).toBeInTheDocument();
    expect(screen.getByText("/dev/acme-web")).toBeInTheDocument();
    expect(screen.getByText("v1.1.0")).toBeInTheDocument();
  });

  it("marks an in-sync target with a status word, not colour alone", () => {
    // An up-to-date copy signalled only by green version text fails users who
    // can't perceive colour (PRODUCT.md: colour is never the only carrier of
    // meaning). The in-sync state must carry a readable word too.
    renderPane({
      deployments: [
        { label: "Claude Code", version: "v1.0.0", status: "up-to-date" },
      ],
    });

    expect(screen.getByText(/in sync/i)).toBeInTheDocument();
  });

  it("shows the deployed -> latest pair and a behind marker for a behind target", () => {
    renderPane({
      deployments: [
        {
          label: "Claude Code",
          version: "v1.0.0",
          status: "behind",
          latest: "v1.2.0",
        },
      ],
    });

    expect(screen.getByText(/v1\.0\.0 → v1\.2\.0/)).toBeInTheDocument();
    expect(screen.getByText(/behind/i)).toBeInTheDocument();
  });

  it("states the skill is deployed nowhere when it has no targets", () => {
    renderPane({ deployments: [] });

    expect(
      screen.getByText(/not deployed to any target yet/i),
    ).toBeInTheDocument();
  });

  it("holds off on 'not deployed' while the reach is still unconfirmed (J04)", () => {
    // Every target's deploy-state read is still pending or unreadable, so an empty
    // list is "not known yet", never a confirmed "deployed nowhere" — the same
    // honesty the row's deployed cell keeps.
    renderPane({ deployments: [], unconfirmed: true });

    expect(
      screen.queryByText(/not deployed to any target yet/i),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/still reading deploy state/i)).toBeInTheDocument();
  });

  it("warns the reach is incomplete when a target is still unconfirmed alongside known deployments", () => {
    // One target read succeeded while another is still pending or unreadable. The
    // known target must show, but the pane must not pass a partial list off as
    // the whole reach (J04) — so it still warns more targets may exist.
    renderPane({
      deployments: [
        { label: "Claude Code", version: "v1.0.0", status: "up-to-date" },
      ],
      unconfirmed: true,
    });

    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(
      screen.getByText(/more targets may still be loading/i),
    ).toBeInTheDocument();
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
      "focus-visible:outline-amber",
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

  it("keeps the deploy action out of the scrolling reading matter", () => {
    // Description scrolls in its own region so it never pushes the deploy
    // control out of reach. Pane-beside-table layout is browser-measured (testing.md).
    renderPane({ deployAction: <button type="button">Deploy</button> });

    const action = screen.getByRole("button", { name: "Deploy" });
    const pane = screen.getByRole("complementary", { name: /tdd detail/i });
    const scroller = pane.querySelector(".overflow-y-auto");

    expect(scroller).not.toBeNull();
    expect(scroller?.contains(action)).toBe(false);
  });

  it("hosts the remove action under the deploy one, in its own labelled section", () => {
    renderPane({ removeAction: <button type="button">remove all →</button> });

    // Same micro-label shape as Deploy, so the two directions read as a pair.
    expect(screen.getByText("Remove")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "remove all →" }),
    ).toBeInTheDocument();
  });

  it("shows no remove section when the caller offers no remove action", () => {
    // The bulk affordance is absent below two targets — the single remove
    // already covers one, and nothing covers zero (#422).
    renderPane({ removeAction: null });

    expect(screen.queryByText("Remove")).toBeNull();
  });

  it("keeps the remove action out of the scrolling reading matter too", () => {
    // A long deployed-to list must never hide the action that clears it.
    renderPane({ removeAction: <button type="button">remove all →</button> });

    const action = screen.getByRole("button", { name: "remove all →" });
    const pane = screen.getByRole("complementary", { name: /tdd detail/i });

    expect(pane.querySelector(".overflow-y-auto")?.contains(action)).toBe(
      false,
    );
  });
});
