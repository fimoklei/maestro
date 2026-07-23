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
});
