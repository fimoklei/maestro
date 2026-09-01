import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RegistrationOutcome } from "../registry/use-register-repos";
import { BrowseRunReport } from "./browse-run-report";

// The report's own reading: what the run has done, what it still owes, and
// which line needs the user. Dialog-level wiring lives in
// browse-dialog-reporting.test.tsx.

const registered = (path: string): RegistrationOutcome => ({
  requestedPath: path,
  path,
  ok: true,
  reason: "registered",
});

const skipped = (path: string, reason: string): RegistrationOutcome => ({
  requestedPath: path,
  path,
  ok: false,
  reason: `Skipped · ${reason}`,
});

function rows() {
  return within(
    screen.getByRole("list", { name: /registration results/i }),
  ).getAllByRole("listitem");
}

describe("BrowseRunReport", () => {
  it("lists every repo of the run from the first frame, so the list never grows under the reader", () => {
    render(
      <BrowseRunReport
        isRegistering={true}
        runPaths={["/me/acme-web", "/me/payments-api", "/me/design-system"]}
        outcomes={[registered("/me/acme-web")]}
      />,
    );

    const listed = rows();
    expect(listed).toHaveLength(3);
    expect(listed[1]).toHaveTextContent("/me/payments-api");
    expect(listed[2]).toHaveTextContent("/me/design-system");
  });

  it("names a repo the run has not reached as waiting, not as a result", () => {
    render(
      <BrowseRunReport
        isRegistering={true}
        runPaths={["/me/acme-web", "/me/payments-api"]}
        outcomes={[registered("/me/acme-web")]}
      />,
    );

    expect(rows()[1]).toHaveTextContent("waiting");
    expect(rows()[1]).not.toHaveTextContent("registered");
  });

  it("states how far a run in flight has got", () => {
    render(
      <BrowseRunReport
        isRegistering={true}
        runPaths={["/me/a", "/me/b", "/me/c"]}
        outcomes={[registered("/me/a")]}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("1 of 3");
  });

  it("counts the run without naming a zero", () => {
    render(
      <BrowseRunReport
        isRegistering={false}
        runPaths={["/me/a", "/me/b"]}
        outcomes={[registered("/me/a"), registered("/me/b")]}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("2 registered");
    expect(screen.getByRole("status")).not.toHaveTextContent("skipped");
  });

  it("claims no success when a run had none", () => {
    render(
      <BrowseRunReport
        isRegistering={false}
        runPaths={["/me/b"]}
        outcomes={[skipped("/me/b", "not a directory")]}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("1 skipped");
    expect(screen.getByRole("status")).not.toHaveTextContent("registered");
  });

  it("counts the skipped repos beside the registered ones when a run has both", () => {
    render(
      <BrowseRunReport
        isRegistering={false}
        runPaths={["/me/a", "/me/b"]}
        outcomes={[registered("/me/a"), skipped("/me/b", "not a directory")]}
      />,
    );

    const summary = screen.getByRole("status");
    expect(summary).toHaveTextContent("1 registered");
    expect(summary).toHaveTextContent("1 skipped");
  });

  it("writes a refusal in the danger colour, under the path it refused", () => {
    // DESIGN.md §5 Inputs: an error is danger red with a leading ✕, written
    // directly under what it describes — never amber, which means act.
    render(
      <BrowseRunReport
        isRegistering={false}
        runPaths={["/me/b"]}
        outcomes={[skipped("/me/b", "not a directory")]}
      />,
    );

    const reason = screen.getByText("Skipped · not a directory");
    expect(reason).toHaveClass("text-danger-ink");
    expect(reason.className).not.toMatch(/amber/);
  });

  it("keeps a registered row wordless on screen and named to a screen reader", () => {
    // ✓ plus the summary already say it; a right-hand column of "registered"
    // only buries the one line that needs the reader.
    render(
      <BrowseRunReport
        isRegistering={false}
        runPaths={["/me/a"]}
        outcomes={[registered("/me/a")]}
      />,
    );

    const [row] = rows();
    expect(row).toHaveTextContent("registered");
    expect(screen.getByText("registered")).toHaveClass("sr-only");
  });

  it("names a repo the way the rest of the cockpit does, keeping the full path reachable", () => {
    // Left-anchored truncation drops the segment that tells two clones apart
    // (#211), so the report leans on targetLabel like the sidebar does.
    render(
      <BrowseRunReport
        isRegistering={false}
        runPaths={["/home/me/work/acme-web", "/home/me/play/acme-web"]}
        outcomes={[
          registered("/home/me/work/acme-web"),
          registered("/home/me/play/acme-web"),
        ]}
      />,
    );

    const name = screen.getByText("…/work/acme-web");
    expect(name).toHaveAttribute("title", "/home/me/work/acme-web");
  });

  it("treats the outcomes as the whole run when no run is named", () => {
    render(
      <BrowseRunReport
        isRegistering={false}
        outcomes={[registered("/me/a"), registered("/me/b")]}
      />,
    );

    expect(rows()).toHaveLength(2);
  });

  it("says nothing about a total it has not been given", () => {
    render(<BrowseRunReport isRegistering={true} outcomes={[]} />);

    expect(screen.getByRole("status")).toHaveTextContent(/registering/i);
    expect(screen.getByRole("status")).not.toHaveTextContent(/of 0/);
  });
});
