import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { showSuccess, ToastHost } from "./toast";

describe("the toast host", () => {
  it("shows the sentence it was given", async () => {
    render(<ToastHost />);

    showSuccess("Removed grilling v1.4.0 from maestro");

    expect(
      await screen.findByText("Removed grilling v1.4.0 from maestro"),
    ).toBeInTheDocument();
  });

  it("announces it, so it is not read twice by the screen's status region", async () => {
    render(<ToastHost />);

    showSuccess("Removed tdd v1.4.0 from maestro");

    await screen.findByText("Removed tdd v1.4.0 from maestro");
    expect(document.querySelector("[aria-live]")).not.toBeNull();
  });

  it("keeps each success on its own line", async () => {
    render(<ToastHost />);

    showSuccess("Removed tdd v1.4.0 from maestro");
    showSuccess("Removed grilling v1.4.0 from maestro");

    await waitFor(() => {
      expect(
        screen.getByText("Removed tdd v1.4.0 from maestro"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Removed grilling v1.4.0 from maestro"),
      ).toBeInTheDocument();
    });
  });
});
