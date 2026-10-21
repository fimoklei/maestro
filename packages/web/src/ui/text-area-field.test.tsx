import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { sentence } from "../test-utils";
import { machine, phrase } from "./phrase";
import { TextAreaField } from "./text-area-field";

describe("TextAreaField", () => {
  it("names the text area with its visible label and reads out its hint", () => {
    render(
      <TextAreaField
        label="Prompt text"
        hint="Saved exactly as you enter it."
        value=""
        onChange={() => {}}
      />,
    );

    const area = screen.getByRole("textbox", { name: "Prompt text" });
    expect(area.tagName).toBe("TEXTAREA");
    expect(area).toHaveAccessibleDescription("Saved exactly as you enter it.");
    expect(area).not.toHaveClass("outline-none");
  });

  it("states a refusal under the text area and marks it invalid", () => {
    render(
      <TextAreaField
        label="Prompt text"
        error="Enter the prompt text."
        value=""
        onChange={() => {}}
      />,
    );

    const area = screen.getByRole("textbox");
    expect(area).toBeInvalid();
    expect(area).toHaveAccessibleDescription(/Enter the prompt text\./);
  });

  it("sets a path inside the hint as a machine value", () => {
    render(
      <TextAreaField
        label="Prompt text"
        hint={phrase`Saved as ${machine("review-pr.md")}.`}
        value=""
        onChange={() => {}}
      />,
    );

    const hint = screen.getByText(sentence("Saved as review-pr.md."));
    expect(screen.getByRole("textbox")).toHaveAttribute(
      "aria-describedby",
      hint.id,
    );
    expect(screen.getByText("review-pr.md")).toHaveClass("font-mono");
  });

  it("hands each edit to its owner", async () => {
    const onChange = vi.fn();
    render(<TextAreaField label="Prompt text" value="" onChange={onChange} />);

    await userEvent.type(screen.getByRole("textbox"), "a");

    expect(onChange).toHaveBeenCalledWith("a");
  });
});
