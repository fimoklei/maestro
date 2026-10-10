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
        disabled={false}
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

  it("offers a disabled option it will not choose", async () => {
    render(
      <div>
        <span id="target-name">Target</span>
        <Select
          labelledBy="target-name"
          value="repo"
          options={[
            { value: "global", label: "Global", disabled: true },
            { value: "repo", label: "maestro" },
          ]}
          disabled={false}
          onValueChange={vi.fn()}
        />
      </div>,
    );

    screen.getByRole("combobox", { name: "Target" }).focus();
    await userEvent.keyboard("{Enter}");

    expect(
      await screen.findByRole("option", { name: "Global" }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("shows its placeholder while no value is chosen, then the chosen one", async () => {
    function Unchosen() {
      const [value, setValue] = useState<string | null>(null);
      return (
        <div>
          <span id="target-name">Target</span>
          <Select
            labelledBy="target-name"
            value={value}
            placeholder="Choose a target"
            options={[
              { value: "global", label: "Global" },
              { value: "repo", label: "maestro" },
            ]}
            disabled={false}
            onValueChange={setValue}
          />
        </div>
      );
    }
    render(<Unchosen />);
    const select = screen.getByRole("combobox", { name: "Target" });
    expect(select).toHaveTextContent("Choose a target");

    select.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.click(
      await screen.findByRole("option", { name: "maestro" }),
    );

    expect(select).toHaveTextContent("maestro");
    expect(select).not.toHaveTextContent("Choose a target");
  });

  it("is disabled while its dialog runs", async () => {
    render(
      <div>
        <span id="target-name">Target</span>
        <Select
          labelledBy="target-name"
          value="repo"
          options={[{ value: "repo", label: "maestro" }]}
          disabled
          onValueChange={vi.fn()}
        />
      </div>,
    );

    const select = screen.getByRole("combobox", { name: "Target" });
    expect(select).toBeDisabled();
  });
});
