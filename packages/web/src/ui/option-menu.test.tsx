import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OptionMenu, type OptionSection } from "./option-menu";

const sections = (
  over: {
    onChange?: (value: string) => void;
    onToggle?: (v: string) => void;
  } = {},
): OptionSection[] => [
  {
    kind: "radio",
    label: "Type",
    options: [
      { value: "all", label: "All" },
      { value: "skill", label: "Skills" },
    ],
    value: "all",
    onChange: over.onChange ?? (() => {}),
  },
  {
    kind: "check",
    label: "Status",
    options: [
      { value: "behind", label: "Behind" },
      { value: "unknown", label: "Unknown" },
    ],
    values: new Set(["behind"]),
    onToggle: over.onToggle ?? (() => {}),
  },
];

function renderMenu(props: Partial<React.ComponentProps<typeof OptionMenu>>) {
  return render(
    <OptionMenu
      label="Filter"
      icon={<svg aria-hidden="true" />}
      sections={sections()}
      {...props}
    />,
  );
}

describe("OptionMenu", () => {
  it("names the control by its action alone while nothing is set", () => {
    renderMenu({});

    expect(screen.getByRole("button", { name: "Filter" })).toBeInTheDocument();
  });

  it("shows how many options are set, in its name and on the control", () => {
    renderMenu({ count: 2 });

    const trigger = screen.getByRole("button", { name: "Filter, 2 active" });
    expect(trigger).toHaveTextContent("2");
  });

  it("lists each section's options with their current state", async () => {
    renderMenu({});

    await userEvent.click(screen.getByRole("button", { name: "Filter" }));

    expect(
      await screen.findByRole("menuitemradio", { name: "All" }),
    ).toBeChecked();
    expect(
      screen.getByRole("menuitemradio", { name: "Skills" }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("menuitemcheckbox", { name: "Behind" }),
    ).toBeChecked();
    expect(
      screen.getByRole("menuitemcheckbox", { name: "Unknown" }),
    ).not.toBeChecked();
  });

  it("reports the chosen option of a single-choice section", async () => {
    const onChange = vi.fn();
    renderMenu({ sections: sections({ onChange }) });

    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    await userEvent.click(
      await screen.findByRole("menuitemradio", { name: "Skills" }),
    );

    expect(onChange).toHaveBeenCalledWith("skill");
  });

  it("toggles an option and stays open for the next one", async () => {
    const onToggle = vi.fn();
    renderMenu({ sections: sections({ onToggle }) });

    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    await userEvent.click(
      await screen.findByRole("menuitemcheckbox", { name: "Unknown" }),
    );

    expect(onToggle).toHaveBeenCalledWith("unknown");
    expect(
      screen.getByRole("menuitemcheckbox", { name: "Behind" }),
    ).toBeInTheDocument();
  });

  it("stays focusable, states why and opens nothing while unavailable", async () => {
    renderMenu({ unavailable: "no skills yet" });

    const trigger = screen.getByRole("button", {
      name: "Filter — no skills yet",
    });
    expect(trigger).toHaveAttribute("aria-disabled", "true");

    await userEvent.click(trigger);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
