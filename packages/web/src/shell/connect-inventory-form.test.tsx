import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConnectInventoryForm } from "./connect-inventory-form";

describe("ConnectInventoryForm", () => {
  it("calls onBrowse when the browse action is activated", async () => {
    const onBrowse = vi.fn();
    render(
      <ConnectInventoryForm
        path=""
        onPathChange={vi.fn()}
        onSubmit={vi.fn()}
        onBrowse={onBrowse}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /browse/i }));
    expect(onBrowse).toHaveBeenCalledOnce();
  });

  it("omits the browse action when onBrowse is not provided", () => {
    render(
      <ConnectInventoryForm
        path=""
        onPathChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /browse/i }),
    ).not.toBeInTheDocument();
  });

  // Cloning can run for minutes with nothing else on screen, so the wait is
  // stated in sentences — never a percentage, and with nothing to cancel (#554).
  it("states progress as a sentence while the connect is running", () => {
    render(
      <ConnectInventoryForm
        path="https://github.com/fimoklei/agent-harness"
        onPathChange={vi.fn()}
        onSubmit={vi.fn()}
        isPending
      />,
    );
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/cloned/i);
    expect(status).not.toHaveTextContent(/%/);
    expect(
      screen.queryByRole("button", { name: /cancel/i }),
    ).not.toBeInTheDocument();
  });

  it("shows no progress sentence when nothing is running", () => {
    render(
      <ConnectInventoryForm
        path=""
        onPathChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("accepts a GitHub url in the same field, without a second input", () => {
    render(
      <ConnectInventoryForm
        path="https://github.com/fimoklei/agent-harness"
        onPathChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.getByLabelText(/inventory path/i)).toHaveValue(
      "https://github.com/fimoklei/agent-harness",
    );
  });

  it("renders the given path as the field value", () => {
    render(
      <ConnectInventoryForm
        path="/home/me/agent-harness"
        onPathChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/inventory path/i)).toHaveValue(
      "/home/me/agent-harness",
    );
  });

  it("gives the path input a tokenized amber focus-visible ring, not the UA default", () => {
    render(
      <ConnectInventoryForm
        path=""
        onPathChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    const input = screen.getByLabelText(/inventory path/i);
    expect(input).toHaveClass(
      "focus-visible:outline-2",
      "focus-visible:outline-offset-2",
      "focus-visible:outline-amber",
    );
    // outline-none would set --tw-outline-style:none, which outline-2 reads —
    // silently hiding the ring. Guard against a regression that re-adds it.
    expect(input).not.toHaveClass("outline-none");
  });

  it("reports edits to the path via onPathChange instead of owning the value", () => {
    const onPathChange = vi.fn();
    render(
      <ConnectInventoryForm
        path=""
        onPathChange={onPathChange}
        onSubmit={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText(/inventory path/i), {
      target: { value: "/x" },
    });
    expect(onPathChange).toHaveBeenCalledWith("/x");
  });

  it("renders a recoverable refusal as a card with its own call to action", async () => {
    const onAction = vi.fn();
    render(
      <ConnectInventoryForm
        path="/home/me/skills-only-folder"
        onPathChange={vi.fn()}
        onSubmit={vi.fn()}
        notice={{
          level: "error",
          label: "No GitHub origin",
          message: "Server explanation of the refusal.",
          action: { label: "browse again…", onClick: onAction },
        }}
        onBrowse={vi.fn()}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/No GitHub origin/i);
    expect(alert).toHaveTextContent("Server explanation of the refusal.");
    await userEvent.click(
      screen.getByRole("button", { name: /browse again/i }),
    );
    expect(onAction).toHaveBeenCalledOnce();
  });

  // The occupied destination is refused, never worked around — the way out is
  // another parent folder (#555).
  it("offers another folder when the destination is occupied", async () => {
    const onAction = vi.fn();
    render(
      <ConnectInventoryForm
        path="https://github.com/fimoklei/agent-harness"
        onPathChange={vi.fn()}
        onSubmit={vi.fn()}
        notice={{
          level: "error",
          label: "destination folder is taken",
          message: "Maestro never renames or deletes what it finds.",
          action: { label: "choose another folder…", onClick: onAction },
        }}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /choose another folder/i }),
    );
    expect(onAction).toHaveBeenCalledOnce();
  });

  describe("the clone destination", () => {
    it("shows the folder a pasted GitHub url would clone into", () => {
      render(
        <ConnectInventoryForm
          path="https://github.com/fimoklei/agent-harness"
          onPathChange={vi.fn()}
          onSubmit={vi.fn()}
          cloneParent="/Users/me/Projects"
          onChooseParent={vi.fn()}
        />,
      );

      expect(
        screen.getByText("/Users/me/Projects/agent-harness"),
      ).toBeInTheDocument();
    });

    it("names the home folder while no parent has been chosen", () => {
      render(
        <ConnectInventoryForm
          path="https://github.com/fimoklei/agent-harness"
          onPathChange={vi.fn()}
          onSubmit={vi.fn()}
          onChooseParent={vi.fn()}
        />,
      );

      expect(
        screen.getByText("your home folder/agent-harness"),
      ).toBeInTheDocument();
    });

    it("shows no destination for a local path, which is not cloned", () => {
      render(
        <ConnectInventoryForm
          path="/Users/me/agent-harness"
          onPathChange={vi.fn()}
          onSubmit={vi.fn()}
          onChooseParent={vi.fn()}
        />,
      );

      expect(screen.queryByText(/clone into/i)).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /change folder/i }),
      ).not.toBeInTheDocument();
    });

    it("opens the parent picker from the destination row", async () => {
      const onChooseParent = vi.fn();
      render(
        <ConnectInventoryForm
          path="https://github.com/fimoklei/agent-harness"
          onPathChange={vi.fn()}
          onSubmit={vi.fn()}
          onChooseParent={onChooseParent}
        />,
      );

      await userEvent.click(
        screen.getByRole("button", { name: /change folder/i }),
      );
      expect(onChooseParent).toHaveBeenCalledOnce();
    });
  });

  // One offer on the same gate: no second screen, no mode button (#556).
  it("offers the scaffold in place, naming the repository it would write to", async () => {
    const onAccept = vi.fn();
    render(
      <ConnectInventoryForm
        path="https://github.com/fimoklei/team-harness"
        onPathChange={vi.fn()}
        onSubmit={vi.fn()}
        notice={{
          level: "info",
          label: "not a Harness yet",
          message: "That GitHub repository has no apm.yml.",
          detail: "/home/me/team-harness",
          action: { label: "Scaffold the Harness", onClick: onAccept },
        }}
      />,
    );

    const offer = screen.getByRole("status");
    expect(offer).toHaveTextContent(/not a harness yet/i);
    expect(offer).toHaveTextContent("That GitHub repository has no apm.yml.");
    expect(offer).toHaveTextContent("/home/me/team-harness");
    // The field stays editable and submittable beside the offer.
    expect(screen.getByLabelText(/inventory path/i)).not.toHaveAttribute(
      "aria-invalid",
    );
    expect(
      screen.getByRole("button", { name: /^connect inventory$/i }),
    ).toBeEnabled();

    await userEvent.click(
      screen.getByRole("button", { name: /scaffold the harness/i }),
    );
    expect(onAccept).toHaveBeenCalledOnce();
  });

  it("disables the offer while the scaffold is running", () => {
    render(
      <ConnectInventoryForm
        path="https://github.com/fimoklei/team-harness"
        onPathChange={vi.fn()}
        onSubmit={vi.fn()}
        notice={{
          level: "info",
          label: "not a Harness yet",
          message: "That GitHub repository has no apm.yml.",
          detail: "/home/me/team-harness",
          action: {
            label: "Scaffolding…",
            onClick: vi.fn(),
            disabled: true,
          },
        }}
        submitDisabled
      />,
    );

    expect(screen.getByRole("button", { name: /scaffolding/i })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: /scaffold the harness/i }),
    ).not.toBeInTheDocument();
    // A scaffold writes, commits and pushes. A connect started beside it would
    // race it for the one inventory path, so submit goes down with it (#556).
    expect(
      screen.getByRole("button", { name: /^connect inventory$/i }),
    ).toBeDisabled();
  });

  it("shows a plain error rather than an offer when no offer is given", () => {
    render(
      <ConnectInventoryForm
        path="/home/me/empty"
        onPathChange={vi.fn()}
        onSubmit={vi.fn()}
        notice={{
          level: "error",
          label: "GitHub refused the push",
          message: "The commit is safe in the clone.",
        }}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(/GitHub refused/i);
    expect(
      screen.queryByRole("button", { name: /scaffold the harness/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps the plain error text for errors other than no-usable-origin", () => {
    render(
      <ConnectInventoryForm
        path=""
        onPathChange={vi.fn()}
        onSubmit={vi.fn()}
        notice={{
          level: "error",
          label: "not a Harness",
          message: "That folder has no apm.yml.",
        }}
        onBrowse={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(/no apm\.yml/i);
    expect(
      screen.queryByRole("button", { name: /browse again/i }),
    ).not.toBeInTheDocument();
  });

  it("pairs the validation error with a glyph so colour is never the only signal", () => {
    render(
      <ConnectInventoryForm
        path=""
        onPathChange={vi.fn()}
        onSubmit={vi.fn()}
        notice={{
          level: "error",
          label: "no folder at that path",
          message: "No directory exists at that path.",
        }}
        onBrowse={vi.fn()}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("No directory exists at that path.");
    // The Never-Colour-Alone rule: a sighted user who can't tell red from amber
    // still gets a visual glyph. (The glyph is aria-hidden; the non-visual
    // signal is the message text under role="alert", covered above.)
    expect(alert.textContent).toMatch(/✕/);
  });

  it("renders the validation error above the submit button, next to the field", () => {
    render(
      <ConnectInventoryForm
        path=""
        onPathChange={vi.fn()}
        onSubmit={vi.fn()}
        notice={{
          level: "error",
          label: "no folder at that path",
          message: "No directory exists at that path.",
        }}
        onBrowse={vi.fn()}
      />,
    );

    const alert = screen.getByRole("alert");
    const submit = screen.getByRole("button", { name: /^connect inventory$/i });
    // The error describes the field, so it belongs under it — above the submit
    // action, not stranded below it. DOCUMENT_POSITION_FOLLOWING means the
    // submit button comes after the alert in document order.
    expect(
      alert.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("returns focus to the invalid field when a submit fails (issue #214)", () => {
    const { rerender } = render(
      <ConnectInventoryForm
        path="/home/me/not-an-inventory"
        onPathChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    const input = screen.getByLabelText(/inventory path/i);
    expect(input).not.toHaveFocus();

    // The parent rejects the submit and feeds back an error — focus must land
    // on the field the user has to fix, not drop to the page.
    rerender(
      <ConnectInventoryForm
        path="/home/me/not-an-inventory"
        onPathChange={vi.fn()}
        onSubmit={vi.fn()}
        notice={{
          level: "error",
          label: "not a Harness",
          message: "That folder has no apm.yml.",
        }}
      />,
    );
    expect(input).toHaveFocus();
  });

  it("labels the submit button 'Connect inventory' by default", () => {
    render(
      <ConnectInventoryForm
        path=""
        onPathChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /^connect inventory$/i }),
    ).toBeInTheDocument();
  });

  it("uses a caller-supplied submit label so re-pointing reads honestly", () => {
    render(
      <ConnectInventoryForm
        path=""
        onPathChange={vi.fn()}
        onSubmit={vi.fn()}
        submitLabel="Set Harness location"
      />,
    );
    expect(
      screen.getByRole("button", { name: /^set harness location$/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^connect inventory$/i }),
    ).not.toBeInTheDocument();
  });

  it("submits the path passed in via props, not stale internal state", async () => {
    const onSubmit = vi.fn();
    render(
      <ConnectInventoryForm
        path="/home/me/agent-harness"
        onPathChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /connect/i }));
    expect(onSubmit).toHaveBeenCalledWith("/home/me/agent-harness");
  });

  it("submits the path when the keyboard activates the form", async () => {
    const onSubmit = vi.fn();
    render(
      <ConnectInventoryForm
        path="/home/me/agent-harness"
        onPathChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    screen.getByLabelText(/inventory path/i).focus();
    await userEvent.keyboard("{Enter}");

    expect(onSubmit).toHaveBeenCalledWith("/home/me/agent-harness");
  });

  it("marks a submitted error as invalid and ties it to the field", () => {
    render(
      <ConnectInventoryForm
        path="/home/me/not-a-harness"
        onPathChange={vi.fn()}
        onSubmit={vi.fn()}
        notice={{
          level: "error",
          label: "not a Harness",
          message: "That folder has no apm.yml.",
        }}
      />,
    );

    const input = screen.getByLabelText(/inventory path/i);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "inventory-path-error");
  });
});
