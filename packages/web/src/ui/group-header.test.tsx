import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GroupHeader } from "./group-header";

function renderHeader() {
  return render(
    <table>
      <tbody>
        <GroupHeader label="Repositories" count={5} columnCount={4} />
      </tbody>
    </table>,
  );
}

describe("GroupHeader", () => {
  it("names the group and counts its rows in one cell across the table", () => {
    renderHeader();

    const cell = within(screen.getByRole("row")).getByRole("gridcell");
    expect(cell).toHaveTextContent("Repositories 5");
    expect(cell).toHaveAttribute("colspan", "4");
  });
});
