import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { WelcomeView } from "./welcome-view";

function renderView() {
  return render(
    <MemoryRouter initialEntries={["/welcome"]}>
      <Routes>
        <Route path="/welcome" element={<WelcomeView />} />
        <Route path="/welcome/connect" element={<div>connect-step</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("WelcomeView", () => {
  it("shows the welcome heading and a single connect CTA", () => {
    renderView();

    expect(
      screen.getByRole("heading", { name: /connect your central inventory/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /connect inventory/i }),
    ).toBeInTheDocument();
  });

  it("shows the 3-step progress bar with step 1 active", () => {
    renderView();

    const steps = screen.getAllByRole("listitem");
    expect(steps[0]).toHaveAttribute("aria-current", "step");
  });

  it("navigates to the wizard's connect step when the CTA is activated", async () => {
    renderView();

    await userEvent.click(
      screen.getByRole("button", { name: /connect inventory/i }),
    );

    expect(await screen.findByText("connect-step")).toBeInTheDocument();
  });
});
