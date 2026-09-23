import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "../ui/button";
import { SettingsRow } from "./settings-row";
import { SettingsSection } from "./settings-section";

describe("SettingsSection", () => {
  it("heads its rows at level 2, under the page's own title", () => {
    render(
      <SettingsSection title="Location">
        <SettingsRow name="Local clone" value="/home/me/agent-harness" />
      </SettingsSection>,
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "Location" }),
    ).toBeInTheDocument();
  });

  it("names its region by its heading, with the action beside it", () => {
    render(
      <SettingsSection
        title="Connected Harness"
        action={<Button>Re-read Inventory</Button>}
      >
        <SettingsRow name="Local clone" value="/home/me/agent-harness" />
      </SettingsSection>,
    );

    const region = screen.getByRole("region", { name: "Connected Harness" });
    expect(
      within(region).getByRole("button", { name: "Re-read Inventory" }),
    ).toBeInTheDocument();
    expect(within(region).getByText("Local clone")).toBeInTheDocument();
  });
});
