import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BulkDeployReport } from "./bulk-deploy-report";
import type { BulkDeployReportView } from "./bulk-deploy-report-view";

function view(
  overrides: Partial<BulkDeployReportView> = {},
): BulkDeployReportView {
  return {
    tone: "success",
    targetLabel: "Global",
    deployed: [],
    skipped: [],
    attention: [],
    failed: [],
    counts: { deployed: 0, skipped: 0, attention: 0, failed: 0 },
    ...overrides,
  };
}

describe("BulkDeployReport", () => {
  it("summarises the run and names the target", () => {
    render(
      <BulkDeployReport
        view={view({
          deployed: [{ name: "tdd", version: "v1.2.0" }],
          skipped: ["review"],
          counts: { deployed: 1, skipped: 1, attention: 0, failed: 0 },
        })}
      />,
    );

    const summary = screen.getByRole("status");
    expect(summary).toHaveTextContent(/Global/);
    expect(summary).toHaveTextContent(/1 deployed/);
    expect(summary).toHaveTextContent(/1 skipped/);
  });

  it("lists a merged failure line carrying every affected skill", () => {
    render(
      <BulkDeployReport
        view={view({
          tone: "attention",
          failed: [{ error: "auth-required", names: ["tdd", "review"] }],
          counts: { deployed: 0, skipped: 0, attention: 0, failed: 2 },
        })}
      />,
    );

    expect(screen.getByText(/tdd/)).toBeInTheDocument();
    expect(screen.getByText(/review/)).toBeInTheDocument();
  });

  it("offers a force reinstall on a diverged attention row", async () => {
    const onForce = vi.fn();
    render(
      <BulkDeployReport
        view={view({
          tone: "attention",
          attention: [{ name: "tdd", error: "deployed-diverged-from-lock" }],
          counts: { deployed: 0, skipped: 0, attention: 1, failed: 0 },
        })}
        onForce={onForce}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /reinstall fresh tdd/i }),
    );
    expect(onForce).toHaveBeenCalledWith("tdd");
  });
});
