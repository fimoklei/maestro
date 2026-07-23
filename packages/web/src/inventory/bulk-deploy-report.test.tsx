import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BulkDeployReport } from "./bulk-deploy-report";
import type { BulkDeployReportView } from "./bulk-deploy-report-view";

// The success/attention branch of the view union — every existing test drives
// a real report, never the distinct "error" branch (its own test below).
type ReportView = Extract<
  BulkDeployReportView,
  { tone: "success" | "attention" }
>;

function view(overrides: Partial<ReportView> = {}): ReportView {
  return {
    tone: "success",
    targetLabel: "Global",
    deployed: [],
    updated: [],
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

  it("names a skill that replaced a behind copy as updated to latest", () => {
    render(
      <BulkDeployReport
        view={view({
          updated: [{ name: "tdd", version: "v1.2.0" }],
          counts: { deployed: 1, skipped: 0, attention: 0, failed: 0 },
        })}
      />,
    );

    expect(
      screen.getByRole("list", { name: /updated to latest/i }),
    ).toHaveTextContent("tdd");
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

  it("shows a distinct failure message when the request itself failed, never a summary of counts", () => {
    render(
      <BulkDeployReport
        view={{
          tone: "error",
          targetLabel: "Global",
          message: "The deploy request failed.",
        }}
      />,
    );

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/failed/i);
    expect(status).not.toHaveTextContent(/deployed/i);
    expect(status).not.toHaveTextContent(/0 skipped/i);
  });
});
