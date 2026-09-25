import { render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";
import { ReachCard } from "./reach-card";

type Deployment = ComponentProps<typeof ReachCard>["deployments"][number];

const deployment = (
  label: string,
  status: Deployment["status"] = "up-to-date",
): Deployment => ({ label, release: "v1.4.0", status });

describe("ReachCard", () => {
  it("expands the Targets number into each target, its release and its reading", () => {
    render(
      <ReachCard
        count={2}
        deployments={[deployment("Global"), deployment("maestro", "behind")]}
        unreadable={false}
      />,
    );

    expect(screen.getByText("Deployed to 2 targets")).toBeInTheDocument();
    const [global, maestro] = screen.getAllByRole("listitem");
    expect(global).toHaveTextContent("Global");
    expect(global).toHaveTextContent("v1.4.0");
    expect(global).toHaveTextContent("Up to date");
    expect(maestro).toHaveTextContent("Behind");
  });

  it("lists three targets and names the row as the way to the rest", () => {
    render(
      <ReachCard
        count={5}
        deployments={["a", "b", "c", "d", "e"].map((label) =>
          deployment(label),
        )}
        unreadable={false}
      />,
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(
      screen.getByText("2 more. Select the row to see all 5 targets."),
    ).toBeInTheDocument();
  });

  it("says a skill is deployed nowhere without an empty list", () => {
    render(<ReachCard count={0} deployments={[]} unreadable={false} />);

    expect(screen.getByText("Not deployed to any target.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("says when a target could not be read, so Unknown has its reason", () => {
    render(
      <ReachCard count={1} deployments={[deployment("Global")]} unreadable />,
    );

    expect(
      screen.getByText("Some targets could not be read."),
    ).toBeInTheDocument();
  });

  it("holds no control", () => {
    const { container } = render(
      <ReachCard
        count={1}
        deployments={[deployment("Global", "unknown")]}
        unreadable
      />,
    );

    expect(
      within(container).queryAllByRole("button").length +
        within(container).queryAllByRole("link").length,
    ).toBe(0);
  });
});
