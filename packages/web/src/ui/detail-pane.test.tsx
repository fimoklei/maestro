import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { DetailPane } from "./detail-pane";

type Props = ComponentProps<typeof DetailPane>;

function renderPane(props: Partial<Props> = {}) {
  return render(
    <DetailPane
      title="tdd"
      activeKey="tdd"
      onClose={() => {}}
      getTriggerElement={() => null}
      actions={<button type="button">Deploy skill</button>}
      {...props}
    >
      <p>Test-driven development.</p>
      <input aria-label="Note" />
    </DetailPane>,
  );
}

const pane = () => screen.getByRole("complementary", { name: "tdd detail" });
const heading = () => screen.getByRole("heading", { level: 2, name: "tdd" });

describe("DetailPane", () => {
  it("is a landmark named for its subject, headed by that subject", () => {
    renderPane();

    expect(pane()).toContainElement(heading());
    expect(pane()).toHaveTextContent("Test-driven development.");
  });

  it("puts its actions at the foot, after everything it reads out", () => {
    renderPane();

    const body = screen.getByText("Test-driven development.");
    const action = screen.getByRole("button", { name: "Deploy skill" });
    expect(
      body.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps its actions outside the region that scrolls", () => {
    // A long body never hides them. Whether the region scrolls is a browser
    // measurement (testing.md); jsdom proves only the wiring.
    renderPane();

    const scroller = screen
      .getByText("Test-driven development.")
      .closest(".overflow-y-auto");
    expect(scroller).not.toBeNull();
    expect(scroller).not.toContainElement(
      screen.getByRole("button", { name: "Deploy skill" }),
    );
  });

  it("closes from its close control", async () => {
    const onClose = vi.fn();
    renderPane({ onClose });

    await userEvent.click(
      screen.getByRole("button", { name: "Close tdd detail" }),
    );

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes on Escape", async () => {
    // Not a modal (ADR-0016), but a keyboard user still needs a way back.
    const onClose = vi.fn();
    renderPane({ onClose });

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("moves focus to its heading when it opens, behind a visible ring", () => {
    renderPane();

    expect(heading()).toHaveFocus();
    expect(heading()).toHaveClass("focus-visible:outline-2");
  });

  it("moves focus to the control its opener names instead", () => {
    renderPane({ initialFocus: "input" });

    expect(screen.getByRole("textbox", { name: "Note" })).toHaveFocus();
  });

  it("leaves focus alone when its opener placed it elsewhere", () => {
    const elsewhere = document.createElement("button");
    document.body.appendChild(elsewhere);
    elsewhere.focus();

    renderPane({ initialFocus: null });

    expect(elsewhere).toHaveFocus();
    elsewhere.remove();
  });

  it("returns focus to the element that opened it once it closes", () => {
    // A lookup resolved at close time: the row behind it can remount.
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);

    const { unmount } = renderPane({ getTriggerElement: () => trigger });
    unmount();

    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it("states where its subject sits in the list", () => {
    renderPane({ position: { index: 6, count: 36 }, onPage: () => {} });

    expect(pane()).toHaveTextContent("7 / 36");
    expect(screen.getByText("7 of 36")).toBeInTheDocument();
  });

  it("pages to the next and previous row with the arrow keys", async () => {
    const onPage = vi.fn();
    renderPane({ position: { index: 6, count: 36 }, onPage });

    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{ArrowUp}");

    expect(onPage.mock.calls).toEqual([[1], [-1]]);
  });

  it("stops at either end of the list", async () => {
    const onPage = vi.fn();
    const { unmount } = renderPane({
      position: { index: 0, count: 2 },
      onPage,
    });
    await userEvent.keyboard("{ArrowUp}");
    unmount();

    renderPane({ position: { index: 1, count: 2 }, onPage });
    await userEvent.keyboard("{ArrowDown}");

    expect(onPage).not.toHaveBeenCalled();
  });

  it("leaves the arrow keys to a field inside it", async () => {
    const onPage = vi.fn();
    renderPane({ position: { index: 6, count: 36 }, onPage });

    await userEvent.click(screen.getByRole("textbox", { name: "Note" }));
    await userEvent.keyboard("{ArrowDown}");

    expect(onPage).not.toHaveBeenCalled();
  });

  it("shows no position for a subject the list no longer holds", () => {
    renderPane({ position: null, onPage: () => {} });

    expect(pane()).not.toHaveTextContent("/");
  });
});
