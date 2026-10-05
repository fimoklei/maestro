import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { sentence } from "../test-utils";
import { machine, named, phrase } from "./phrase";
import { showSuccess, ToastHost } from "./toast";

describe("the toast host", () => {
  it("shows the sentence it was given", async () => {
    render(<ToastHost />);

    showSuccess("Removed grilling v1.4.0 from maestro");

    expect(
      await screen.findByText(sentence("Removed grilling v1.4.0 from maestro")),
    ).toBeInTheDocument();
  });

  it("sets the names apart inside the same sentence", async () => {
    render(<ToastHost />);

    showSuccess(
      phrase`Removed ${named("tdd")} ${machine("v1.4.0")} from ${named("maestro")}.`,
    );

    const name = await screen.findByText("tdd");
    expect(name.tagName).toBe("B");
    expect(name.parentElement).toHaveTextContent(
      "Removed tdd v1.4.0 from maestro.",
    );
  });

  it("announces it, so it is not read twice by the screen's status region", async () => {
    render(<ToastHost />);

    showSuccess("Removed tdd v1.4.0 from maestro");

    await screen.findByText(sentence("Removed tdd v1.4.0 from maestro"));
    expect(document.querySelector("[aria-live]")).not.toBeNull();
  });

  it("keeps each success on its own line", async () => {
    render(<ToastHost />);

    showSuccess("Removed tdd v1.4.0 from maestro");
    showSuccess("Removed grilling v1.4.0 from maestro");

    await waitFor(() => {
      expect(
        screen.getByText(sentence("Removed tdd v1.4.0 from maestro")),
      ).toBeInTheDocument();
      expect(
        screen.getByText(sentence("Removed grilling v1.4.0 from maestro")),
      ).toBeInTheDocument();
    });
  });
});
