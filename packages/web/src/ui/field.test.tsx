import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Field } from "./field";

// Label, hint, field, refusal — in that order, because a hint the reader meets
// after the field arrives too late (ADR-0033 §6).

describe("Field", () => {
  it("names the field with its visible label", () => {
    render(<Field label="Folder path" value="" onChange={() => {}} />);

    expect(screen.getByRole("textbox", { name: "Folder path" })).toBeVisible();
  });

  // outline-none sets --tw-outline-style:none, which hides the one shared
  // focus ring every control draws (#227).
  it("never suppresses the focus ring", () => {
    render(<Field label="Folder path" value="" onChange={() => {}} />);

    expect(screen.getByRole("textbox")).not.toHaveClass("outline-none");
  });

  it("marks a field refused by a notice in its slot as invalid", () => {
    render(<Field label="Folder path" value="" onChange={() => {}} invalid />);

    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
  });

  it("puts the hint between the label and the field", () => {
    render(
      <Field
        label="Folder path"
        hint="Maestro reads the folder, it never writes to it."
        value=""
        onChange={() => {}}
      />,
    );

    const label = screen.getByText("Folder path");
    const hint = screen.getByText(
      "Maestro reads the folder, it never writes to it.",
    );
    const input = screen.getByRole("textbox");

    expect(label.compareDocumentPosition(hint)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(hint.compareDocumentPosition(input)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("reads the hint out with the field", () => {
    render(
      <Field
        label="Folder path"
        hint="Maestro reads the folder, it never writes to it."
        value=""
        onChange={() => {}}
      />,
    );

    expect(screen.getByRole("textbox")).toHaveAccessibleDescription(
      "Maestro reads the folder, it never writes to it.",
    );
  });

  it("states a refusal as one line under the field", () => {
    render(
      <Field
        label="Folder path"
        error="Not a Git repository. Register a valid repository."
        value="/Users/me/scratch"
        onChange={() => {}}
      />,
    );

    const input = screen.getByRole("textbox");
    const error = screen.getByText(
      /Not a Git repository. Register a valid repository./,
    );
    expect(input.compareDocumentPosition(error)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(error).toHaveTextContent("✕");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(
      /Not a Git repository. Register a valid repository./,
    );
  });

  it("carries no refusal while the field is valid", () => {
    render(<Field label="Folder path" value="/Users/me" onChange={() => {}} />);

    expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText(/✕/)).toBeNull();
  });

  it("reads the hint and the refusal out together", () => {
    render(
      <Field
        label="Folder path"
        hint="Maestro reads the folder, it never writes to it."
        error="Not a Git repository. Register a valid repository."
        value="/Users/me/scratch"
        onChange={() => {}}
      />,
    );

    expect(screen.getByRole("textbox")).toHaveAccessibleDescription(
      /Maestro reads the folder.*Not a Git repository/s,
    );
  });
});
