import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UnfinishedOperationHead } from "./unfinished-operation-head";

const pending = {
  kind: "deploy" as const,
  release: "v0.3.4",
  desired: ["tdd"],
};

describe("UnfinishedOperationHead", () => {
  it("names the release an unfinished deploy would install again", () => {
    render(<UnfinishedOperationHead pending={pending} onRetry={() => {}} />);

    expect(screen.getByText("Deploy incomplete")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Part of the selection is not on disk. Select Retry deploy to install release v0.3.4 again.",
      ),
    ).toBeInTheDocument();
  });

  it("states what a half-landed update landed", () => {
    render(
      <UnfinishedOperationHead
        pending={{
          kind: "update",
          release: "v0.3.4",
          desired: ["tdd", "grill"],
        }}
        primitives={[
          { type: "skill", name: "tdd", version: "v0.3.4" },
          { type: "skill", name: "grill", version: "v0.3.2" },
        ]}
        onRetry={() => {}}
      />,
    );

    expect(
      screen.getByText("Update to v0.3.4 incomplete: 1 of 2 skills landed."),
    ).toBeInTheDocument();
  });

  it("offers Retry removal on an unfinished removal", () => {
    render(
      <UnfinishedOperationHead
        pending={{ ...pending, kind: "remove" }}
        onRetry={() => {}}
      />,
    );

    expect(screen.getByText("Removal incomplete")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Retry removal" }),
    ).toBeInTheDocument();
  });

  it("offers Retry update on an unfinished update", () => {
    render(
      <UnfinishedOperationHead
        pending={{ ...pending, kind: "update" }}
        onRetry={() => {}}
      />,
    );

    expect(screen.getByText("Update incomplete")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The update is incomplete. Select Retry update to run the same release again.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Retry update" }),
    ).toBeInTheDocument();
  });

  it("runs the retry once the reader selects it", async () => {
    const onRetry = vi.fn();
    render(<UnfinishedOperationHead pending={pending} onRetry={onRetry} />);

    await userEvent.click(screen.getByRole("button", { name: "Retry deploy" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("blocks a second retry while one is running", () => {
    render(
      <UnfinishedOperationHead
        pending={pending}
        onRetry={() => {}}
        isRetrying
      />,
    );

    expect(screen.getByRole("button", { name: "Retry deploy" })).toBeDisabled();
  });
});
