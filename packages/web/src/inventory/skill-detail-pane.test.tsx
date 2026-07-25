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
  onClose?: () => void;
}) {
  return render(
    <SkillDetailPane
      primitive={tdd}
      deployments={overrides.deployments ?? []}
      unconfirmed={overrides.unconfirmed ?? false}
      deployAction={
        overrides.deployAction ?? <button type="button">Deploy</button>
      }
      onClose={overrides.onClose ?? (() => {})}
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

  it("stays in view and scrolls on its own while the table scrolls past it", () => {
    // A static pane scrolled away with the table: at main.scrollTop = 900 its top
    // sat at -794px, taking the deploy control off-screen with it. Steering has to
    // stay next to the state that demands it (PRODUCT.md principle 4), so the pane
    // sticks to the viewport and scrolls its own overflow. jsdom cannot measure
    // scroll geometry; the stuck pane is proven in the browser.
    renderPane({});

    const pane = screen.getByRole("complementary", { name: /tdd detail/i });
    expect(pane).toHaveClass("sticky");
    expect(pane).toHaveClass("max-h-[100cqh]");
  });
});
