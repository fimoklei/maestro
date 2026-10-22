import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { expectVisibleCause } from "./test-utils";
import { Dialog } from "./ui/dialog";

const blocked = (describedBy: string, around: ReactNode) => {
  render(
    <>
      <button type="button" aria-disabled="true" aria-describedby={describedBy}>
        Delete skill
      </button>
      {around}
    </>,
  );
  return screen.getByRole("button", { name: "Delete skill" });
};

describe("expectVisibleCause", () => {
  it("passes for a blocked control described by visible text", () => {
    const control = blocked("cause", <p id="cause">Checking your clone…</p>);

    expect(() =>
      expectVisibleCause(control, "Checking your clone…"),
    ).not.toThrow();
  });

  it("fails when the description reads other text", () => {
    const control = blocked("cause", <p id="cause">Checking your clone…</p>);

    expect(() =>
      expectVisibleCause(control, "No Harness connected."),
    ).toThrow();
  });

  it("fails when the control is not blocked", () => {
    render(
      <>
        <button type="button" aria-describedby="cause">
          Delete skill
        </button>
        <p id="cause">Checking your clone…</p>
      </>,
    );

    expect(() =>
      expectVisibleCause(
        screen.getByRole("button", { name: "Delete skill" }),
        "Checking your clone…",
      ),
    ).toThrow(/aria-disabled/);
  });

  it("fails when the control has no description", () => {
    render(
      <button type="button" aria-disabled="true">
        Delete skill
      </button>,
    );

    expect(() =>
      expectVisibleCause(
        screen.getByRole("button", { name: "Delete skill" }),
        "Checking your clone…",
      ),
    ).toThrow(/no aria-describedby/);
  });

  it("fails when the description points to a missing element", () => {
    const control = blocked("gone", null);

    expect(() => expectVisibleCause(control, "")).toThrow(/missing/);
  });

  it.each([
    [
      "hidden",
      <p key="p" id="cause" hidden>
        Checking…
      </p>,
    ],
    [
      "aria-hidden",
      <p key="p" id="cause" aria-hidden="true">
        Checking…
      </p>,
    ],
    [
      "sr-only",
      <p key="p" id="cause" className="sr-only">
        Checking…
      </p>,
    ],
    [
      "a hidden ancestor",
      <div key="d" className="sr-only">
        <p id="cause">Checking…</p>
      </div>,
    ],
  ])("fails when the description points to %s text", (_case, around) => {
    const control = blocked("cause", around);

    expect(() => expectVisibleCause(control, "Checking…")).toThrow(/hidden/);
  });

  it("fails when the description points to empty text", () => {
    const control = blocked("cause", <p id="cause"> </p>);

    expect(() => expectVisibleCause(control, "")).toThrow(/empty/);
  });

  it("fails on the dialog's failure slot while no failure shows", () => {
    render(
      <Dialog
        title="Restore research"
        version={null}
        width={480}
        phase="idle"
        action={{
          label: "Restore skill",
          verb: "restore",
          tone: "primary",
          unavailable: { failure: true },
          onRun: vi.fn(),
        }}
        failure={null}
        describedBy={null}
        fieldsChanged={false}
        onClose={vi.fn()}
      >
        <p>Body sentence.</p>
      </Dialog>,
    );

    expect(() =>
      expectVisibleCause(
        screen.getByRole("button", { name: "Restore skill" }),
        "",
      ),
    ).toThrow(/hidden|empty/);
  });
});
