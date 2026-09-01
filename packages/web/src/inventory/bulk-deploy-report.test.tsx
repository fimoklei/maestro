import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HOVER_TRANSITION } from "../ui/hover-transition";
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
  it("gives an unsupported row the same recovery step as a single deploy", () => {
    render(
      <BulkDeployReport
        view={{
          tone: "attention",
          targetLabel: "Global",
          deployed: [],
          updated: [],
          skipped: [],
          attention: [
            {
              name: "tdd",
              error: "deployed-unsupported-package-type",
              packageType: "hybrid",
              forceable: false,
            },
          ],
          failed: [{ error: "deploy-recorded-invalid", names: ["review"] }],
          counts: { deployed: 0, skipped: 0, attention: 1, failed: 1 },
        }}
      />,
    );

    expect(screen.getByText(/\(hybrid\)/)).toBeInTheDocument();
    expect(
      screen.getAllByText(/publish a release, then deploy again/i),
    ).toHaveLength(2);
  });

  it("names a failure the report carries no recovery step for", () => {
    render(
      <BulkDeployReport
        view={view({
          tone: "attention",
          failed: [{ error: "no-supported-tool", names: ["tdd"] }],
          counts: { deployed: 0, skipped: 0, attention: 0, failed: 1 },
        })}
      />,
    );

    expect(screen.getByText("No supported tool")).toBeInTheDocument();
    expect(screen.queryByText("no-supported-tool")).not.toBeInTheDocument();
  });

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
          attention: [
            {
              name: "tdd",
              error: "deployed-diverged-from-lock",
              forceable: true,
            },
          ],
          counts: { deployed: 0, skipped: 0, attention: 1, failed: 0 },
        })}
        onForce={onForce}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /deploy tdd again/i }),
    );
    expect(onForce).toHaveBeenCalledWith("tdd");
  });

  // DESIGN.md §6: a cursor-pointer with no hover step changes the cursor and
  // nothing else. jsdom renders no CSS, so the class strings are the evidence.
  it.each([
    ["success", "hover:text-green-hover"],
    ["attention", "hover:text-amber-hover"],
  ] as const)(
    "moves the %s summary one step up its ramp on hover",
    (tone, hoverClass) => {
      const { container } = render(<BulkDeployReport view={view({ tone })} />);

      const summary = container.querySelector("summary");
      expect(summary?.className).toContain(hoverClass);
      expect(summary?.className).toContain(HOVER_TRANSITION);
    },
  );

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
