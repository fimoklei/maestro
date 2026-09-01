import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { WelcomeView } from "./welcome-view";

function renderView() {
  return render(
    <MemoryRouter initialEntries={["/welcome"]}>
      <Routes>
        <Route path="/welcome" element={<WelcomeView />} />
        <Route path="/welcome/connect" element={<div>connect-screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("WelcomeView", () => {
  it("opens the document outline with a real h1 and offers a single connect action", () => {
    renderView();

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /inventory not connected/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /connect inventory/i }),
    ).toBeInTheDocument();
  });

  it("navigates to the connect screen when the action is activated", async () => {
    renderView();

    await userEvent.click(
      screen.getByRole("button", { name: /connect inventory/i }),
    );

    expect(await screen.findByText("connect-screen")).toBeInTheDocument();
  });
});
