import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImportDialog } from "./import-dialog";

// Deep enough that the head of the path says nothing the reader needs.
const DEEP = "/Users/me/Projects/harness-sandbox/incoming-skills/release-notes";

function renderDialog(source: string | null) {
  render(
    <ImportDialog
      source={source}
      name="release-notes"
      load={{ kind: "idle" }}
      onPickSource={vi.fn()}
      onNameChange={vi.fn()}
      onClose={vi.fn()}
      onImport={vi.fn()}
      importing={false}
      importError={null}
      imported={null}
    />,
  );
}

describe("ImportDialog", () => {
  it("shows the tail of a deep source path and carries the whole path in its title", () => {
    renderDialog(DEEP);

    const shown = screen.getByTitle(DEEP);
    expect(shown).toHaveTextContent("incoming-skills/release-notes");
    expect(shown).not.toHaveTextContent("/Users/me/Projects");
  });

  it("says nothing has been picked before a folder is chosen", () => {
    renderDialog(null);

    expect(screen.getByText("No folder picked yet.")).toBeInTheDocument();
  });
});
