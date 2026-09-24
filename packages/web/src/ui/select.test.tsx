import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Select } from "./select";

const OPTIONS = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function Labelled({ onChange }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState("system");
  return (
    <div>
      <span id="theme-name">Interface theme</span>
      <Select
        labelledBy="theme-name"
        value={value}
        options={OPTIONS}
        onValueChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
      />
    </div>
  );
}

describe("Select", () => {
  it("takes its accessible name from the visible label and shows the value", () => {
    render(<Labelled />);

    const select = screen.getByRole("combobox", { name: "Interface theme" });
    expect(select).toHaveTextContent("System");
  });

  it("opens, moves and chooses from the keyboard", async () => {
    const onChange = vi.fn();
    render(<Labelled onChange={onChange} />);
    const select = screen.getByRole("combobox", { name: "Interface theme" });

    select.focus();
    await userEvent.keyboard("{Enter}");
    expect(
      await screen.findByRole("option", { name: "System" }),
    ).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(onChange).toHaveBeenCalledWith("dark");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(select).toHaveTextContent("Dark");
    expect(select).toHaveFocus();
  });
});
