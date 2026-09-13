import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PinnedPerSkillHead } from "./pinned-per-skill-head";

describe("PinnedPerSkillHead", () => {
  it("tells the reader the way to one release", () => {
    render(<PinnedPerSkillHead pinned={[{ release: "v0.3.1", skills: 3 }]} />);

    expect(screen.getByText("3 skills at v0.3.1")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Release not adopted. Select Remove skill for each, then Deploy skill.",
      ),
    ).toBeInTheDocument();
  });

  it("states it in meta lines, not in a notice it has no action for", () => {
    render(<PinnedPerSkillHead pinned={[{ release: "v0.3.1", skills: 3 }]} />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
