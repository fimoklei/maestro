import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SubListGroup } from "./sub-list-group";

const renderGroup = (open: boolean, onToggle = () => {}) =>
  render(
    <ul aria-label="Deployed skills">
      <li>commit</li>
      <SubListGroup
        label="Up to date"
        count={2}
        open={open}
        onToggle={onToggle}
      >
        <li>tdd</li>
        <li>jobs</li>
      </SubListGroup>
    </ul>,
  );

describe("SubListGroup", () => {
  it("is one button named by its label and count, in the Tab order", async () => {
    renderGroup(false);

    await userEvent.tab();
    const button = screen.getByRole("button", { name: "Up to date, 2" });
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("is the last item of its list and holds no rows while closed", () => {
    renderGroup(false);

    const list = screen.getByRole("list", { name: "Deployed skills" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[1]).toContainElement(
      screen.getByRole("button", { name: "Up to date, 2" }),
    );
  });

  it("holds its rows in a list inside the group item while open, keeping its name", () => {
    renderGroup(true);

    const button = screen.getByRole("button", { name: "Up to date, 2" });
    expect(button).toHaveAttribute("aria-expanded", "true");
    const group = button.closest("li") as HTMLElement;
    const nested = within(group).getByRole("list");
    expect(
      within(nested)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["tdd", "jobs"]);
  });

  it("asks its owner to toggle on a press", async () => {
    const onToggle = vi.fn();
    renderGroup(false, onToggle);

    await userEvent.click(
      screen.getByRole("button", { name: "Up to date, 2" }),
    );
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
