import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MovementTable } from "./movement-table";

describe("MovementTable", () => {
  it("labels a locally deleted skill as deleted locally", () => {
    render(
      <MovementTable
        movements={[
          { skill: "tdd", state: "pending-promotion", deletion: true },
        ]}
      />,
    );

    expect(screen.getByText("tdd")).toBeInTheDocument();
    expect(screen.getByText("deleted locally")).toBeInTheDocument();
  });

  it("leaves a movement that is not a deletion unlabelled", () => {
    render(
      <MovementTable
        movements={[
          { skill: "lint-rules", state: "pending-promotion", deletion: false },
        ]}
      />,
    );

    expect(screen.getByText("lint-rules")).toBeInTheDocument();
    expect(screen.queryByText("deleted locally")).not.toBeInTheDocument();
  });
});
