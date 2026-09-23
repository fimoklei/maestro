import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "../ui/button";
import { SettingsRow } from "./settings-row";

describe("SettingsRow", () => {
  it("states its name and one sentence beside it", () => {
    render(
      <SettingsRow
        name="Change Harness location"
        description="Point Maestro at another local Harness clone."
        control={<Button>Change Harness location</Button>}
      />,
    );

    expect(
      screen.getByText("Point Maestro at another local Harness clone."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Change Harness location" }),
    ).toBeInTheDocument();
  });

  it("sets a machine value in Geist Mono with the whole value on hover", () => {
    const path = "/home/me/workspaces/very-long-team-name/agent-harness";
    render(<SettingsRow name="Local clone" value={path} />);

    expect(screen.getByText("Local clone")).toBeInTheDocument();
    const value = screen.getByText(path);
    expect(value).toHaveAttribute("title", path);
    expect(value).toHaveClass("font-mono", "truncate");
  });

  it("sets a plain word in the interface font", () => {
    render(
      <SettingsRow
        name="GitHub repository"
        value="GitHub repository not read"
        machine={false}
      />,
    );

    expect(screen.getByText("GitHub repository not read")).not.toHaveClass(
      "font-mono",
    );
  });
});
